/**
 * better-sqlite3 for the core worker (WEB-PRD Phase 2): the same synchronous API, on SQLite compiled to WebAssembly.
 *
 * A database is held in SQLite's memory. Its file in the in-memory file system (memfs.js) is a "live file": whatever
 * reads it (a snapshot, a copy of the project folder, an export) first gets the database's newest bytes written into it,
 * and closing the database writes them too. So the desktop code that treats project.db as a file works unchanged.
 *
 * What the desktop code uses is here: prepare → run / get / all / iterate (positional, named and mixed parameters),
 * pluck / raw / expand, columns; exec; pragma (with `simple`); transaction (nested ones become savepoints, with the
 * deferred / immediate / exclusive variants); close; serialize; inTransaction, open, name, memory, readonly.
 * Errors from SQLite are SqliteError with better-sqlite3's message and code ('SQLITE_CONSTRAINT_UNIQUE', …).
 *
 * Statements: SQLite statements must be finalized by hand in WebAssembly (there is no garbage collector to do it), and
 * the core prepares the same SQL over and over. So each database keeps its prepared statements in a cache by SQL text;
 * a Statement object only remembers its SQL and takes the prepared statement from the cache each time it runs.
 */
import { Buffer } from 'buffer'
import { getSqlite } from '../sqlite/engine.js'
import { lookup, putFile, parentOf, setLive, clearLive, livePathOf, flushLive, noteChange } from './memfs.js'

const CACHE_SIZE = 400

export class SqliteError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'SqliteError'
    this.code = code
  }
}

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v) && !(v instanceof ArrayBuffer)

/** A value as SQLite takes it. */
function toSql(v) {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof ArrayBuffer) return new Uint8Array(v)
  if (ArrayBuffer.isView(v) && !(v instanceof Uint8Array)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
  return v
}

/** A value as better-sqlite3 gives it: blobs as Buffers, integers as numbers. */
function fromSql(v) {
  if (v instanceof Uint8Array) return Buffer.from(v.buffer, v.byteOffset, v.byteLength)
  if (typeof v === 'bigint' && v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER)) return Number(v)
  return v
}

/** A SQLite database file written in WAL mode says so in its header; SQLite's in-memory store cannot read it that way. */
function withoutWalHeader(bytes) {
  if (bytes.byteLength >= 20 && bytes[18] === 2 && bytes[19] === 2) {
    const copy = bytes.slice()
    copy[18] = 1
    copy[19] = 1
    return copy
  }
  return bytes
}

export default class Database {
  constructor(filename = ':memory:', options = {}) {
    const sqlite = getSqlite()
    this._sqlite = sqlite
    this._capi = sqlite.capi
    this.name = String(filename)
    this.memory = this.name === ':memory:' || this.name === ''
    this.readonly = !!options.readonly
    this._statements = new Map()   // sql -> prepared statement (most recently used last)
    this._dirty = false

    let bytes = null
    if (!this.memory) {
      flushLive(this.name)          // another connection may hold this file open: read what it has committed
      const node = lookup(this.name)
      if (node?.type === 'dir') throw new SqliteError('unable to open database file', 'SQLITE_CANTOPEN')
      if (!node) {
        if (options.fileMustExist || this.readonly) throw new SqliteError('unable to open database file', 'SQLITE_CANTOPEN')
        try { parentOf(this.name, 'open') } catch { throw new TypeError('Cannot open database because the directory does not exist') }
        putFile(this.name, new Uint8Array(0))      // SQLite makes the file when it opens it
      } else if (node.data.byteLength) {
        bytes = withoutWalHeader(node.data)
      }
    }

    this._db = new sqlite.oo1.DB(':memory:')
    if (bytes) {
      const p = sqlite.wasm.allocFromTypedArray(bytes)
      const flags = this._capi.SQLITE_DESERIALIZE_FREEONCLOSE | this._capi.SQLITE_DESERIALIZE_RESIZEABLE
      const rc = this._capi.sqlite3_deserialize(this._db.pointer, 'main', p, bytes.byteLength, bytes.byteLength, flags)
      if (rc) {
        this._db.close()
        throw new SqliteError('file is not a database', 'SQLITE_NOTADB')
      }
      // a damaged file is found by its first read, as with a file on disk
    }
    if (this.readonly) this._db.exec('PRAGMA query_only = ON')   // writes fail, as on a read-only connection
    this.open = true

    // a read-only connection never writes, so the file stays with the connection that does
    if (!this.memory && !this.readonly) {
      this._flushTo = path => this._flush(path)
      setLive(this.name, this._flushTo)
    }
  }

  get inTransaction() {
    return this.open && this._capi.sqlite3_get_autocommit(this._db.pointer) === 0
  }

  // -------------------------------------------------------------------------
  // Errors and the statement cache
  // -------------------------------------------------------------------------

  _error(err) {
    if (err instanceof SqliteError || err instanceof TypeError || err instanceof RangeError) return err
    if (!(err instanceof this._sqlite.SQLite3Error) || !this.open) return err
    const p = this._db.pointer
    const message = this._capi.sqlite3_errmsg(p) || err.message
    const code = this._capi.sqlite3_js_rc_str(this._capi.sqlite3_extended_errcode(p)) ?? 'SQLITE_ERROR'
    return new SqliteError(message, code)
  }

  /** Something may have been written: the file is out of date, and the project has changed (WEB-PRD §5.4). */
  _changed() {
    this._dirty = true
    if (this._flushTo) { const path = livePathOf(this._flushTo); if (path) noteChange(path) }
  }

  _check() {
    if (!this.open) throw new TypeError('The database connection is not open')
  }

  /** The prepared statement for `sql`, from the cache or new. `own` takes it out of the cache (an iteration in progress). */
  _native(sql, own = false) {
    this._check()
    let st = this._statements.get(sql)
    if (st) {
      this._statements.delete(sql)
      if (own) return st
      this._statements.set(sql, st)     // most recently used last
      return st
    }
    try { st = this._db.prepare(sql) } catch (err) { throw this._error(err) }
    if (!own) {
      this._statements.set(sql, st)
      if (this._statements.size > CACHE_SIZE) {
        const [oldest, old] = this._statements.entries().next().value
        this._statements.delete(oldest)
        try { old.finalize() } catch { /* already gone */ }
      }
    }
    return st
  }

  /** Give back a statement taken with own = true. */
  _giveBack(sql, st) {
    if (this.open && !this._statements.has(sql)) this._statements.set(sql, st)
    else try { st.finalize() } catch { /* already gone */ }
  }

  // -------------------------------------------------------------------------
  // The database's file
  // -------------------------------------------------------------------------

  /** Write the database into its file, wherever that file is now (unless it was deleted). */
  _flushLive() {
    const path = livePathOf(this._flushTo)
    if (path) this._flush(path)
  }

  _flush(path) {
    if (!this.open || !this._dirty) return
    try { parentOf(path, 'open') } catch { return }   // its folder was removed: nothing to write to, as for an unlinked file
    putFile(path, this._capi.sqlite3_js_db_export(this._db.pointer), 'open', { silent: true })   // its changes were counted as they were made
    this._dirty = false
  }

  /** The whole database as the bytes of a database file (better-sqlite3's serialize). */
  serialize() {
    this._check()
    return Buffer.from(this._capi.sqlite3_js_db_export(this._db.pointer))
  }

  // -------------------------------------------------------------------------
  // better-sqlite3's API
  // -------------------------------------------------------------------------

  prepare(sql) {
    this._check()
    return new Statement(this, String(sql))
  }

  exec(sql) {
    this._check()
    try { this._db.exec(String(sql)) } catch (err) { throw this._error(err) } finally { this._changed() }
    return this
  }

  pragma(source, options = {}) {
    this._check()
    const text = String(source).trim()
    const st = this.prepare(`PRAGMA ${text}`)
    if (/=|\(/.test(text)) this._changed()   // a pragma that sets something
    const rows = st.reader ? st.all() : (st.run(), [])
    // a checkpoint on the desktop moves everything into project.db; here it writes the database into its file
    if (/^wal_checkpoint/i.test(text) && this._flushTo) this._flushLive()
    if (options.simple) {
      const first = rows[0]
      return first === undefined ? undefined : Object.values(first)[0]
    }
    return rows
  }

  transaction(fn) {
    if (typeof fn !== 'function') throw new TypeError('Expected first argument to be a function')
    const db = this
    const make = begin => function transaction(...args) {
      const nested = db.inTransaction
      const [start, done, undo] = nested
        ? ['SAVEPOINT "\t_bs3.\t"', 'RELEASE "\t_bs3.\t"', 'ROLLBACK TO "\t_bs3.\t"']
        : [begin, 'COMMIT', 'ROLLBACK']
      db.exec(start)
      try {
        const result = fn.apply(this, args)
        if (result && typeof result.then === 'function') throw new TypeError('Transaction function cannot return a promise')
        db.exec(done)
        return result
      } catch (err) {
        if (db.inTransaction) {
          db.exec(undo)
          if (nested) db.exec(done)
        }
        throw err
      }
    }
    const t = make('BEGIN')
    t.deferred = t
    t.immediate = make('BEGIN IMMEDIATE')
    t.exclusive = make('BEGIN EXCLUSIVE')
    t.default = t
    return t
  }

  close() {
    if (!this.open) return this
    if (this._flushTo) {
      const path = livePathOf(this._flushTo)
      if (path) { this._flush(path); clearLive(path, this._flushTo) }
    }
    for (const st of this._statements.values()) { try { st.finalize() } catch { /* already gone */ } }
    this._statements.clear()
    try { this._db.close() } finally { this.open = false }
    return this
  }

  defaultSafeIntegers() { return this }
  unsafeMode() { return this }

  function() { throw new Error('User-defined SQL functions are not available in the web version') }
  aggregate() { throw new Error('User-defined SQL functions are not available in the web version') }
  backup() { throw new Error('Backups are not available in the web version: the project is exported instead') }
}

class Statement {
  constructor(database, sql) {
    this.database = database
    this.source = sql
    const st = database._native(sql)
    const capi = database._capi
    this.reader = st.columnCount > 0
    this.readonly = capi.sqlite3_stmt_readonly(st.pointer) === 1
    this.busy = false
    this._mode = 'object'   // 'object' | 'pluck' | 'raw' | 'expand'
    this._bound = null
  }

  pluck(on = true) { this._mode = on ? 'pluck' : 'object'; return this }
  raw(on = true) { this._mode = on ? 'raw' : 'object'; return this }
  expand(on = true) { this._mode = on ? 'expand' : 'object'; return this }
  safeIntegers() { return this }

  bind(...args) {
    if (this._bound) throw new TypeError('The bind() method can only be invoked once per statement object')
    this._bound = args
    return this
  }

  columns() {
    const st = this.database._native(this.source)
    const capi = this.database._capi
    const out = []
    for (let i = 0; i < st.columnCount; i++) {
      out.push({
        name: capi.sqlite3_column_name(st.pointer, i),
        column: capi.sqlite3_column_origin_name(st.pointer, i) ?? null,
        table: capi.sqlite3_column_table_name(st.pointer, i) ?? null,
        database: capi.sqlite3_column_database_name(st.pointer, i) ?? null,
        type: capi.sqlite3_column_decltype(st.pointer, i) ?? null
      })
    }
    return out
  }

  /** Bind the call's parameters the way better-sqlite3 does: anonymous ones in order, named ones from one object. */
  _bindTo(st, args) {
    if (this._bound) {
      if (args.length) throw new TypeError('This statement already has bound parameters')
      args = this._bound
    }
    const capi = this.database._capi
    const positional = []
    let named = null
    for (const a of args) {
      if (Array.isArray(a)) positional.push(...a)
      else if (isPlainObject(a)) {
        if (named) throw new TypeError('You cannot specify named parameters in two different objects')
        named = a
      } else positional.push(a)
    }
    const count = capi.sqlite3_bind_parameter_count(st.pointer)
    let next = 0
    for (let i = 1; i <= count; i++) {
      const name = capi.sqlite3_bind_parameter_name(st.pointer, i)
      let value
      if (!name || name[0] === '?') {
        if (next >= positional.length) throw new RangeError('Too few parameter values were provided')
        value = positional[next++]
      } else {
        const key = name.slice(1)
        if (!named || !(key in named)) throw new RangeError(`Missing named parameter "${key}"`)
        value = named[key]
      }
      st.bind(i, toSql(value))
    }
    if (next < positional.length) throw new RangeError('Too many parameter values were provided')
  }

  _row(st) {
    switch (this._mode) {
      case 'pluck': return fromSql(st.get(0))
      case 'raw': return st.get([]).map(fromSql)
      case 'expand': {
        const capi = this.database._capi
        const out = {}
        for (let i = 0; i < st.columnCount; i++) {
          const table = capi.sqlite3_column_table_name(st.pointer, i) ?? '$'
          ;(out[table] ??= {})[capi.sqlite3_column_name(st.pointer, i)] = fromSql(st.get(i))
        }
        return out
      }
      default: {
        const row = st.get({})
        for (const k in row) row[k] = fromSql(row[k])
        return row
      }
    }
  }

  /** Run `work(st)` on a bound statement, reset it afterwards, and turn SQLite's errors into better-sqlite3's. */
  _with(args, work) {
    const db = this.database
    const st = db._native(this.source)
    try {
      this._bindTo(st, args)
      return work(st)
    } catch (err) {
      throw db._error(err)
    } finally {
      if (!this.readonly) db._changed()
      try { st.reset(true) } catch { /* the error above is the one that matters */ }
    }
  }

  _needsReader() {
    if (!this.reader) throw new TypeError('This statement does not return data. Use run() instead')
  }

  run(...args) {
    const db = this.database
    return this._with(args, st => {
      while (st.step()) { /* run it to the end */ }
      const capi = db._capi
      return {
        changes: capi.sqlite3_changes(db._db.pointer),
        lastInsertRowid: fromSql(capi.sqlite3_last_insert_rowid(db._db.pointer))
      }
    })
  }

  get(...args) {
    this._needsReader()
    return this._with(args, st => (st.step() ? this._row(st) : undefined))
  }

  all(...args) {
    this._needsReader()
    return this._with(args, st => {
      const rows = []
      while (st.step()) rows.push(this._row(st))
      return rows
    })
  }

  *iterate(...args) {
    this._needsReader()
    const db = this.database
    const st = db._native(this.source, true)   // its own statement, so other calls with the same SQL can run meanwhile
    this.busy = true
    try {
      try { this._bindTo(st, args) } catch (err) { throw db._error(err) }
      for (;;) {
        let more
        try { more = st.step() } catch (err) { throw db._error(err) }
        if (!more) break
        yield this._row(st)
      }
    } finally {
      this.busy = false
      if (!this.readonly) db._changed()
      try { st.reset(true) } catch { /* finished */ }
      db._giveBack(this.source, st)
    }
  }
}

export { Database }
