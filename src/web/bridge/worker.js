/**
 * The page's side of the core worker (WEB-PRD §3, Phase 1): starts it, sends it calls and passes on what it says.
 */
import { REMEMBERED_SETTINGS, SETTINGS_STORAGE_KEY } from '../config.js'

const worker = new Worker(new URL('../worker/core.worker.js', import.meta.url), { type: 'module', name: 'spadewick-core' })

const pending = new Map()
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

export const whenReady = new Promise((resolve, reject) => {
  worker.onmessage = event => {
    const m = event.data
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
      case 'ready': resolve(m.channels); return
      case 'fatal': failed = m.error; reject(new Error(m.error.message)); emit('web:fatal', m.error); return
    }
  }
  worker.onerror = event => {
    failed = { name: 'Error', message: event.message || 'The core worker stopped' }
    reject(new Error(failed.message))
    emit('web:fatal', failed)
    for (const [, p] of pending) p.reject(new Error(failed.message))
    pending.clear()
  }
})
whenReady.catch(() => { /* reported through 'web:fatal' */ })

worker.postMessage({ type: 'init', settings: loadSettings() })

/** Call a channel of the core, like Electron's ipcRenderer.invoke. */
export function invoke(channel, ...args) {
  if (failed) return Promise.reject(remoteError(channel, failed))
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, channel })
    try { worker.postMessage({ type: 'invoke', id, channel, args }) } catch (err) { pending.delete(id); reject(err) }
  })
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
