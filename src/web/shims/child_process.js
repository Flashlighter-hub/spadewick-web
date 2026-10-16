/**
 * `child_process` for the core worker (WEB-PRD Phase 5). The desktop draws in a helper process (safeRaster.js forks
 * rasterWorker.js) so that a crash or a drawing that never ends does not take the application with it. In a browser the
 * helper is a worker (src/web/raster/raster.worker.js), with the same messages; `fork` gives an object that behaves
 * like Node's child process as far as safeRaster.js uses it: on('message' | 'exit' | 'error'), send, kill, unref.
 *
 * Fonts: the core gives resvg font file paths; the helper has no files, so their bytes go with the drawing, each one
 * only the first time this helper sees it.
 *
 * Where there are no workers (the tests, in Node), the helper draws in the same thread instead.
 */
import { fontBytes, Resvg } from './resvg.js'

class Listeners {
  constructor() { this.map = new Map() }
  on(event, fn) { if (!this.map.has(event)) this.map.set(event, new Set()); this.map.get(event).add(fn); return this }
  emit(event, ...args) { for (const fn of [...(this.map.get(event) ?? [])]) fn(...args) }
  removeAllListeners() { this.map.clear(); return this }
}

/** resvg's options with the font paths taken out, and the fonts to send ({ path, bytes } the first time). */
function split(options, sent) {
  const files = options?.font?.fontFiles
  if (!files) return { options, fonts: null }
  const { fontFiles, ...font } = options.font
  const fonts = files.map(path => {
    const bytes = fontBytes(path)
    if (sent.get(path) === bytes) return { path }
    sent.set(path, bytes)
    return { path, bytes: bytes.slice() }      // a copy: the original stays with the core
  })
  return { options: { ...options, font }, fonts }
}

class WorkerChild extends Listeners {
  constructor() {
    super()
    this.sent = new Map()
    this.ended = false
    this.channel = { unref() {} }
    this.worker = new Worker(new URL('../raster/raster.worker.js', import.meta.url), { type: 'module', name: 'spadewick-raster' })
    this.worker.onmessage = ({ data }) => {
      if (data.crashed) { this.end(null, 'SIGABRT'); return }
      this.emit('message', data.error ? { id: data.id, error: data.error } : { id: data.id, png: data.png })
    }
    this.worker.onerror = e => { e.preventDefault?.(); this.end(null, 'SIGABRT') }
  }
  send(message) {
    const { options, fonts } = split(message.options, this.sent)
    const transfer = (fonts ?? []).filter(f => f.bytes).map(f => f.bytes.buffer)
    this.worker.postMessage({ id: message.id, svg: message.svg, options, fonts }, transfer)
    return true
  }
  end(code, signal) {
    if (this.ended) return
    this.ended = true
    try { this.worker.terminate() } catch { /* already gone */ }
    this.emit('exit', code, signal)
  }
  kill() { this.end(null, 'SIGTERM'); return true }
  unref() {}
}

class SameThreadChild extends Listeners {
  constructor() { super(); this.channel = { unref() {} } }
  send({ id, svg, options }) {
    queueMicrotask(() => {
      try { this.emit('message', { id, png: new Resvg(svg, options).render().asPng() }) } catch (err) {
        if (err instanceof WebAssembly.RuntimeError) this.emit('exit', null, 'SIGABRT')
        else this.emit('message', { id, error: String(err?.message ?? err) })
      }
    })
    return true
  }
  kill() { return true }
  unref() {}
}

export function fork() {
  return typeof Worker === 'function' ? new WorkerChild() : new SameThreadChild()
}

export default { fork }
