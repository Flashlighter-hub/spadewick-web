/**
 * `fs` for the core worker (WEB-PRD Phase 1): the synchronous functions the core uses, on the in-memory file system
 * (memfs.js). The web build maps every `import … from 'fs'` here, so the core's own files are not edited.
 *
 * Only what the core calls is here; a call to anything else fails at build time (the import is missing), which is how a
 * merge from the desktop version that starts using a new function is noticed (WEB-PRD Phase 15).
 */
import { Buffer } from 'buffer'
import { fsError, lookup, parentOf, mkdirp, putFile, cloneNode, normalize, parts, flushLive, dropLive, moveLive, noteChange, sizeOf } from './memfs.js'

const encodingOf = options => (typeof options === 'string' ? options : options?.encoding ?? null)

function toBytes(data, encoding) {
  if (typeof data === 'string') return new Uint8Array(Buffer.from(data, encoding ?? 'utf8'))
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0))
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  return new Uint8Array(Buffer.from(String(data)))
}

const asResult = (bytes, encoding) => {
  const buf = Buffer.from(bytes)           // a copy: the caller may change it without changing the file
  return encoding && encoding !== 'buffer' ? buf.toString(encoding) : buf
}

function statOf(node) {
  const size = node.type === 'file' ? sizeOf(node) : 4096
  return {
    size,
    mode: node.type === 'file' ? 0o100644 : 0o040755,
    mtimeMs: node.mtimeMs, ctimeMs: node.mtimeMs, atimeMs: node.mtimeMs, birthtimeMs: node.birthtimeMs,
    mtime: new Date(node.mtimeMs), ctime: new Date(node.mtimeMs), atime: new Date(node.mtimeMs), birthtime: new Date(node.birthtimeMs),
    isFile: () => node.type === 'file',
    isDirectory: () => node.type === 'dir',
    isSymbolicLink: () => false
  }
}

function fileNode(path, syscall) {
  const node = lookup(path)
  if (!node) throw fsError('ENOENT', syscall, path)
  if (node.type !== 'file') throw fsError('EISDIR', syscall, path)
  return node
}

// ---------------------------------------------------------------------------
// Whole files
// ---------------------------------------------------------------------------

export function existsSync(path) {
  try { return path != null && lookup(path) !== null } catch { return false }
}

export function statSync(path, options) {
  if (typeof path === 'number') return fstatSync(path)
  flushLive(path)
  const node = lookup(path)
  if (!node) {
    if (options?.throwIfNoEntry === false) return undefined
    throw fsError('ENOENT', 'stat', path)
  }
  return statOf(node)
}

export const lstatSync = statSync

export function readFileSync(path, options) {
  if (typeof path === 'number') { const d = descriptor(path, 'read'); return asResult(d.data.subarray(0, d.length), encodingOf(options)) }
  flushLive(path)
  return asResult(fileNode(path, 'open').data, encodingOf(options))
}

export function writeFileSync(path, data, options) {
  if (typeof path === 'number') { writeSync(path, toBytes(data, encodingOf(options))); return }
  const flag = typeof options === 'object' ? options?.flag : undefined
  if (flag?.startsWith('a')) return appendFileSync(path, data, options)
  putFile(path, toBytes(data, encodingOf(options)))
}

export function appendFileSync(path, data, options) {
  const add = toBytes(data, encodingOf(options))
  const node = lookup(path)
  if (!node) { putFile(path, add); return }
  if (node.type !== 'file') throw fsError('EISDIR', 'open', path)
  const joined = new Uint8Array(node.data.byteLength + add.byteLength)
  joined.set(node.data, 0)
  joined.set(add, node.data.byteLength)
  node.data = joined
  node.mtimeMs = Date.now()
  noteChange(path)
}

export function copyFileSync(src, dest) {
  flushLive(src)
  putFile(dest, fileNode(src, 'copyfile').data.slice(), 'copyfile')
}

export function unlinkSync(path) {
  const { dir, name } = parentOf(path, 'unlink')
  const node = dir.children.get(name)
  if (!node) throw fsError('ENOENT', 'unlink', path)
  if (node.type === 'dir') throw fsError('EISDIR', 'unlink', path)
  dir.children.delete(name)
  dropLive(path)
  noteChange(path)
  dir.mtimeMs = Date.now()
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export function mkdirSync(path, options) {
  const recursive = typeof options === 'object' && options?.recursive
  if (recursive) {
    // Node answers the first folder it made, or undefined when all were there
    let first
    let at = ''
    for (const name of parts(path)) {
      at += `/${name}`
      if (!lookup(at) && first === undefined) first = at
    }
    mkdirp(path)
    return first
  }
  const { dir, name } = parentOf(path, 'mkdir')
  if (dir.children.has(name)) throw fsError('EEXIST', 'mkdir', path)
  mkdirp(path)
  return undefined
}

export function readdirSync(path, options) {
  const node = lookup(path)
  if (!node) throw fsError('ENOENT', 'scandir', path)
  if (node.type !== 'dir') throw fsError('ENOTDIR', 'scandir', path)
  const names = [...node.children.keys()].sort()
  if (!options?.withFileTypes) return names
  return names.map(name => {
    const child = node.children.get(name)
    return { name, parentPath: normalize(path), path: normalize(path), isFile: () => child.type === 'file', isDirectory: () => child.type === 'dir', isSymbolicLink: () => false }
  })
}

export function rmSync(path, options = {}) {
  let found
  try { found = parentOf(path, 'rm') } catch (err) { if (options.force && err.code === 'ENOENT') return; throw err }
  const { dir, name } = found
  const node = dir.children.get(name)
  if (!node) { if (options.force) return; throw fsError('ENOENT', 'rm', path) }
  if (node.type === 'dir' && !options.recursive) {
    const err = fsError('EISDIR', 'rm', path)
    err.code = 'ERR_FS_EISDIR'
    throw err
  }
  dir.children.delete(name)
  dropLive(path)
  noteChange(path)
  dir.mtimeMs = Date.now()
}

export function rmdirSync(path, options = {}) {
  const node = lookup(path)
  if (!node) throw fsError('ENOENT', 'rmdir', path)
  if (node.type !== 'dir') throw fsError('ENOTDIR', 'rmdir', path)
  if (node.children.size && !options.recursive) throw fsError('ENOTEMPTY', 'rmdir', path)
  rmSync(path, { recursive: true })
}

export function renameSync(from, to) {
  const src = parentOf(from, 'rename')
  const node = src.dir.children.get(src.name)
  if (!node) throw fsError('ENOENT', 'rename', from)
  if (normalize(from) === normalize(to)) return
  if (node.type === 'dir' && (normalize(to) + '/').startsWith(normalize(from) + '/')) throw fsError('EINVAL', 'rename', from)
  const dest = parentOf(to, 'rename')
  const there = dest.dir.children.get(dest.name)
  if (there?.type === 'dir') {
    if (node.type !== 'dir') throw fsError('EISDIR', 'rename', to)
    if (there.children.size) throw fsError('ENOTEMPTY', 'rename', to)
  } else if (there && node.type === 'dir') throw fsError('ENOTDIR', 'rename', to)
  src.dir.children.delete(src.name)
  if (there) dropLive(to)
  dest.dir.children.set(dest.name, node)
  moveLive(from, to)
  noteChange(from); noteChange(to)
  src.dir.mtimeMs = dest.dir.mtimeMs = Date.now()
}

export function cpSync(src, dest, options = {}) {
  flushLive(src)
  const node = lookup(src)
  if (!node) throw fsError('ENOENT', 'cp', src)
  const filter = options.filter ?? (() => true)
  const copy = (from, to, n) => {
    if (!filter(from, to)) return
    if (n.type === 'file') {
      if (options.force === false && lookup(to)) return
      putFile(to, n.data.slice(), 'cp')
      return
    }
    if (!options.recursive) { const err = fsError('EISDIR', 'cp', from); err.code = 'ERR_FS_EISDIR'; throw err }
    mkdirp(to)
    for (const [name, child] of n.children) copy(`${normalize(from)}/${name}`, `${normalize(to)}/${name}`, child)
  }
  copy(normalize(src), normalize(dest), node)
}

export function mkdtempSync(prefix) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6))
    const path = prefix + [...bytes].map(b => chars[b % chars.length]).join('')
    if (!lookup(path)) { mkdirSync(path); return path }
  }
}

// ---------------------------------------------------------------------------
// Descriptors (zip.js reads and writes archives piece by piece)
// ---------------------------------------------------------------------------

const descriptors = new Map()
let nextFd = 3

function descriptor(fd, syscall) {
  const d = descriptors.get(fd)
  if (!d) throw fsError('EBADF', syscall)
  return d
}

export function openSync(path, flags = 'r') {
  const f = String(flags)
  if (!f.startsWith('w')) flushLive(path)
  const node = lookup(path)
  if (node?.type === 'dir') throw fsError('EISDIR', 'open', path)
  if (f.startsWith('r') && !node) throw fsError('ENOENT', 'open', path)
  if (f.includes('x') && node) throw fsError('EEXIST', 'open', path)
  if (!f.startsWith('r')) parentOf(path, 'open')                 // the folder must exist
  const start = f.startsWith('w') || !node ? new Uint8Array(0) : node.data.slice()
  const d = { path: normalize(path), data: start, length: start.byteLength, pos: f.startsWith('a') ? start.byteLength : 0, append: f.startsWith('a'), writable: f !== 'r', dirty: f.startsWith('w') || !node }
  const fd = nextFd++
  descriptors.set(fd, d)
  if (d.dirty) commit(d)
  return fd
}

function commit(d) {
  putFile(d.path, d.data.slice(0, d.length))
  d.dirty = false
}

export function closeSync(fd) {
  const d = descriptor(fd, 'close')
  if (d.dirty) commit(d)
  descriptors.delete(fd)
}

export function fstatSync(fd) {
  const d = descriptor(fd, 'fstat')
  if (d.dirty) commit(d)
  return statOf(lookup(d.path) ?? { type: 'file', data: d.data.subarray(0, d.length), mtimeMs: Date.now(), birthtimeMs: Date.now() })
}

/** readSync(fd, buffer, offset, length, position) — position null/undefined reads from the current place. */
export function readSync(fd, buffer, offset = 0, length = buffer.byteLength - offset, position = null) {
  if (typeof offset === 'object' && offset !== null) ({ offset = 0, length = buffer.byteLength - offset, position = null } = offset)
  const d = descriptor(fd, 'read')
  const at = position == null ? d.pos : Number(position)
  const n = Math.max(0, Math.min(length, d.length - at))
  buffer.set(d.data.subarray(at, at + n), offset)
  if (position == null) d.pos += n
  return n
}

/**
 * writeSync(fd, buffer, offset?, length?, position?) or writeSync(fd, string, position?, encoding?).
 * The file is updated when the descriptor is closed (or stat'ed), not after every write.
 */
export function writeSync(fd, data, a, b, c) {
  const d = descriptor(fd, 'write')
  if (!d.writable) throw fsError('EBADF', 'write')
  let bytes, position
  if (typeof data === 'string') { bytes = toBytes(data, typeof b === 'string' ? b : 'utf8'); position = a }
  else {
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    const offset = a ?? 0
    const length = b ?? view.byteLength - offset
    bytes = view.subarray(offset, offset + length)
    position = c
  }
  const at = d.append ? d.length : position == null ? d.pos : Number(position)
  const end = at + bytes.byteLength
  if (end > d.data.byteLength) {
    const grown = new Uint8Array(Math.max(end, d.data.byteLength * 2, 64 * 1024))
    grown.set(d.data.subarray(0, d.length))
    d.data = grown
  }
  d.data.set(bytes, at)
  d.length = Math.max(d.length, end)
  if (position == null || d.append) d.pos = end
  d.dirty = true
  return bytes.byteLength
}

/** Set a file's times (only the modification time is kept). */
export function utimesSync(path, atime, mtime) {
  const node = lookup(path)
  if (!node) throw fsError('ENOENT', 'utime', path)
  node.mtimeMs = mtime instanceof Date ? mtime.getTime() : typeof mtime === 'number' && mtime < 1e11 ? mtime * 1000 : Number(mtime)
}

export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 }

/** Copy a node (used by the worker to move a folder between places without going through bytes). */
export const _clone = cloneNode

export default {
  existsSync, statSync, lstatSync, readFileSync, writeFileSync, appendFileSync, copyFileSync, unlinkSync, mkdirSync, readdirSync,
  rmSync, rmdirSync, renameSync, cpSync, mkdtempSync, openSync, closeSync, fstatSync, readSync, writeSync, utimesSync, constants
}
