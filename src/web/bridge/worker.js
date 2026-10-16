/**
 * The page's side of the core worker (WEB-PRD §3, Phase 1): starts it, sends it calls and passes on what it says.
 */
import { REMEMBERED_SETTINGS, SETTINGS_STORAGE_KEY } from '../config.js'

let worker = null
let started = false
const e2eHooks = () => globalThis.__SPADEWICK_E2E__
const pending = new Map()
const pongs = new Map()           // ping id -> resolve
let pingId = 1

/** Errors seen in the page (and uncaught ones of the core), for Help → Copy Error Report (WEB-PRD Phase 10). */
export const pageErrors = []
const keepError = text => { pageErrors.push(`${new Date().toISOString()} ${text}`); if (pageErrors.length > 50) pageErrors.shift() }
if (typeof window !== 'undefined') {
  window.addEventListener('error', e => keepError(`[page] ${e.error?.stack ?? e.message}`))
  window.addEventListener('unhandledrejection', e => keepError(`[page] ${e.reason?.stack ?? e.reason}`))
}

/** Whether the core still answers, within `ms` (a long export can keep it busy for a while). */
function stillAnswering(ms = 20000) {
  const id = pingId++
  return new Promise(resolve => {
    const timer = setTimeout(() => { pongs.delete(id); resolve(false) }, ms)
    pongs.set(id, () => { clearTimeout(timer); resolve(true) })
    try { worker.postMessage({ type: 'ping', id }) } catch { clearTimeout(timer); resolve(false) }
  })
}
const listeners = new Map()          // channel -> Set(fn(...args))
let nextId = 1
let failed = null

/** The remembered settings (WEB-PRD §5.3). A private window may refuse storage: then nothing is remembered. */
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')
    return Object.fromEntries(Object.entries(saved ?? {}).filter(([k]) => REMEMBERED_SETTINGS.includes(k)))
  } catch { return {} }
}

function remember(key, value) {
  if (!REMEMBERED_SETTINGS.includes(key)) return
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}') ?? {}
    if (value === undefined) delete saved[key]; else saved[key] = value
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(saved))
  } catch { /* not kept: the setting still applies until the tab closes */ }
}

/** Forget every remembered setting (Preferences → Forget my preferences, WEB-PRD §5.3). */
export function forgetSettings() {
  try { localStorage.removeItem(SETTINGS_STORAGE_KEY) } catch { /* nothing was kept */ }
}

/** Errors arrive the way Electron delivers them, so the interface's handling of them stays the same. */
function remoteError(channel, error) {
  const err = new Error(`Error invoking remote method '${channel}': ${error.name ?? 'Error'}: ${error.message}`)
  return err
}

/**
 * Start the core worker; resolves with its channels when it is ready. Called once when the page loads, and again by
 * `restart` after the worker stopped (WEB-PRD Phase 10).
 */
function start() {
  started = false
  worker = new Worker(new URL('../worker/core.worker.js', import.meta.url), { type: 'module', name: 'spadewick-core' })
  const ready = new Promise((resolve, reject) => {
    // the e2e tests save a download before the answer that follows it is seen (in order; nothing waits in normal use)
    let inOrder = Promise.resolve()
    worker.onmessage = event => {
      const m = event.data
      if (e2eHooks()?.download) { inOrder = inOrder.then(() => (m?.type === 'download' ? e2eHooks().download(m) : handle(m))).catch(err => console.error(err)); return }
      handle(m)
    }
    function handle(m) {
      switch (m?.type) {
        case 'result': {
          const p = pending.get(m.id)
          if (!p) return
          pending.delete(m.id)
          if (m.error) p.reject(remoteError(p.channel, m.error)); else p.resolve(m.value)
          return
        }
        case 'event': emit(m.channel, ...(m.args ?? [])); return
        case 'remember': remember(m.key, m.value); return
        case 'open-external': window.open(m.url, '_blank', 'noopener,noreferrer'); return
        case 'notice': emit('web:notice', m); return
        case 'project-state': emit('web:project-state', m.state); return
        case 'pick': emit('web:pick', m); return
        case 'download': emit('web:download', m); return
        case 'ready': started = true; resolve(m.channels); return
        case 'pong': pongs.get(m.id)?.(); pongs.delete(m.id); return
        case 'fatal': stopped(m.error); reject(new Error(m.error.message)); return
      }
    }
    worker.onerror = event => {
      event.preventDefault?.()
      const error = { name: 'Error', message: event.message || 'The core worker stopped' }
      // before it is ready, the core could not start; afterwards an uncaught error stops it only if it no longer answers
      if (!started) { stopped(error); reject(new Error(error.message)); return }
      keepError(`[core] ${error.message}`)
      stillAnswering().then(alive => { if (!alive) stopped(error) })
    }
  })
  ready.catch(() => { /* reported through 'web:fatal' */ })
  worker.postMessage({ type: 'init', settings: loadSettings(), e2e: !!globalThis.__SPADEWICK_E2E__ })
  return ready
}

/** The worker stopped: every waiting call fails, and the page is told ('web:fatal'). */
function stopped(error) {
  if (failed) return
  failed = error
  for (const [, p] of pending) p.reject(remoteError(p.channel, error))
  pending.clear()
  emit('web:fatal', error)
}

/** Resolves when the core is ready the first time (the loading screen waits for it). */
export const whenReady = start()

/**
 * Start a new core worker after the old one stopped (WEB-PRD Phase 10). Everything the old one held is gone: the page
 * brings back what it kept (the last imported or exported archive). Resolves when the new one is ready.
 */
export async function restart() {
  try { worker?.terminate() } catch { /* already gone */ }
  failed = null
  await start()
}

/** Whether the core worker has stopped. */
export const hasStopped = () => !!failed

/** Call a channel of the core, like Electron's ipcRenderer.invoke. */
export function invoke(channel, ...args) {
  if (failed) return Promise.reject(remoteError(channel, failed))
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, channel })
    try { worker.postMessage({ type: 'invoke', id, channel, args }) } catch (err) { pending.delete(id); reject(err) }
  })
}

/**
 * The end-to-end tests (tests/e2e/harness.js) set `__SPADEWICK_E2E__` before the page starts: they then call the core
 * and send menu events directly, and wait until no call is in flight. Nothing sets it in normal use.
 */
const e2e = globalThis.__SPADEWICK_E2E__
if (e2e) {
  e2e.invoke = invoke
  e2e.emit = (...a) => emit(...a)
  e2e.pending = () => pending.size
}

/** What the person chose in a picker the worker asked for (Phase 4): [{ path, bytes }], or null when they cancelled. */
export function answerPick(id, files) {
  const transfer = (files ?? []).map(f => f.bytes.buffer).filter((b, i, all) => all.indexOf(b) === i)
  worker.postMessage({ type: 'picked', id, files }, transfer)
}

/** Listen to an event from the core or from the web interface (menu:* channels, project:changed, web:*). */
export function on(channel, fn) {
  if (!listeners.has(channel)) listeners.set(channel, new Set())
  listeners.get(channel).add(fn)
  return () => listeners.get(channel)?.delete(fn)
}

/** Send an event to the listeners of a channel (the web menu bar sends menu:* this way, as Electron's menu did). */
export function emit(channel, ...args) {
  for (const fn of [...(listeners.get(channel) ?? [])]) {
    try { fn(...args) } catch (err) { console.error(`[${channel}]`, err) }
  }
}
