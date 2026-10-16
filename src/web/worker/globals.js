/**
 * What Node gives every module and a browser worker does not (WEB-PRD Phase 1). Imported before any core module.
 */
import { Buffer } from 'buffer'
import { mkdirp } from '../shims/memfs.js'
import { FOLDERS } from '../config.js'

globalThis.Buffer ??= Buffer

if (typeof globalThis.process === 'undefined') {
  globalThis.process = {
    platform: 'web',
    browser: true,
    env: {},
    argv: [],
    versions: {},          // no `node` entry, so libraries do not take their Node code paths
    pid: 1,
    execPath: '/',
    resourcesPath: '/resources',   // the bundled fonts and profile, fetched when read (src/web/resources/resources.js)
    cwd: () => '/',
    nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)),
    kill: () => { const err = new Error('No processes in the web version'); err.code = 'ESRCH'; throw err },
    on() {},
    off() {},
    emitWarning() {},
    hrtime: Object.assign(() => [0, 0], { bigint: () => BigInt(Math.round(performance.now() * 1e6)) }),
    memoryUsage: () => ({ rss: 0, heapUsed: 0, heapTotal: 0, external: 0 })
  }
}

// setImmediate: the core lets waiting messages through during long checks (preflight, text check). A message to
// itself runs after them, without the 4 ms a nested setTimeout would wait.
if (typeof globalThis.setImmediate !== 'function') {
  const waiting = new Map()
  let next = 1
  const channel = new MessageChannel()
  channel.port1.onmessage = ({ data: id }) => { const run = waiting.get(id); waiting.delete(id); run?.() }
  globalThis.setImmediate = (fn, ...args) => { const id = next++; waiting.set(id, () => fn(...args)); channel.port2.postMessage(id); return id }
  globalThis.clearImmediate = id => { waiting.delete(id) }
}

for (const folder of FOLDERS) mkdirp(folder)
