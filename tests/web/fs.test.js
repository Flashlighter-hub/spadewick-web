// The in-memory file system behind `fs` in the web version (WEB-PRD Phase 1). In this test project `fs` is the shim.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  existsSync, statSync, readFileSync, writeFileSync, appendFileSync, copyFileSync, unlinkSync, mkdirSync, readdirSync, rmSync,
  renameSync, cpSync, mkdtempSync, openSync, closeSync, fstatSync, readSync, writeSync
} from 'fs'
import { reset, usage, listFiles } from '../../src/web/shims/memfs.js'

const code = fn => { try { fn() } catch (err) { return err.code } return 'no error' }

beforeEach(() => reset())

describe('files', () => {
  it('writes and reads text and bytes', () => {
    writeFileSync('/a.txt', 'héllo')
    expect(readFileSync('/a.txt', 'utf8')).toBe('héllo')
    expect(readFileSync('/a.txt', { encoding: 'utf8' })).toBe('héllo')
    const buf = readFileSync('/a.txt')
    expect(Buffer.isBuffer(buf) || buf instanceof Uint8Array).toBe(true)
    expect(buf.toString('base64')).toBe(Buffer.from('héllo').toString('base64'))
    writeFileSync('/b.bin', new Uint8Array([1, 2, 3]))
    expect([...readFileSync('/b.bin')]).toEqual([1, 2, 3])
  })

  it('keeps its own copy of what it is given, and gives copies', () => {
    const data = new Uint8Array([1, 2, 3])
    writeFileSync('/c', data)
    data[0] = 9
    const read = readFileSync('/c')
    read[1] = 9
    expect([...readFileSync('/c')]).toEqual([1, 2, 3])
  })

  it('answers Node\'s error codes', () => {
    expect(code(() => readFileSync('/missing'))).toBe('ENOENT')
    expect(code(() => writeFileSync('/no/folder/x', 'x'))).toBe('ENOENT')
    mkdirSync('/d')
    expect(code(() => readFileSync('/d'))).toBe('EISDIR')
    expect(code(() => mkdirSync('/d'))).toBe('EEXIST')
    expect(code(() => unlinkSync('/d'))).toBe('EISDIR')
    expect(code(() => readdirSync('/missing'))).toBe('ENOENT')
    expect(statSync('/missing', { throwIfNoEntry: false })).toBeUndefined()
  })

  it('appends, copies, renames and removes', () => {
    appendFileSync('/log', 'a')
    appendFileSync('/log', 'b')
    expect(readFileSync('/log', 'utf8')).toBe('ab')
    copyFileSync('/log', '/log2')
    renameSync('/log2', '/log3')
    expect(existsSync('/log2')).toBe(false)
    expect(readFileSync('/log3', 'utf8')).toBe('ab')
    unlinkSync('/log3')
    expect(existsSync('/log3')).toBe(false)
  })

  it('stats files and folders', () => {
    writeFileSync('/f', '12345')
    const s = statSync('/f')
    expect(s.size).toBe(5)
    expect(s.isFile()).toBe(true)
    expect(s.isDirectory()).toBe(false)
    expect(typeof s.mtimeMs).toBe('number')
    expect(statSync('/').isDirectory()).toBe(true)
  })
})

describe('folders', () => {
  it('makes folders, with and without recursive', () => {
    expect(mkdirSync('/p/q/r', { recursive: true })).toBe('/p')
    expect(mkdirSync('/p/q/r', { recursive: true })).toBeUndefined()
    expect(code(() => mkdirSync('/x/y'))).toBe('ENOENT')
    expect(statSync('/p/q/r').isDirectory()).toBe(true)
  })

  it('lists entries in name order, with types on request', () => {
    mkdirSync('/p')
    writeFileSync('/p/b', '')
    mkdirSync('/p/a')
    expect(readdirSync('/p')).toEqual(['a', 'b'])
    const typed = readdirSync('/p', { withFileTypes: true })
    expect(typed.map(d => [d.name, d.isDirectory(), d.isFile()])).toEqual([['a', true, false], ['b', false, true]])
  })

  it('removes folders only when asked to recurse, and ignores missing paths with force', () => {
    mkdirSync('/p/q', { recursive: true })
    writeFileSync('/p/q/f', 'x')
    expect(code(() => rmSync('/p'))).toBe('ERR_FS_EISDIR')
    rmSync('/p', { recursive: true, force: true })
    expect(existsSync('/p')).toBe(false)
    expect(code(() => rmSync('/p'))).toBe('ENOENT')
    expect(code(() => rmSync('/p', { force: true }))).toBe('no error')
  })

  it('moves folders, and will not move one into itself', () => {
    mkdirSync('/from/sub', { recursive: true })
    writeFileSync('/from/sub/f', 'x')
    renameSync('/from', '/to')
    expect(readFileSync('/to/sub/f', 'utf8')).toBe('x')
    expect(code(() => renameSync('/to', '/to/sub/inside'))).toBe('EINVAL')
  })

  it('copies a tree, asking the filter about each path', () => {
    mkdirSync('/src/keep', { recursive: true })
    writeFileSync('/src/keep/a', 'a')
    writeFileSync('/src/.lock', 'no')
    cpSync('/src', '/dst', { recursive: true, filter: p => !p.endsWith('.lock') })
    expect(readFileSync('/dst/keep/a', 'utf8')).toBe('a')
    expect(existsSync('/dst/.lock')).toBe(false)
    writeFileSync('/src/keep/a', 'changed')
    expect(readFileSync('/dst/keep/a', 'utf8')).toBe('a')
  })

  it('makes temporary folders with a unique name', () => {
    mkdirSync('/tmp')
    const a = mkdtempSync('/tmp/zip-'), b = mkdtempSync('/tmp/zip-')
    expect(a).toMatch(/^\/tmp\/zip-[A-Za-z0-9]{6}$/)
    expect(a).not.toBe(b)
    expect(statSync(a).isDirectory()).toBe(true)
  })

  it('counts the bytes below a folder and lists its files', () => {
    mkdirSync('/p/q', { recursive: true })
    writeFileSync('/p/a', '123')
    writeFileSync('/p/q/b', '45')
    expect(usage('/p')).toBe(5)
    expect(listFiles('/p').map(([p]) => p).sort()).toEqual(['/p/a', '/p/q/b'])
  })
})

describe('descriptors', () => {
  it('writes in pieces and reads back at positions', () => {
    const fd = openSync('/z', 'w')
    writeSync(fd, Buffer.from('hello '))
    writeSync(fd, Buffer.from('world'))
    expect(fstatSync(fd).size).toBe(11)
    closeSync(fd)
    expect(readFileSync('/z', 'utf8')).toBe('hello world')

    const r = openSync('/z', 'r')
    const buf = Buffer.alloc(5)
    expect(readSync(r, buf, 0, 5, 6)).toBe(5)
    expect(buf.toString()).toBe('world')
    expect(readSync(r, buf, 0, 5, 20)).toBe(0)
    closeSync(r)
    expect(code(() => readSync(r, buf, 0, 1, 0))).toBe('EBADF')
  })
})
