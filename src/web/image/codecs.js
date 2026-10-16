/**
 * Reading and writing picture files for the web version's image library (WEB-PRD Phase 6), the same in a browser and
 * in Node:
 *   PNG   fast-png (JavaScript), with the resolution (pHYs) read and written
 *   JPEG  jpeg-js (JavaScript): CMYK and Adobe JPEGs are read; written as 4:4:4 (no chroma subsampling), with the
 *         resolution in the JFIF header
 *   WebP  libwebp compiled to WebAssembly (@jsquash/webp)
 *   SVG   drawn with resvg (the web version's drawing engine) at `density` dots per inch, 72 being 1 px per SVG unit
 * Decoded pictures are rasters (raster.js): 8 bits, RGB or RGBA.
 */
import { decode as decodePngFile, encode as encodePngFile, convertIndexedToRgb } from 'fast-png'
import jpeg from 'jpeg-js'
import decodeWebpFile, { init as initWebpDecode } from '@jsquash/webp/decode.js'
import encodeWebpFile, { init as initWebpEncode } from '@jsquash/webp/encode.js'
import { raster } from './raster.js'
import { crc32 } from '../../main/zip.js'

// ---------------------------------------------------------------------------
// What a file is
// ---------------------------------------------------------------------------

const ascii = (b, from, to) => String.fromCharCode(...b.subarray(from, to))

export function formatOf(bytes) {
  const b = bytes
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp'
  if (b.length >= 6 && ascii(b, 0, 4) === 'GIF8') return 'gif'
  const head = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 4096))).replace(/^﻿/, '').trimStart()
  if (head.startsWith('<') && /<svg[\s>]/i.test(head + new TextDecoder().decode(b.subarray(4096, 65536)))) return 'svg'
  return null
}

export const unsupported = () => new Error('Input buffer contains unsupported image format')

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

function decodePng(bytes) {
  const png = decodePngFile(bytes)
  let { width, height, depth, channels } = png
  let data = png.data
  if (png.palette) {
    data = convertIndexedToRgb(png)
    channels = data.length / (width * height)
    depth = 8
  }
  // 16 bits: the high byte
  let d8 = data
  if (depth === 16) { d8 = new Uint8ClampedArray(data.length); for (let i = 0; i < data.length; i++) d8[i] = data[i] >> 8 }
  else if (depth < 8) {
    // 1, 2 or 4 bits of grey, packed: spread to 8 bits
    const max = (1 << depth) - 1, rowBytes = Math.ceil(width * channels * depth / 8)
    d8 = new Uint8ClampedArray(width * height * channels)
    for (let y = 0; y < height; y++) for (let x = 0; x < width * channels; x++) {
      const bit = x * depth, byte = data[y * rowBytes + (bit >> 3)]
      d8[y * width * channels + x] = ((byte >> (8 - depth - (bit & 7))) & max) * 255 / max
    }
  }
  // a single transparent colour (tRNS on grey or RGB)
  const key = !png.palette && png.transparency?.length ? [...png.transparency].map(v => (depth === 16 ? v >> 8 : depth < 8 ? v * 255 / ((1 << depth) - 1) : v)) : null
  const hasAlpha = channels === 2 || channels === 4 || !!key
  const out = raster(width, height, hasAlpha ? 4 : 3)
  const o = out.data
  for (let p = 0, n = width * height; p < n; p++) {
    const i = p * channels, q = p * out.channels
    let r, g, b, a = 255
    if (channels <= 2) { r = g = b = d8[i]; if (channels === 2) a = d8[i + 1] }
    else { r = d8[i]; g = d8[i + 1]; b = d8[i + 2]; if (channels === 4) a = d8[i + 3] }
    if (key && (channels <= 2 ? r === key[0] : r === key[0] && g === key[1] && b === key[2])) a = 0
    o[q] = r; o[q + 1] = g; o[q + 2] = b
    if (out.channels === 4) o[q + 3] = a
  }
  const res = png.resolution
  const density = res && res.unit === 1 && res.x ? Math.round(res.x * 0.0254) : undefined
  return { raster: out, density }
}

/** The chunk that says the resolution: pixels per metre. */
function pHYs(dpi) {
  const ppm = Math.round(dpi / 0.0254)
  const chunk = new Uint8Array(4 + 4 + 9 + 4)
  const v = new DataView(chunk.buffer)
  v.setUint32(0, 9)
  chunk.set([0x70, 0x48, 0x59, 0x73], 4)       // pHYs
  v.setUint32(8, ppm); v.setUint32(12, ppm); chunk[16] = 1
  v.setUint32(17, crc32(chunk.subarray(4, 17)))
  return chunk
}

export function encodePng(r, { compressionLevel = 6, density } = {}) {
  const bytes = encodePngFile({ width: r.width, height: r.height, data: new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength), depth: 8, channels: r.channels }, { zlib: { level: compressionLevel } })
  if (!density) return bytes
  const ihdrEnd = 8 + 4 + 4 + 13 + 4              // signature, then the IHDR chunk
  const chunk = pHYs(density)
  const out = new Uint8Array(bytes.length + chunk.length)
  out.set(bytes.subarray(0, ihdrEnd), 0)
  out.set(chunk, ihdrEnd)
  out.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length)
  return out
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

/**
 * What a JPEG's header says: its size, its components (count and ids), the Adobe marker's colour transform
 * (0: none — RGB or CMYK as they are; 1: YCbCr; 2: YCCK) and the JFIF resolution in dots per inch.
 */
export function jpegHeader(b) {
  const out = { width: 0, height: 0, components: 0, ids: [], adobeTransform: null, density: undefined }
  let p = 2
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) { p++; continue }
    const marker = b[p + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue }
    const len = (b[p + 2] << 8) | b[p + 3]
    const seg = p + 4
    if (marker === 0xe0 && ascii(b, seg, seg + 4) === 'JFIF') {
      const units = b[seg + 7], x = (b[seg + 8] << 8) | b[seg + 9]
      out.density = units === 1 ? x : units === 2 ? Math.round(x * 2.54) : undefined
    } else if (marker === 0xee && ascii(b, seg, seg + 5) === 'Adobe') {
      out.adobeTransform = b[seg + 11]
    } else if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      out.height = (b[seg + 1] << 8) | b[seg + 2]
      out.width = (b[seg + 3] << 8) | b[seg + 4]
      out.components = b[seg + 5]
      for (let i = 0; i < out.components; i++) out.ids.push(b[seg + 6 + i * 3])
    } else if (marker === 0xda) break
    p += 2 + len
  }
  return out
}

function decodeJpeg(bytes) {
  const head = jpegHeader(bytes)
  // three components written as RGB (an Adobe marker without a transform, or components named R G B, as libjpeg reads them):
  // jpeg-js would take them for YCbCr
  const rgb = head.components === 3 && (head.adobeTransform === 0 || String.fromCharCode(...head.ids) === 'RGB')
  const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: false, maxResolutionInMP: 400, maxMemoryUsageInMB: 2048, ...(rgb ? { colorTransform: false } : {}) })
  return { raster: raster(img.width, img.height, 3, new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength)), density: head.density, cmyk: head.components === 4 }
}

export function encodeJpeg(r, { quality = 80, density } = {}) {
  // jpeg-js takes RGBA and writes every channel at full resolution (4:4:4)
  const n = r.width * r.height
  const rgba = new Uint8Array(n * 4)
  for (let p = 0; p < n; p++) {
    const i = p * r.channels, o = p * 4
    rgba[o] = r.data[i]; rgba[o + 1] = r.data[i + 1]; rgba[o + 2] = r.data[i + 2]; rgba[o + 3] = 255
  }
  const out = new Uint8Array(jpeg.encode({ data: rgba, width: r.width, height: r.height }, Math.max(1, Math.min(100, quality))).data)
  if (density && out[2] === 0xff && out[3] === 0xe0) {
    out[13] = 1                                     // dots per inch
    out[14] = density >> 8; out[15] = density & 0xff
    out[16] = density >> 8; out[17] = density & 0xff
  }
  return out
}

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------

/** Where WebAssembly cannot be found by the codec itself (Node, in the tests): give it the compiled modules. */
export async function initWebp({ decoder, encoder } = {}) {
  if (decoder) await initWebpDecode(decoder)
  if (encoder) await initWebpEncode(encoder)
}

async function decodeWebp(bytes) {
  const img = await decodeWebpFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  const data = new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  let opaque = true
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { opaque = false; break }
  const rgba = raster(img.width, img.height, 4, data)
  if (!opaque) return { raster: rgba }
  const rgb = raster(img.width, img.height, 3)
  for (let p = 0, n = img.width * img.height; p < n; p++) { rgb.data[p * 3] = data[p * 4]; rgb.data[p * 3 + 1] = data[p * 4 + 1]; rgb.data[p * 3 + 2] = data[p * 4 + 2] }
  return { raster: rgb }
}

export async function encodeWebp(r, { quality = 80, lossless = false } = {}) {
  const n = r.width * r.height
  const rgba = new Uint8ClampedArray(n * 4)
  for (let p = 0; p < n; p++) {
    const i = p * r.channels, o = p * 4
    rgba[o] = r.data[i]; rgba[o + 1] = r.data[i + 1]; rgba[o + 2] = r.data[i + 2]; rgba[o + 3] = r.channels === 4 ? r.data[i + 3] : 255
  }
  return new Uint8Array(await encodeWebpFile({ data: rgba, width: r.width, height: r.height, colorSpace: 'srgb' }, { quality, lossless: lossless ? 1 : 0, exact: lossless ? 1 : 0 }))
}

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

async function decodeSvg(bytes, density = 72) {
  const [{ Resvg }, { defaultFontFiles }] = await Promise.all([import('../shims/resvg.js'), import('../../main/fontFiles.js')])
  const svg = new TextDecoder().decode(bytes)
  const rendered = new Resvg(svg, { fitTo: { mode: 'zoom', value: density / 72 }, font: { loadSystemFonts: false, fontFiles: defaultFontFiles(svg) } }).render()
  return { raster: raster(rendered.width, rendered.height, 4, new Uint8ClampedArray(rendered.pixels)), density }
}

/** A picture file → { raster, format, density }. */
export async function decode(bytes, { density } = {}) {
  const format = formatOf(bytes)
  switch (format) {
    case 'png': return { ...decodePng(bytes), format }
    case 'jpeg': return { ...decodeJpeg(bytes), format }
    case 'webp': return { ...(await decodeWebp(bytes)), format }
    case 'svg': return { ...(await decodeSvg(bytes, density)), format }
    default: throw unsupported()
  }
}

/** The size of a picture without decoding all of it, where the file says it (PNG, WebP); otherwise decoded. */
export async function dimensions(bytes, opts) {
  const format = formatOf(bytes)
  if (format === 'png') {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const colorType = bytes[25]
    return { format, width: v.getUint32(16), height: v.getUint32(20), hasAlpha: colorType === 4 || colorType === 6 || hasChunk(bytes, 'tRNS'), density: decodeDensityPng(bytes) }
  }
  if (format === 'jpeg') {
    // as libvips: the components the file has (a CMYK JPEG has four), without decoding the picture
    const h = jpegHeader(bytes)
    return { format, width: h.width, height: h.height, hasAlpha: false, density: h.density, channels: h.components === 4 ? 4 : h.components === 1 ? 1 : 3, space: h.components === 4 ? 'cmyk' : h.components === 1 ? 'b-w' : 'srgb' }
  }
  const { raster: r, density } = await decode(bytes, opts)
  return { format, width: r.width, height: r.height, hasAlpha: r.channels === 4, density }
}

function hasChunk(b, name) {
  let p = 8
  while (p + 8 <= b.length) {
    const len = (b[p] << 24 | b[p + 1] << 16 | b[p + 2] << 8 | b[p + 3]) >>> 0
    const type = ascii(b, p + 4, p + 8)
    if (type === name) return true
    if (type === 'IDAT' || type === 'IEND') return false
    p += 12 + len
  }
  return false
}

function decodeDensityPng(b) {
  let p = 8
  while (p + 8 <= b.length) {
    const len = (b[p] << 24 | b[p + 1] << 16 | b[p + 2] << 8 | b[p + 3]) >>> 0
    const type = ascii(b, p + 4, p + 8)
    if (type === 'pHYs' && b[p + 16] === 1) return Math.round(((b[p + 8] << 24 | b[p + 9] << 16 | b[p + 10] << 8 | b[p + 11]) >>> 0) * 0.0254)
    if (type === 'IDAT') return undefined
    p += 12 + len
  }
  return undefined
}
