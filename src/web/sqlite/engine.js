/**
 * SQLite compiled to WebAssembly (WEB-PRD Phase 2), the official build (@sqlite.org/sqlite-wasm).
 *
 * Loading it is asynchronous and happens once, before the core starts (core.worker.js; tests/web/setup.js); after that,
 * everything is synchronous, as better-sqlite3 is on the desktop.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

let sqlite = null
let loading = null

// The build looks for the browser's private file system (OPFS) at start-up and says when it cannot use it. The web
// version never stores projects there (WEB-PRD §5.3), so that message is not shown.
const quiet = (...args) => { if (!args.some(a => /OPFS/i.test(String(a)))) console.warn('[sqlite]', ...args) }

/** Load SQLite (once). */
export function loadSqlite() {
  return (loading ??= sqlite3InitModule({ print: () => {}, printErr: quiet }).then(s => (sqlite = s)))
}

/** The loaded SQLite; an error before loadSqlite() has finished. */
export function getSqlite() {
  if (!sqlite) throw new Error('The database engine is not loaded yet')
  return sqlite
}
