/**
 * sharp for the web version (WEB-PRD Phase 6): the same chainable API, for what the desktop uses of it, on the web
 * version's image library (src/web/image/), which runs the same in a browser and in Node.
 *
 *   input     a Buffer/Uint8Array of a PNG, JPEG, WebP or SVG (`density` for SVG), a file path, { create: … },
 *             or raw pixels ({ raw: { width, height, channels } })
 *   steps     resize, extract, extend, flatten, composite, ensureAlpha, removeAlpha, withMetadata, rotate (no angle),
 *             applied in the order they are called
 *   output    png, jpeg, webp, raw; toBuffer (with resolveWithObject), toFile; metadata
 *
 * Differences that do not matter to Spadewick: JPEGs are always written without chroma subsampling (4:4:4, what print
 * images ask for; sharp's default is 4:2:0), ICC profiles in pictures are not applied (pictures are taken as sRGB), and
 * a grey picture is read as RGB.
 */
import { Buffer } from 'buffer'
import { readFileSync, writeFileSync } from 'fs'
import { raster, create, withChannels, flatten, extract, extend, resize, composite } from '../image/raster.js'
import { decode, dimensions, encodePng, encodeJpeg, encodeWebp, formatOf, unsupported } from '../image/codecs.js'

/**
 * sharp works in other threads, so the program goes on while a picture is made: a long export still hears "how far are
 * you?" and "stop". Here the work is done in this thread, so each operation first lets waiting messages and timers run.
 */
const yieldTurn = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0)))

const isBytes = v => v instanceof Uint8Array || v instanceof ArrayBuffer || ArrayBuffer.isView(v)
const toBytes = v => (v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength))

class Sharp {
  constructor(input, options = {}) {
    if (input !== undefined && input !== null && typeof input !== 'string' && !isBytes(input) && !(typeof input === 'object' && input.create)) {
      throw new Error('Unsupported input: expected a Buffer, a file path or { create }')
    }
    this._input = input
    this._options = { ...options, ...(input && typeof input === 'object' && input.create ? { create: input.create } : {}) }
    this._steps = []
    this._output = null       // { format, options }
    this._density = undefined
  }

  clone() {
    const c = new Sharp(this._input, this._options)
    c._steps = [...this._steps]
    c._output = this._output
    c._density = this._density
    return c
  }

  _step(fn) { this._steps.push(fn); return this }

  // -------------------------------------------------------------------------
  // Steps
  // -------------------------------------------------------------------------

  resize(width, height, options) {
    let o
    if (width !== null && typeof width === 'object') o = { ...width }
    else o = { ...(options ?? {}), width: width ?? undefined, height: height ?? undefined }
    return this._step(r => resize(r, o))
  }

  extract({ left, top, width, height }) { return this._step(r => extract(r, { left, top, width, height })) }

  extend(options) {
    const o = typeof options === 'number' ? { top: options, bottom: options, left: options, right: options } : options
    return this._step(r => extend(r, o))
  }

  flatten(options = {}) { return this._step(r => flatten(r, options.background ?? '#000000')) }
  ensureAlpha() { return this._step(r => withChannels(r, 4)) }
  removeAlpha() { return this._step(r => withChannels(r, 3)) }

  composite(layers) {
    return this._step(async r => {
      const prepared = []
      for (const l of layers ?? []) {
        const top = await new Sharp(l.input, l.raw ? { raw: l.raw } : l.density ? { density: l.density } : {})._raster()
        let left = l.left, y = l.top
        if (left === undefined || y === undefined) { left = Math.round((r.width - top.width) / 2); y = Math.round((r.height - top.height) / 2) }
        prepared.push({ raster: top, left, top: y })
      }
      return composite(r, prepared)
    })
  }

  rotate(angle) {
    if (angle && angle % 360 !== 0) throw new Error('Rotation by an angle is not available in the web version')
    return this
  }

  withMetadata(options = {}) { if (options.density) this._density = options.density; return this }
  keepMetadata() { return this }
  toColourspace(space) {
    const sp = String(space ?? 'srgb').toLowerCase()
    if (sp === 'b-w' || sp === 'grey16' || sp === 'gray') { this._grey = true; return this }
    if (!/^s?rgb$/.test(sp)) throw new Error(`The colour space ${space} is not available in the web version`)
    this._grey = false
    return this
  }
  greyscale(on = true) { this._grey = !!on; return this }
  grayscale(on = true) { return this.greyscale(on) }
  toColorspace(space) { return this.toColourspace(space) }

  // -------------------------------------------------------------------------
  // Output
  // -------------------------------------------------------------------------

  png(options = {}) { this._output = { format: 'png', options }; return this }
  jpeg(options = {}) { this._output = { format: 'jpeg', options }; return this }
  webp(options = {}) { this._output = { format: 'webp', options }; return this }
  raw() { this._output = { format: 'raw', options: {} }; return this }
  toFormat(format, options) {
    const f = String(format).toLowerCase().replace('jpg', 'jpeg')
    if (!['png', 'jpeg', 'webp', 'raw'].includes(f)) throw new Error(`The format ${format} is not available in the web version`)
    this._output = { format: f, options: options ?? {} }
    return this
  }

  /** The input as bytes, or null for create/raw. */
  _bytes() {
    if (this._options.create || this._options.raw) return null
    if (typeof this._input === 'string') return toBytes(readFileSync(this._input))
    if (isBytes(this._input)) return toBytes(this._input)
    throw new Error('Input file is missing')
  }

  /** The input decoded: { raster, format, density }. */
  async _decoded() {
    if (this._decodedCache) return this._decodedCache
    const { create: c, raw } = this._options
    let out
    if (c) out = { raster: create(c.width, c.height, c.channels ?? 4, c.background), format: 'raw' }
    else if (raw) {
      const bytes = isBytes(this._input) ? toBytes(this._input) : toBytes(readFileSync(this._input))
      let r = raster(raw.width, raw.height, raw.channels, new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, raw.width * raw.height * raw.channels))
      if (raw.channels === 1 || raw.channels === 2) {     // grey: as RGB(A)
        const g = r, out2 = raster(g.width, g.height, raw.channels === 2 ? 4 : 3)
        for (let p = 0; p < g.width * g.height; p++) { const v = g.data[p * raw.channels]; out2.data.set(raw.channels === 2 ? [v, v, v, g.data[p * 2 + 1]] : [v, v, v], p * out2.channels) }
        r = out2
      }
      out = { raster: r, format: 'raw' }
    } else out = await decode(this._bytes(), { density: this._options.density })
    this._decodedCache = out
    return out
  }

  async _raster() {
    let r = (await this._decoded()).raster
    for (const step of this._steps) r = await step(r)
    if (this._grey) {
      // luminance (Rec. 709, as libvips), kept as RGB until it is written: one channel then
      const g = raster(r.width, r.height, r.channels, Uint8ClampedArray.from(r.data))
      for (let i = 0; i < g.data.length; i += g.channels) { const y = 0.2126 * g.data[i] + 0.7152 * g.data[i + 1] + 0.0722 * g.data[i + 2]; g.data[i] = g.data[i + 1] = g.data[i + 2] = y }
      r = g
    }
    return r
  }

  /** One channel (and alpha) for a grey picture, as it is written. */
  _greyData(r) {
    const per = r.channels === 4 ? 2 : 1, out = new Uint8Array(r.width * r.height * per)
    for (let p = 0; p < r.width * r.height; p++) { out[p * per] = r.data[p * r.channels]; if (per === 2) out[p * 2 + 1] = r.data[p * 4 + 3] }
    return { data: out, channels: per }
  }

  async metadata() {
    await yieldTurn()
    const { create: c, raw } = this._options
    if (c) return { format: 'raw', width: c.width, height: c.height, channels: c.channels ?? 4, hasAlpha: (c.channels ?? 4) === 4, space: 'srgb' }
    if (raw) return { format: 'raw', width: raw.width, height: raw.height, channels: raw.channels, hasAlpha: raw.channels === 4 || raw.channels === 2, space: 'srgb' }
    const bytes = this._bytes()
    if (!formatOf(bytes)) throw unsupported()
    const d = await dimensions(bytes, { density: this._options.density })
    return { format: d.format, width: d.width, height: d.height, channels: d.channels ?? (d.hasAlpha ? 4 : 3), hasAlpha: d.hasAlpha, space: d.space ?? 'srgb', ...(d.density ? { density: d.density } : {}), size: bytes.length }
  }

  async _encode() {
    await yieldTurn()
    const decoded = await this._decoded()
    const r = await this._raster()
    let format = this._output?.format
    if (!format) format = ['png', 'jpeg', 'webp'].includes(decoded.format) ? decoded.format : 'png'   // as the input; SVG and made pictures become PNG
    const o = this._output?.options ?? {}
    const density = this._density
    let data
    if (format === 'png') data = encodePng(r, { compressionLevel: o.compressionLevel ?? 6, density })
    else if (format === 'jpeg') data = encodeJpeg(withChannels(r, 3), { quality: o.quality ?? 80, density })
    else if (format === 'webp') data = await encodeWebp(r, { quality: o.quality ?? 80, lossless: !!o.lossless })
    else data = this._grey ? this._greyData(r).data : new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength)
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    const channels = format === 'jpeg' ? 3 : this._grey ? this._greyData(r).channels : r.channels
    return { data: buffer, info: { format, width: r.width, height: r.height, channels, premultiplied: false, size: buffer.length } }
  }

  async toBuffer(options = {}) {
    const out = await this._encode()
    return options.resolveWithObject ? out : out.data
  }

  async toFile(path) {
    const ext = String(path).toLowerCase().match(/\.(png|jpe?g|webp)$/)
    if (!this._output && ext) this._output = { format: ext[1].replace('jpg', 'jpeg'), options: {} }
    const { data, info } = await this._encode()
    writeFileSync(path, data)
    return info
  }
}

export default function sharp(input, options) {
  return new Sharp(input, options)
}
sharp.cache = () => {}
sharp.concurrency = () => 1
sharp.simd = () => false
sharp.versions = { vips: 'web' }
