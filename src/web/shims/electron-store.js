/**
 * The settings store of the core worker (WEB-PRD §5.3, Phase 1), with electron-store's shape (`get`, `set`, `delete`,
 * `store`, `onDidChange`), which is what the core expects in `ctx.settings`.
 *
 * The worker cannot reach localStorage, so the page owns the remembered settings: it hands their saved values over when
 * the worker starts (`saved`), and the store tells the page (`onRemember`) whenever one of them changes.
 */
import { REMEMBERED_SETTINGS } from '../config.js'

export default class Store {
  constructor({ defaults = {}, saved = {}, onRemember = () => {} } = {}) {
    this._data = structuredClone(defaults)
    for (const key of REMEMBERED_SETTINGS) if (key in saved) this._data[key] = saved[key]
    this._onRemember = onRemember
    this._listeners = new Map()
  }

  get(key, fallback) { return key in this._data ? this._data[key] : fallback }

  set(key, value) {
    if (key !== null && typeof key === 'object') { for (const [k, v] of Object.entries(key)) this.set(k, v); return }
    const before = this._data[key]
    this._data[key] = value
    if (REMEMBERED_SETTINGS.includes(key)) this._onRemember(key, value)
    for (const fn of this._listeners.get(key) ?? []) { try { fn(value, before) } catch { /* a listener must not break a setting */ } }
  }

  has(key) { return key in this._data }

  delete(key) { delete this._data[key]; if (REMEMBERED_SETTINGS.includes(key)) this._onRemember(key, undefined) }

  get store() { return this._data }

  onDidChange(key, fn) {
    if (!this._listeners.has(key)) this._listeners.set(key, new Set())
    this._listeners.get(key).add(fn)
    return () => this._listeners.get(key).delete(fn)
  }
}
