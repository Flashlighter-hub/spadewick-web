/**
 * The drawing helper of the web version (WEB-PRD Phase 5): what src/main/rasterWorker.js is on the desktop, a separate
 * worker that draws one design at a time, so that a drawing that crashes the engine (or never ends) takes only this
 * worker down. safeRaster.js then starts a new one and tries a plainer form of the drawing, as on the desktop.
 *
 * In:  { id, svg, options, fonts: [{ path, bytes? }] }   fonts in order; bytes only the first time a path is sent
 * Out: { id, png }, { id, error } (resvg refused the drawing), or { id, crashed } (the engine broke: this worker ends)
 */
import { Resvg } from '@resvg/resvg-wasm'
import { loadResvg } from './resvg.js'
import wasmUrl from '@resvg/resvg-wasm/index_bg.wasm?url'

const ready = loadResvg(fetch(wasmUrl))
const fonts = new Map()   // path -> bytes

self.onmessage = async ({ data: { id, svg, options, fonts: given } }) => {
  await ready
  for (const f of given ?? []) if (f.bytes) fonts.set(f.path, f.bytes)
  const opts = given ? { ...options, font: { ...options.font, fontBuffers: given.map(f => fonts.get(f.path)) } } : options
  let png
  try {
    png = new Resvg(svg, opts).render().asPng()
  } catch (err) {
    // the engine itself broke (a Rust panic is a WebAssembly trap): this worker must not draw again, as a crashed process would not
    if (err instanceof WebAssembly.RuntimeError) { self.postMessage({ id, crashed: String(err.message) }); self.close(); return }
    self.postMessage({ id, error: String(err?.message ?? err) })
    return
  }
  self.postMessage({ id, png }, [png.buffer])
}
