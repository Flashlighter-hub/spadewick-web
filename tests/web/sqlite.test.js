// better-sqlite3's API on SQLite WebAssembly (WEB-PRD Phase 2). In this test project `better-sqlite3` and `fs` are the
// web versions; the database file lives in the in-memory file system.
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { existsSync, readFileSync, copyFileSync, cpSync, mkdirSync, rmSync, renameSync, statSync, writeFileSync } from 'fs'
import { reset, mkdirp } from '../../src/web/shims/memfs.js'

let db
beforeEach(() => {
  reset()
  mkdirp('/p')
  db = new Database(':memory:')
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT UNIQUE, n INTEGER, data BLOB)')
})

describe('statements', () => {
  it('runs, and tells what changed', () => {
    const r = db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('a', 1)
    expect(r).toEqual({ changes: 1, lastInsertRowid: 1 })
    expect(db.prepare('UPDATE t SET n = n + 1').run().changes).toBe(1)
  })

  it('gets one row, all rows, or nothing', () => {
    const ins = db.prepare('INSERT INTO t (name, n) VALUES (?, ?)')
    ins.run('a', 1); ins.run('b', 2)
    expect(db.prepare('SELECT name, n FROM t WHERE n = ?').get(2)).toEqual({ name: 'b', n: 2 })
    expect(db.prepare('SELECT name FROM t WHERE n = ?').get(9)).toBeUndefined()
    expect(db.prepare('SELECT name FROM t ORDER BY n').all()).toEqual([{ name: 'a' }, { name: 'b' }])
    expect([...db.prepare('SELECT n FROM t ORDER BY n').iterate()]).toEqual([{ n: 1 }, { n: 2 }])
  })

  it('binds named, positional and mixed parameters as better-sqlite3 does', () => {
    db.prepare('INSERT INTO t (name, n) VALUES (@name, :n)').run({ name: 'a', n: 1 })
    db.prepare('INSERT INTO t (name, n) VALUES ($name, ?)').run(2, { name: 'b' })
    db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run(['c', 3])
    expect(db.prepare('SELECT name, n FROM t ORDER BY id').all()).toEqual([{ name: 'a', n: 1 }, { name: 'b', n: 2 }, { name: 'c', n: 3 }])
    expect(() => db.prepare('SELECT * FROM t WHERE n = ?').get()).toThrow(RangeError)
    expect(() => db.prepare('SELECT * FROM t WHERE n = ?').get(1, 2)).toThrow(RangeError)
    expect(() => db.prepare('SELECT * FROM t WHERE n = @n').get({ m: 1 })).toThrow(/Missing named parameter "n"/)
  })

  it('stores blobs and gives them back as Buffers; booleans become 0 and 1', () => {
    db.prepare('INSERT INTO t (name, data, n) VALUES (?, ?, ?)').run('x', Buffer.from([1, 2, 3]), true)
    const row = db.prepare('SELECT data, n FROM t').get()
    expect(Buffer.isBuffer(row.data)).toBe(true)
    expect([...row.data]).toEqual([1, 2, 3])
    expect(row.n).toBe(1)
  })

  it('plucks and gives raw rows', () => {
    db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('a', 1)
    expect(db.prepare('SELECT name FROM t').pluck().get()).toBe('a')
    expect(db.prepare('SELECT name, n FROM t').raw().all()).toEqual([['a', 1]])
  })

  it('says which statements read', () => {
    expect(db.prepare('SELECT 1').reader).toBe(true)
    expect(db.prepare('DELETE FROM t').reader).toBe(false)
    expect(() => db.prepare('DELETE FROM t').get()).toThrow(TypeError)
    expect(db.prepare('INSERT INTO t (name) VALUES (?) RETURNING id').get('r')).toEqual({ id: 1 })
  })

  it('reports SQL errors when preparing, and constraint errors with better-sqlite3\'s message and code', () => {
    expect(() => db.prepare('SELEC nonsense')).toThrow(/syntax error/)
    db.prepare('INSERT INTO t (name) VALUES (?)').run('a')
    let err
    try { db.prepare('INSERT INTO t (name) VALUES (?)').run('a') } catch (e) { err = e }
    expect(err.name).toBe('SqliteError')
    expect(err.code).toBe('SQLITE_CONSTRAINT_UNIQUE')
    expect(err.message).toBe('UNIQUE constraint failed: t.name')
  })

  it('can run another statement with the same SQL while one is being iterated', () => {
    const ins = db.prepare('INSERT INTO t (name, n) VALUES (?, ?)')
    for (let i = 0; i < 5; i++) ins.run(`r${i}`, i)
    const seen = []
    for (const row of db.prepare('SELECT n FROM t ORDER BY n').iterate()) {
      seen.push(row.n, db.prepare('SELECT n FROM t ORDER BY n').get().n)
    }
    expect(seen).toEqual([0, 0, 1, 0, 2, 0, 3, 0, 4, 0])
  })

  it('keeps working when far more distinct statements are prepared than it caches', () => {
    for (let i = 0; i < 1500; i++) db.prepare(`SELECT ${i} AS v`).get()
    const early = db.prepare('SELECT 1 AS v')
    for (let i = 0; i < 1500; i++) db.prepare(`SELECT ${i} + 0 AS v`).get()
    expect(early.get()).toEqual({ v: 1 })
  })
})

describe('transactions', () => {
  it('commits, and rolls back when the function throws', () => {
    const add = db.transaction(names => { for (const n of names) db.prepare('INSERT INTO t (name) VALUES (?)').run(n); return names.length })
    expect(add(['a', 'b'])).toBe(2)
    expect(() => add(['c', 'a'])).toThrow(/UNIQUE/)
    expect(db.prepare('SELECT name FROM t ORDER BY name').pluck().all()).toEqual(['a', 'b'])
    expect(db.inTransaction).toBe(false)
  })

  it('nests as savepoints: an inner failure caught by the outer one undoes only the inner part', () => {
    const inner = db.transaction(() => { db.prepare("INSERT INTO t (name) VALUES ('inner')").run(); throw new Error('no') })
    const outer = db.transaction(() => {
      db.prepare("INSERT INTO t (name) VALUES ('outer')").run()
      try { inner() } catch { /* expected */ }
      expect(db.inTransaction).toBe(true)
    })
    outer()
    expect(db.prepare('SELECT name FROM t').pluck().all()).toEqual(['outer'])
  })

  it('refuses a function that returns a promise', () => {
    expect(() => db.transaction(async () => {})()).toThrow(/promise/)
    expect(db.inTransaction).toBe(false)
  })

  it('has the immediate and exclusive variants', () => {
    db.transaction(() => db.prepare("INSERT INTO t (name) VALUES ('i')").run()).immediate()
    expect(db.prepare('SELECT count(*) FROM t').pluck().get()).toBe(1)
  })
})

describe('pragmas', () => {
  it('answers rows, or one value with simple', () => {
    expect(db.pragma('foreign_keys = ON')).toEqual([])
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
  })
})

describe('the database file', () => {
  it('makes the file when a new database is opened, and fills it when closed', () => {
    const f = new Database('/p/project.db')
    expect(existsSync('/p/project.db')).toBe(true)
    f.exec("CREATE TABLE m (k TEXT); INSERT INTO m VALUES ('saved')")
    f.close()
    expect(readFileSync('/p/project.db').subarray(0, 15).toString()).toBe('SQLite format 3')
    const again = new Database('/p/project.db')
    expect(again.prepare('SELECT k FROM m').pluck().get()).toBe('saved')
    again.close()
  })

  it('gives anything that reads the file the newest data, while the database is open', () => {
    const f = new Database('/p/project.db')
    f.exec("CREATE TABLE m (k TEXT); INSERT INTO m VALUES ('one')")
    copyFileSync('/p/project.db', '/p/copy1.db')
    f.prepare("INSERT INTO m VALUES ('two')").run()
    mkdirSync('/q')
    cpSync('/p', '/q/p', { recursive: true })
    const a = new Database('/p/copy1.db'), b = new Database('/q/p/project.db')
    expect(a.prepare('SELECT count(*) FROM m').pluck().get()).toBe(1)
    expect(b.prepare('SELECT count(*) FROM m').pluck().get()).toBe(2)
    expect(statSync('/p/project.db').size).toBeGreaterThan(0)
    a.close(); b.close(); f.close()
  })

  it('a second connection sees what the first has committed, and a read-only one leaves the file to the first', () => {
    const f = new Database('/p/project.db')
    f.exec("CREATE TABLE m (k TEXT); INSERT INTO m VALUES ('first')")
    const r = new Database('/p/project.db', { readonly: true })
    expect(r.prepare('SELECT k FROM m').pluck().get()).toBe('first')
    expect(() => r.prepare("INSERT INTO m VALUES ('no')").run()).toThrow(/readonly|read-only|query_only/i)
    r.close()
    f.prepare("INSERT INTO m VALUES ('later')").run()
    expect(new Database('/p/project.db', { readonly: true }).prepare('SELECT count(*) FROM m').pluck().get()).toBe(2)
    f.close()
  })

  it('a checkpoint writes the file, as it does on the desktop', () => {
    const f = new Database('/p/project.db')
    f.exec('CREATE TABLE m (k TEXT)')
    f.pragma('wal_checkpoint(TRUNCATE)')
    expect(readFileSync('/p/project.db').byteLength).toBeGreaterThan(0)
    f.close()
  })

  it('opens a database file written in WAL mode by the desktop app', () => {
    const f = new Database('/p/project.db')
    f.exec("CREATE TABLE m (k TEXT); INSERT INTO m VALUES ('wal')")
    f.close()
    const bytes = readFileSync('/p/project.db')
    bytes[18] = 2; bytes[19] = 2                 // what WAL mode writes into the header
    writeFileSync('/p/wal.db', bytes)
    const w = new Database('/p/wal.db')
    expect(w.prepare('SELECT k FROM m').pluck().get()).toBe('wal')
    w.close()
  })

  it('does not bring back a file that was deleted while open, and follows a moved folder', () => {
    const f = new Database('/p/project.db')
    f.exec('CREATE TABLE m (k TEXT)')
    rmSync('/p', { recursive: true, force: true })
    f.close()
    expect(existsSync('/p/project.db')).toBe(false)

    mkdirp('/r')
    const g = new Database('/r/project.db')
    g.exec("CREATE TABLE m (k TEXT); INSERT INTO m VALUES ('moved')")
    renameSync('/r', '/s')
    g.close()
    const h = new Database('/s/project.db')
    expect(h.prepare('SELECT k FROM m').pluck().get()).toBe('moved')
    h.close()
  })

  it('refuses what is not a database, and a missing folder', () => {
    writeFileSync('/p/not.db', 'hello, this is not a database file at all, not even close to one')
    expect(() => new Database('/p/not.db').prepare('SELECT * FROM sqlite_master').all()).toThrow()
    expect(() => new Database('/missing/project.db')).toThrow(/directory does not exist/)
    expect(() => new Database('/p/none.db', { fileMustExist: true })).toThrow()
  })

  it('serializes to the bytes of a database file', () => {
    expect(db.serialize().subarray(0, 15).toString()).toBe('SQLite format 3')
  })
})
