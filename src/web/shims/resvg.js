/**
 * @resvg/resvg-js in the web version (WEB-PRD Phase 5): the WebAssembly build, with the same class.
 *
 * The desktop hands resvg its fonts as file paths (`font.fontFiles`); the WebAssembly build takes their bytes
 * (`font.fontBuffers`), so the paths are read from the in-memory file system here (and kept, since the same fonts are
 * given for every card). And its PNG is a Buffer, as resvg-js gives it.
 */
import { Resvg as WasmResvg } from '@resvg/resvg-wasm'
import { Buffer } from 'buffer'
import { readFileSync, statSync } from 'fs'

const fonts = new Map()   // path -> { mtimeMs, bytes }

/** The bytes of a font file, read once while the file stays the same. */
export function fontBytes(path) {
  const { mtimeMs } = statSync(path)
  const kept = fonts.get(path)
  if (kept && kept.mtimeMs === mtimeMs) return kept.bytes
  const bytes = new Uint8Array(readFileSync(path))
  fonts.set(path, { mtimeMs, bytes })
  return bytes
}

/** resvg-js options as the WebAssembly build takes them. */
export function wasmOptions(options) {
  const font = options?.font
  if (!font?.fontFiles) return options
  const { fontFiles, ...rest } = font
  return { ...options, font: { ...rest, fontBuffers: fontFiles.map(fontBytes) } }
}

export class Resvg extends WasmResvg {
  constructor(svg, options) {
    super(svg, wasmOptions(options))
  }

  /** As resvg-js: asPng() gives a Buffer (the desktop code calls .toString('base64') on it), not a bare Uint8Array. */
  render() {
    const image = super.render()
    const asPng = image.asPng.bind(image)
    image.asPng = () => { const b = asPng(); return Buffer.from(b.buffer, b.byteOffset, b.byteLength) }
    return image
  }
}

export default { Resvg }
