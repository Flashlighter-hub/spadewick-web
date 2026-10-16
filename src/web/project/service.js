/**
 * The project's life in the web version, worker side (WEB-PRD §5, Phase 3).
 *
 * The desktop's own handlers create, open and close projects; this adds what a tab needs around them:
 *   web:project-import   put a project brought in from the computer (a zip, a folder's files, or a project.db) into
 *                        /projects, ready for the desktop's projects:open; nothing is opened here
 *   web:project-export   the open project as the bytes of a zip, in the desktop's folder layout
 *   web:project-state    { open, name, path, dirty, exportedAt, bytes } — also sent to the page whenever it changes
 * and, around projects:create / projects:open / projects:open-file / projects:close: only one project is kept in memory,
 * so the others are closed and deleted, and the change count starts again for the project just opened.
 *
 * "Dirty" means: changed since it was brought in or last exported. A project made in this tab is dirty until exported.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, renameSync, statSync, writeFileSync, readFileSync, mkdtempSync } from 'fs'
import { join, basename, dirname } from 'path'
import Database from 'better-sqlite3'
import { ipcMain, wrapHandler, handlerOf } from '../shims/electron.js'
import { changeGeneration, usage, normalize } from '../shims/memfs.js'
import { extractZip, listZip, writeZip } from '../../main/zip.js'
import { walk } from '../../main/snapshotCore.js'
import { closeProjectDb } from '../../main/db.js'
import { MAX_PROJECT_BYTES } from '../config.js'

const PROJECTS = '/projects'

/** Folders and files of a project folder that never go into an export (WEB-PRD §5.2). */
const NOT_EXPORTED = new Set(['.cache', 'exports', '.restore_tmp', '.spadewick.lock', 'project.db-wal', 'project.db-shm'])

export class ImportError extends Error {
  constructor(code, message) { super(message); this.name = 'ImportError'; this.code = code }
}

const MESSAGES = {
  noProject: 'This file does not contain a Spadewick project (no project.db was found).',
  severalProjects: 'This file contains more than one Spadewick project. Bring them in one at a time.',
  walPending: 'This project was copied while the desktop app still had it open, so its newest changes are in a side file (project.db-wal) the browser cannot read. Close the project in the desktop app, then copy or zip its folder again.',
  tooBig: 'This project is too large to open in the browser.',
  notAZip: 'This file is not a zip archive.'
}
const fail = code => { throw new ImportError(code, MESSAGES[code]) }

const sanitize = name => String(name ?? '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'Project'

/** A folder name under /projects that is not taken. */
function freeFolder(name) {
  const base = sanitize(name)
  let dir = join(PROJECTS, base)
  for (let n = 2; existsSync(dir); n++) dir = join(PROJECTS, `${base} ${n}`)
  return dir
}

/** The project's name as its database says, or null. */
export function nameInDatabase(dbFile) {
  let db
  try {
    db = new Database(dbFile, { readonly: true })
    return db.prepare("SELECT value FROM project_meta WHERE key = 'name'").pluck().get() ?? null
  } catch { return null } finally { try { db?.close() } catch { /* already closed */ } }
}

/** Of the paths given (relative, '/'-separated), the folder that holds the project: the shallowest project.db. */
function projectRoot(paths) {
  const dbs = paths.filter(p => p === 'project.db' || p.endsWith('/project.db'))
  if (!dbs.length) fail('noProject')
  const depth = p => p.split('/').length
  const shallowest = Math.min(...dbs.map(depth))
  const top = dbs.filter(p => depth(p) === shallowest)
  if (top.length > 1) fail('severalProjects')
  return top[0] === 'project.db' ? '' : top[0].slice(0, -'/project.db'.length)
}

/** Move the project found at `staging/rootRel` into /projects, and say where it is. */
function settle(staging, rootRel, fallbackName) {
  const root = rootRel ? join(staging, rootRel) : staging
  const wal = join(root, 'project.db-wal')
  if (existsSync(wal) && statSync(wal).size > 0) fail('walPending')
  for (const f of ['project.db-wal', 'project.db-shm', '.spadewick.lock']) rmSync(join(root, f), { force: true })
  const name = nameInDatabase(join(root, 'project.db')) ?? (rootRel ? basename(rootRel) : fallbackName)
  const dest = freeFolder(name)
  renameSync(root, dest)
  return { path: dest, name }
}

/**
 * Put a project into /projects.
 *   { kind: 'zip', name, bytes }           a zip: the project folder at the top, or project.db directly at the top
 *   { kind: 'files', files: [{ path, bytes }] }   the files of a folder the person chose (paths start with the folder's name)
 *   { kind: 'db', name, bytes }            a project.db alone (a project without pictures or fonts)
 */
export function importProject(payload) {
  mkdirSync('/imports', { recursive: true })
  const staging = mkdtempSync('/imports/project-')
  try {
    const size = payload.kind === 'files' ? payload.files.reduce((n, f) => n + f.bytes.byteLength, 0) : payload.bytes.byteLength
    if (size > MAX_PROJECT_BYTES) fail('tooBig')
    const baseName = String(payload.name ?? '').replace(/(\.spadewick)?\.(zip|db)$/i, '')

    if (payload.kind === 'zip') {
      const zip = join(staging, 'in.zip')
      writeFileSync(zip, payload.bytes)
      let entries
      try { entries = listZip(zip) } catch { fail('notAZip') }
      const root = projectRoot(entries.map(e => e.name).filter(n => !n.endsWith('/')))
      extractZip(zip, join(staging, 'x'), { maxEntries: 200000, maxTotalBytes: MAX_PROJECT_BYTES })
      rmSync(zip, { force: true })
      return settle(join(staging, 'x'), root, baseName)
    }

    if (payload.kind === 'files') {
      const paths = payload.files.map(f => String(f.path).replace(/\\/g, '/').replace(/^\/+/, ''))
      if (paths.some(p => p.split('/').includes('..'))) fail('noProject')
      const root = projectRoot(paths)
      payload.files.forEach((f, i) => {
        const file = join(staging, 'x', paths[i])
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, f.bytes)
      })
      return settle(join(staging, 'x'), root, baseName)
    }

    if (payload.kind === 'db') {
      mkdirSync(join(staging, 'x'))
      writeFileSync(join(staging, 'x', 'project.db'), payload.bytes)
      return settle(join(staging, 'x'), '', baseName)
    }
    throw new Error(`Unknown kind of import: ${payload.kind}`)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

/**
 * The open project's folder as a zip: { fileName, bytes } (WEB-PRD §5.2). The zip's folder and file are named after the
 * project (`name`), not after its folder in memory, which may carry a number to keep two projects apart for a moment.
 */
export function exportProject(projectDir, { includeSnapshots = true, name } = {}) {
  const top = sanitize(name ?? basename(projectDir))
  const entries = walk(projectDir)                                  // reading project.db gets the database's newest bytes
    .filter(e => {
      const first = e.name.split('/')[0]
      if (NOT_EXPORTED.has(first)) return false
      if (!includeSnapshots && first === 'snapshots') return false
      return true
    })
    .map(e => ({ name: `${top}/${e.name}`, file: e.file }))
  mkdirSync('/downloads', { recursive: true })
  const dir = mkdtempSync('/downloads/project-')
  const zip = join(dir, 'project.zip')
  try {
    writeZip(zip, entries)
    return { fileName: `${top}.spadewick.zip`, bytes: readFileSync(zip) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Register the web:project-* channels and wrap the desktop's project handlers. `post(message)` sends to the page.
 */
export function registerWebProject(post) {
  let current = null          // { path, name } of the open project
  let baseline = null         // changeGeneration() when it was brought in or last exported; null: never (made here)
  let exportedAt = null
  let importedAt = null
  let lastSent = ''

  const meta = () => handlerOf('projects:get-meta')({ sender: null })

  /** Keep only the open project in memory (WEB-PRD Phase 3). */
  function prune(keep) {
    if (!existsSync(PROJECTS)) return
    for (const name of readdirSync(PROJECTS)) {
      const dir = join(PROJECTS, name)
      if (keep && normalize(dir) === normalize(keep)) continue
      try { closeProjectDb(dir) } catch { /* not open */ }
      rmSync(dir, { recursive: true, force: true })
    }
  }

  async function refreshCurrent({ fresh }) {
    const state = await meta()
    current = state ? { path: state.path, name: state.meta?.name ?? basename(state.path) } : null
    prune(current?.path)
    if (fresh) {
      baseline = fresh === 'imported' ? changeGeneration() : null
      importedAt = fresh === 'imported' ? Date.now() : null
      exportedAt = null
    }
  }

  const state = () => ({
    open: !!current,
    name: current?.name ?? null,
    path: current?.path ?? null,
    dirty: !!current && (baseline === null || changeGeneration() !== baseline),
    exportedAt,
    importedAt,
    bytes: current ? usage(current.path) : 0
  })

  // a project the person brought in has nothing to export until it changes; one made here has everything to export
  const imported = new Set()
  wrapHandler('projects:create', fn => async (...args) => { const r = await fn(...args); await refreshCurrent({ fresh: 'created' }); return r })
  for (const channel of ['projects:open', 'projects:open-file']) {
    wrapHandler(channel, fn => async (event, ...args) => {
      const r = await fn(event, ...args)
      if (r) {
        const path = r.path ?? null
        await refreshCurrent({ fresh: path && imported.has(normalize(path)) ? 'imported' : 'created' })
        if (path) imported.delete(normalize(path))
      }
      return r
    })
  }
  wrapHandler('projects:close', fn => async (...args) => { const r = await fn(...args); await refreshCurrent({ fresh: null }); return r })
  // the desktop keeps a list of recent folders; a tab has only the project it holds
  wrapHandler('projects:list-recent', () => async () => [])
  // autosave on the desktop folds the database's log into its file; there is nothing to save to here (WEB-PRD §5.4)
  wrapHandler('projects:autosave', () => async () => null)
  wrapHandler('projects:reveal', () => async () => null)

  ipcMain.handle('web:project-import', async (_e, payload) => {
    const placed = importProject(payload)
    imported.add(normalize(placed.path))
    return placed
  })
  ipcMain.handle('web:project-export', async (_e, options = {}) => {
    if (!current) throw new Error('No project is open.')
    const out = exportProject(current.path, { ...options, name: current.name })
    baseline = changeGeneration()
    exportedAt = Date.now()
    return out
  })
  ipcMain.handle('web:project-state', async () => state())

  /** After every call: tell the page when the project's state changed (its name, whether it has unexported changes). */
  return function afterCall() {
    const s = state()
    const key = JSON.stringify({ ...s, bytes: Math.round(s.bytes / 65536) })
    if (key === lastSent) return
    lastSent = key
    post({ type: 'project-state', state: s })
  }
}
