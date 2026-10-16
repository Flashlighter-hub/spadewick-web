/**
 * The drawing engine, resvg, compiled to WebAssembly (@resvg/resvg-wasm): loaded once per worker that draws.
 */
import { initWasm } from '@resvg/resvg-wasm'

let loading = null

/** Load it (once). `source` is the .wasm: its address in a browser, its bytes in tests. */
export function loadResvg(source) {
  return (loading ??= initWasm(source))
}
