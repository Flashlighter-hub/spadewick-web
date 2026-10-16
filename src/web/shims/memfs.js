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

// ---------------------------------------------------------------------------
// Changes (WEB-PRD §5.4): a counter that goes up whenever something under /projects changes, so the web layer can tell
// whether the open project has changed since it was last exported.
// ---------------------------------------------------------------------------

let generation = 0
export const changeGeneration = () => generation
/** A change of the open project, or of the library, which travels with it (WEB-PRD Phase 8). */
export function noteChange(path) { if (/^\/(projects|library)(\/|$)/.test(normalize(path))) generation++ }

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
    if (!next) { next = newDir(); node.children.set(name, next); node.mtimeMs = now(); noteChange(path) }
    else if (next.type !== 'dir') throw fsError('ENOTDIR', 'mkdir', path)
    node = next
  }
  return node
}

/**
 * Store bytes at `path` (the parent folder must exist). `silent`: not a change of the project (a live file's holder
 * writing what it already counted, see better-sqlite3.js).
 */
export function putFile(path, data, syscall = 'open', { silent = false } = {}) {
  const { dir, name } = parentOf(path, syscall)
  const existing = dir.children.get(name)
  if (existing?.type === 'dir') throw fsError('EISDIR', syscall, path)
  const t = now()
  dir.children.set(name, { type: 'file', data, mtimeMs: t, birthtimeMs: existing?.birthtimeMs ?? t })
  dir.mtimeMs = t
  if (!silent) noteChange(path)
}

/** A deep copy of a node (file data is copied, so the copy can be changed on its own). */
export function cloneNode(node) {
  if (node.type === 'file') return { ...node, data: node.data.slice() }
  const copy = { ...node, children: new Map() }
  for (const [k, v] of node.children) copy.children.set(k, cloneNode(v))
  return copy
}

// ---------------------------------------------------------------------------
// Live files (WEB-PRD Phase 2)
// ---------------------------------------------------------------------------

/**
 * A file whose newest content is held somewhere else: an open database keeps its data in SQLite's memory and writes it
 * into its file only when asked. Anything that reads the file (a snapshot zipping project.db, a copy of the project
 * folder) first asks the holder to write it, so it always reads what the database holds now. Writes and deletes are
 * the holder's business, as they are for an open database file on a disk.
 *
 *   setLive(path, flush)   flush(currentPath) writes the newest content (with putFile)
 *   clearLive(path, flush) the holder is done (a closed database); only its own registration is removed
 */
const live = new Map()   // normalized path -> flush(path)

const under = (path, folder) => path === folder || folder === '/' || path.startsWith(`${folder}/`)

export function setLive(path, flush) { live.set(normalize(path), flush) }

export function clearLive(path, flush) {
  const p = normalize(path)
  if (!flush || live.get(p) === flush) live.delete(p)
}

export const isLive = (path, flush) => live.get(normalize(path)) === flush

/** Where the holder of `flush` writes now (after any moves), or null. */
export function livePathOf(flush) {
  for (const [file, f] of live) if (f === flush) return file
  return null
}

/** Bring every live file at or below `path` up to date. */
export function flushLive(path) {
  if (!live.size) return
  const p = normalize(path)
  for (const [file, flush] of [...live]) if (under(file, p)) flush(file)
}

/** A live file at or below `path` was deleted: its holder no longer writes there (an unlinked database file). */
export function dropLive(path) {
  const p = normalize(path)
  for (const file of [...live.keys()]) if (under(file, p)) live.delete(file)
}

/** A live file at or below `from` was moved: its holder writes to the new place. */
export function moveLive(from, to) {
  const a = normalize(from), b = normalize(to)
  for (const [file, flush] of [...live]) {
    if (!under(file, a)) continue
    live.delete(file)
    live.set(b + file.slice(a.length), flush)
  }
}

// ---------------------------------------------------------------------------
// Files fetched when first read (WEB-PRD Phase 5)
// ---------------------------------------------------------------------------

/**
 * Put files under `prefix` whose bytes are fetched the first time something reads them: the bundled fonts and colour
 * profile, which the site serves. `entries` is [{ path, size }] with paths relative to `prefix`; `load(absolutePath)`
 * answers the bytes, synchronously (the core reads fonts in synchronous code; a worker may fetch synchronously).
 * They exist, are listed and have their size before they are read; most are never read.
 */
export function mountLazy(prefix, entries, load) {
  const base = normalize(prefix)
  for (const { path: rel, size } of entries) {
    const abs = normalize(`${base}/${rel}`)
    const p = parts(abs)
    const name = p.pop()
    const dir = mkdirp(`/${p.join('/')}`)
    if (dir.children.has(name)) continue
    const t = now()
    let bytes = null
    const node = { type: 'file', lazySize: size, mtimeMs: t, birthtimeMs: t }
    Object.defineProperty(node, 'data', {
      enumerable: true,
      get() { if (!bytes) { bytes = load(abs); delete node.lazySize } return bytes },
      set(v) { bytes = v; delete node.lazySize }
    })
    dir.children.set(name, node)
  }
}

/** The size of a file without fetching it. */
export const sizeOf = node => (node.lazySize ?? node.data.byteLength)

/** Every file below `path` as [absolutePath, Uint8Array] (for zipping a folder or handing it to the page). */
export function listFiles(path) {
  flushLive(path)
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
export function reset() { root = newDir(); live.clear(); generation = 0 }

export const rootNode = () => root
