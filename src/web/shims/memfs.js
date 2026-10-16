/**
 * The in-memory file system of the web version (WEB-PRD §5.1, Phase 1).
 *
 * Everything the core would write to disk on the desktop lives here instead, inside the core worker: the open project
 * folder, imported files, temporary folders and files waiting to be downloaded. Nothing in it is ever written to the
 * user's computer or sent anywhere; it disappears with the tab.
 *
 * The tree is made of nodes:
 *   directory  { type: 'dir',  children: Map<name, node>, mtimeMs, birthtimeMs }
 *   file       { type: 'file', data: Uint8Array, mtimeMs, birthtimeMs }
 * Paths are POSIX and absolute ('/projects/My Game/project.db'); a relative path is taken from '/'.
 * Errors carry the same `code` as Node's (ENOENT, EEXIST, ENOTDIR, EISDIR, ENOTEMPTY, EBADF), because the core tests for them.
 */

const now = () => Date.now()
const newDir = () => { const t = now(); return { type: 'dir', children: new Map(), mtimeMs: t, birthtimeMs: t } }

let root = newDir()

export function fsError(code, syscall, path) {
  const text = {
    ENOENT: 'no such file or directory', EEXIST: 'file already exists', ENOTDIR: 'not a directory',
    EISDIR: 'illegal operation on a directory', ENOTEMPTY: 'directory not empty', EBADF: 'bad file descriptor',
    EINVAL: 'invalid argument'
  }[code] ?? code
  const err = new Error(`${code}: ${text}, ${syscall}${path !== undefined ? ` '${path}'` : ''}`)
  err.code = code
  err.syscall = syscall
  if (path !== undefined) err.path = path
  return err
}

/** The parts of a path, with '.' and '..' resolved: '/a/./b/../c' → ['a', 'c']. */
export function parts(path) {
  const out = []
  for (const p of String(path).replace(/\\/g, '/').split('/')) {
    if (!p || p === '.') continue
    if (p === '..') out.pop(); else out.push(p)
  }
  return out
}

export const normalize = path => `/${parts(path).join('/')}`

/** The node at `path`, or null. */
export function lookup(path) {
  let node = root
  for (const name of parts(path)) {
    if (node.type !== 'dir') return null
    node = node.children.get(name)
    if (!node) return null
  }
  return node
}

/** The directory that holds `path` and the last name of the path; throws when the directory is missing. */
export function parentOf(path, syscall) {
  const p = parts(path)
  if (!p.length) throw fsError('EEXIST', syscall, path)   // the root itself
  const name = p.pop()
  let node = root
  for (const n of p) {
    node = node.type === 'dir' ? node.children.get(n) : null
    if (!node) throw fsError('ENOENT', syscall, path)
    if (node.type !== 'dir') throw fsError('ENOTDIR', syscall, path)
  }
  return { dir: node, name }
}

/** Make a directory and every missing parent; returns the directory node. */
export function mkdirp(path) {
  let node = root
  for (const name of parts(path)) {
    let next = node.children.get(name)
    if (!next) { next = newDir(); node.children.set(name, next); node.mtimeMs = now() }
    else if (next.type !== 'dir') throw fsError('ENOTDIR', 'mkdir', path)
    node = next
  }
  return node
}

/** Store bytes at `path` (the parent folder must exist). */
export function putFile(path, data, syscall = 'open') {
  const { dir, name } = parentOf(path, syscall)
  const existing = dir.children.get(name)
  if (existing?.type === 'dir') throw fsError('EISDIR', syscall, path)
  const t = now()
  dir.children.set(name, { type: 'file', data, mtimeMs: t, birthtimeMs: existing?.birthtimeMs ?? t })
  dir.mtimeMs = t
}

/** A deep copy of a node (file data is copied, so the copy can be changed on its own). */
export function cloneNode(node) {
  if (node.type === 'file') return { ...node, data: node.data.slice() }
  const copy = { ...node, children: new Map() }
  for (const [k, v] of node.children) copy.children.set(k, cloneNode(v))
  return copy
}

/** Every file below `path` as [absolutePath, Uint8Array] (for zipping a folder or handing it to the page). */
export function listFiles(path) {
  const start = lookup(path)
  const out = []
  const walk = (node, at) => {
    if (node.type === 'file') { out.push([at, node.data]); return }
    for (const [name, child] of node.children) walk(child, `${at === '/' ? '' : at}/${name}`)
  }
  if (start) walk(start, normalize(path))
  return out
}

/** How many bytes the files below `path` take (WEB-PRD Phase 10: the size shown and the 500 MB warning). */
export function usage(path = '/') {
  return listFiles(path).reduce((n, [, d]) => n + d.byteLength, 0)
}

/** Empty the whole file system (tests, and the worker's start). */
export function reset() { root = newDir() }

export const rootNode = () => root
