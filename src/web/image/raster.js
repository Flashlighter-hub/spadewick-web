/**
 * Pixel operations of the web version's image library (WEB-PRD Phase 6), on plain arrays, the same in a browser and
 * in Node. They do what the desktop asks of sharp (libvips): resize (Lanczos 3, as sharp does by default, on
 * premultiplied alpha), crop, extend the edges (by a colour, by copying the edge, or by mirroring it), flatten onto a
 * colour, lay pictures over each other, and add or drop the alpha channel.
 *
 * A raster is { width, height, channels: 3 | 4, data: Uint8ClampedArray } (8 bits, sRGB, rows top to bottom).
 */

export const raster = (width, height, channels, data = new Uint8ClampedArray(width * height * channels)) => ({ width, height, channels, data })

function check(width, height) {
  if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0)) throw new Error(`Expected positive integer for width and height but received ${width} × ${height}`)
}

/** A colour as sharp takes it: '#rgb', '#rrggbb', '#rrggbbaa', 'white'…, or { r, g, b, alpha (0–1) }. → [r, g, b, a(0–255)] */
const NAMED = { white: '#ffffff', black: '#000000', transparent: '#00000000', red: '#ff0000', green: '#008000', blue: '#0000ff' }
export function parseColour(c, fallback = [0, 0, 0, 255]) {
  if (c == null) return fallback
  if (typeof c === 'object') return [c.r ?? 0, c.g ?? 0, c.b ?? 0, Math.round((c.alpha ?? 1) * 255)]
  let s = String(c).trim().toLowerCase()
  s = NAMED[s] ?? s
  const hex = /^#([0-9a-f]{3,8})$/.exec(s)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = [...h].map(x => x + x).join('')
    const n = [0, 2, 4, 6].map(i => parseInt(h.slice(i, i + 2) || 'ff', 16))
    return n
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(s)
  if (rgb) {
    const p = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    return [p[0], p[1], p[2], Math.round((p[3] ?? 1) * 255)]
  }
  throw new Error(`Unable to parse colour from string: ${c}`)
}

/** A raster of one colour. */
export function create(width, height, channels, background) {
  check(width, height)
  const [r, g, b, a] = parseColour(background)
  const out = raster(width, height, channels)
  const d = out.data
  for (let i = 0; i < d.length; i += channels) { d[i] = r; d[i + 1] = g; d[i + 2] = b; if (channels === 4) d[i + 3] = a }
  return out
}

/** With an alpha channel (opaque where there was none), or without one (dropped, not flattened: as sharp's removeAlpha). */
export function withChannels(src, channels) {
  if (src.channels === channels) return src
  const out = raster(src.width, src.height, channels)
  const s = src.data, d = out.data
  for (let p = 0, n = src.width * src.height; p < n; p++) {
    const i = p * src.channels, o = p * channels
    d[o] = s[i]; d[o + 1] = s[i + 1]; d[o + 2] = s[i + 2]
    if (channels === 4) d[o + 3] = src.channels === 4 ? s[i + 3] : 255
  }
  return out
}

/** Onto a colour: no alpha left. */
export function flatten(src, background = '#000000') {
  if (src.channels === 3) return src
  const [br, bg, bb] = parseColour(background)
  const out = raster(src.width, src.height, 3)
  const s = src.data, d = out.data
  for (let p = 0, n = src.width * src.height; p < n; p++) {
    const i = p * 4, o = p * 3, a = s[i + 3] / 255
    d[o] = s[i] * a + br * (1 - a)
    d[o + 1] = s[i + 1] * a + bg * (1 - a)
    d[o + 2] = s[i + 2] * a + bb * (1 - a)
  }
  return out
}

/** A part of the picture. */
export function extract(src, { left, top, width, height }) {
  if (!(left >= 0 && top >= 0 && width > 0 && height > 0 && left + width <= src.width && top + height <= src.height)) throw new Error('extract_area: bad extract area')
  const out = raster(width, height, src.channels)
  const rowBytes = width * src.channels
  for (let y = 0; y < height; y++) {
    const from = ((top + y) * src.width + left) * src.channels
    out.data.set(src.data.subarray(from, from + rowBytes), y * rowBytes)
  }
  return out
}

/**
 * Edges added on each side: `extendWith` 'background' (a colour), 'copy' (the edge pixel repeated) or 'mirror' (the picture
 * reflected at its edge, the edge pixel included, as libvips does).
 */
export function extend(src, { top = 0, bottom = 0, left = 0, right = 0, extendWith = 'background', background = { r: 0, g: 0, b: 0, alpha: 1 } } = {}) {
  const colour = parseColour(background)
  const channels = extendWith === 'background' && colour[3] < 255 ? 4 : src.channels
  const base = withChannels(src, channels)
  const W = src.width + left + right, H = src.height + top + bottom
  check(W, H)
  const out = raster(W, H, channels)
  const reflect = (v, n) => { const period = 2 * n; let m = ((v % period) + period) % period; return m < n ? m : period - 1 - m }
  const clamp = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v)
  for (let y = 0; y < H; y++) {
    const sy = y - top
    for (let x = 0; x < W; x++) {
      const sx = x - left
      const o = (y * W + x) * channels
      const inside = sx >= 0 && sy >= 0 && sx < src.width && sy < src.height
      if (!inside && extendWith === 'background') {
        out.data[o] = colour[0]; out.data[o + 1] = colour[1]; out.data[o + 2] = colour[2]; if (channels === 4) out.data[o + 3] = colour[3]
        continue
      }
      const fx = inside ? sx : extendWith === 'mirror' ? reflect(sx, src.width) : clamp(sx, src.width)
      const fy = inside ? sy : extendWith === 'mirror' ? reflect(sy, src.height) : clamp(sy, src.height)
      const i = (fy * src.width + fx) * channels
      for (let c = 0; c < channels; c++) out.data[o + c] = base.data[i + c]
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Resampling
// ---------------------------------------------------------------------------

const sinc = x => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x))
const lanczos3 = x => (Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0)

/** For each output pixel: the first input pixel it reads and the weights of the ones it reads (normalised). */
function contributions(srcSize, dstSize) {
  const scale = srcSize / dstSize
  const filterScale = Math.max(1, scale)
  const support = 3 * filterScale
  const starts = new Int32Array(dstSize), counts = new Int32Array(dstSize)
  const lists = []
  for (let i = 0; i < dstSize; i++) {
    const centre = (i + 0.5) * scale
    const from = Math.max(0, Math.floor(centre - support)), to = Math.min(srcSize - 1, Math.ceil(centre + support))
    const w = []
    let sum = 0
    for (let j = from; j <= to; j++) { const v = lanczos3((j + 0.5 - centre) / filterScale); w.push(v); sum += v }
    if (sum === 0) { w.fill(0); w[Math.min(w.length - 1, Math.max(0, Math.floor(centre) - from))] = 1; sum = 1 }
    starts[i] = from
    counts[i] = w.length
    lists.push(Float32Array.from(w, v => v / sum))
  }
  return { starts, counts, lists }
}

/** To exactly width × height: Lanczos 3 on premultiplied alpha, or nearest neighbour (kernel 'nearest'). */
export function resample(src, width, height, kernel = 'lanczos3') {
  check(width, height)
  if (width === src.width && height === src.height) return src
  const ch = src.channels
  if (kernel === 'nearest') {
    const out = raster(width, height, ch)
    for (let y = 0; y < height; y++) {
      const sy = Math.min(src.height - 1, Math.floor((y + 0.5) * src.height / height))
      for (let x = 0; x < width; x++) {
        const sx = Math.min(src.width - 1, Math.floor((x + 0.5) * src.width / width))
        const i = (sy * src.width + sx) * ch, o = (y * width + x) * ch
        for (let c = 0; c < ch; c++) out.data[o + c] = src.data[i + c]
      }
    }
    return out
  }
  // premultiply, so transparent pixels do not bleed their colour into the edges
  const n = src.width * src.height
  const pre = new Float32Array(n * ch)
  for (let p = 0; p < n; p++) {
    const i = p * ch
    const a = ch === 4 ? src.data[i + 3] / 255 : 1
    pre[i] = src.data[i] * a; pre[i + 1] = src.data[i + 1] * a; pre[i + 2] = src.data[i + 2] * a
    if (ch === 4) pre[i + 3] = src.data[i + 3]
  }
  // across, then down
  const hx = contributions(src.width, width)
  const mid = new Float32Array(width * src.height * ch)
  for (let y = 0; y < src.height; y++) {
    const row = y * src.width
    for (let x = 0; x < width; x++) {
      const w = hx.lists[x], start = hx.starts[x], o = (y * width + x) * ch
      for (let c = 0; c < ch; c++) {
        let v = 0
        for (let k = 0; k < w.length; k++) v += pre[(row + start + k) * ch + c] * w[k]
        mid[o + c] = v
      }
    }
  }
  const vy = contributions(src.height, height)
  const out = raster(width, height, ch)
  for (let y = 0; y < height; y++) {
    const w = vy.lists[y], start = vy.starts[y]
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * ch
      let r = 0, g = 0, b = 0, a = 0
      for (let k = 0; k < w.length; k++) {
        const i = ((start + k) * width + x) * ch
        r += mid[i] * w[k]; g += mid[i + 1] * w[k]; b += mid[i + 2] * w[k]
        if (ch === 4) a += mid[i + 3] * w[k]
      }
      if (ch === 4) {
        const alpha = Math.min(255, Math.max(0, a))
        const f = alpha > 0 ? 255 / alpha : 0
        out.data[o] = r * f; out.data[o + 1] = g * f; out.data[o + 2] = b * f; out.data[o + 3] = alpha
      } else { out.data[o] = r; out.data[o + 1] = g; out.data[o + 2] = b }
    }
  }
  return out
}

/**
 * sharp's resize: `width` and/or `height` (one alone keeps the aspect ratio), `fit` 'cover' (default: fills, cutting what
 * is over, at `position` centre), 'contain' (fits, filling the rest with `background`), 'fill' (stretches), 'inside'
 * (fits, no filling), 'outside' (covers, nothing cut); `withoutEnlargement` keeps a smaller picture as it is.
 */
export function resize(src, { width, height, fit = 'cover', background = { r: 0, g: 0, b: 0, alpha: 1 }, withoutEnlargement = false, kernel } = {}) {
  const W = src.width, H = src.height
  if (!width && !height) return src
  if (!width) width = Math.max(1, Math.round(W * height / H))
  if (!height) height = Math.max(1, Math.round(H * width / W))
  const sx = width / W, sy = height / H
  const big = withoutEnlargement && W <= width && H <= height
  const sized = (w, h) => (big ? src : resample(src, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), kernel))
  switch (fit) {
    case 'fill':
      return big ? src : resample(src, width, height, kernel)
    case 'inside': {
      const s = Math.min(sx, sy)
      if (withoutEnlargement && s >= 1) return src
      return resample(src, Math.max(1, Math.round(W * s)), Math.max(1, Math.round(H * s)), kernel)
    }
    case 'outside': {
      const s = Math.max(sx, sy)
      if (withoutEnlargement && s >= 1) return src
      return resample(src, Math.max(1, Math.round(W * s)), Math.max(1, Math.round(H * s)), kernel)
    }
    case 'contain': {
      const s = Math.min(sx, sy)
      const inner = sized(W * s, H * s)
      if (big) return inner
      const left = Math.floor((width - inner.width) / 2), top = Math.floor((height - inner.height) / 2)
      return extend(inner, { left, top, right: width - inner.width - left, bottom: height - inner.height - top, extendWith: 'background', background })
    }
    default: {   // cover
      const s = Math.max(sx, sy)
      const outer = sized(W * s, H * s)
      if (big) return outer
      const w = Math.min(width, outer.width), h = Math.min(height, outer.height)
      return extract(outer, { left: Math.floor((outer.width - w) / 2), top: Math.floor((outer.height - h) / 2), width: w, height: h })
    }
  }
}

/** Pictures laid over `base` (Porter-Duff "over"), each at { left, top }; parts outside are cut off. */
export function composite(base, layers) {
  const out = raster(base.width, base.height, base.channels, Uint8ClampedArray.from(base.data))
  const ch = out.channels
  for (const { raster: top, left = 0, top: y0 = 0 } of layers) {
    const tc = top.channels
    for (let y = Math.max(0, -y0); y < top.height; y++) {
      const dy = y + y0
      if (dy >= out.height) break
      for (let x = Math.max(0, -left); x < top.width; x++) {
        const dx = x + left
        if (dx >= out.width) break
        const i = (y * top.width + x) * tc, o = (dy * out.width + dx) * ch
        const a = tc === 4 ? top.data[i + 3] / 255 : 1
        if (a === 0) continue
        if (ch === 4) {
          const ba = out.data[o + 3] / 255
          const oa = a + ba * (1 - a)
          for (let c = 0; c < 3; c++) out.data[o + c] = oa ? (top.data[i + c] * a + out.data[o + c] * ba * (1 - a)) / oa : 0
          out.data[o + 3] = oa * 255
        } else {
          for (let c = 0; c < 3; c++) out.data[o + c] = top.data[i + c] * a + out.data[o + c] * (1 - a)
        }
      }
    }
  }
  return out
}
