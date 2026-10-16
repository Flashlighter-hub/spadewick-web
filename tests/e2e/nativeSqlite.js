/**
 * better-sqlite3 for the e2e scenarios that make or change a project.db on the disk themselves (an older project, a
 * damaged one): the same calls on Node's built-in SQLite (node:sqlite), the native engine the desktop app uses. The
 * scenarios hand the file to the web version afterwards, so it is kept in one file: WAL mode is not switched on.
 */
import { createRequire } from 'module'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

const args = a => (a.length === 1 && a[0] && typeof a[0] === 'object' && !ArrayBuffer.isView(a[0]) ? [a[0]] : a)

class Statement {
  constructor(stmt) { this.stmt = stmt; this.plucked = false }
  pluck(on = true) { this.plucked = on; return this }
  run(...a) { const r = this.stmt.run(...args(a)); return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid } }
  get(...a) { const row = this.stmt.get(...args(a)); return this.plucked && row ? Object.values(row)[0] : row }
  all(...a) { const rows = this.stmt.all(...args(a)); return this.plucked ? rows.map(r => Object.values(r)[0]) : rows }
  *iterate(...a) { yield* this.all(...a) }
}

export default class Database {
  constructor(file, options = {}) {
    this.name = file
    this.db = new DatabaseSync(file, { readOnly: !!options.readonly })
    this.open = true
  }
  prepare(sql) { return new Statement(this.db.prepare(sql)) }
  exec(sql) { this.db.exec(sql); return this }
  pragma(text, { simple = false } = {}) {
    if (/^\s*journal_mode\s*=\s*wal/i.test(text)) return simple ? 'delete' : [{ journal_mode: 'delete' }]
    const rows = this.db.prepare(`PRAGMA ${text}`).all()
    return simple ? (rows[0] ? Object.values(rows[0])[0] : undefined) : rows
  }
  transaction(fn) {
    return (...a) => {
      this.db.exec('BEGIN')
      try { const r = fn(...a); this.db.exec('COMMIT'); return r } catch (err) { this.db.exec('ROLLBACK'); throw err }
    }
  }
  function() { return this }
  close() { if (this.open) { this.db.close(); this.open = false } }
}
