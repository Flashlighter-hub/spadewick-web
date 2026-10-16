/**
 * `electron` for the page (WEB-PRD Phase 1): what src/preload/index.js uses of it. The preload script itself runs unchanged,
 * so `window.spadewick` has exactly the desktop app's methods; its calls go to the core worker instead of Electron's main process.
 */
import { invoke, on } from './worker.js'

export const contextBridge = {
  exposeInMainWorld(name, api) { window[name] = api }
}

const wrapped = new WeakMap()   // the preload's handler -> our unsubscribe, for ipcRenderer.off

export const ipcRenderer = {
  invoke,
  on(channel, handler) {
    const off = on(channel, (...args) => handler({ sender: null }, ...args))
    if (!wrapped.has(handler)) wrapped.set(handler, new Map())
    wrapped.get(handler).set(channel, off)
    return ipcRenderer
  },
  off(channel, handler) {
    wrapped.get(handler)?.get(channel)?.()
    wrapped.get(handler)?.delete(channel)
    return ipcRenderer
  },
  removeListener(channel, handler) { return ipcRenderer.off(channel, handler) },
  send() {}
}

export default { contextBridge, ipcRenderer }
