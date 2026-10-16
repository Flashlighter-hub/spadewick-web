/**
 * The desktop's file dialogs in a browser tab (WEB-PRD Phase 4), worker side.
 *
 * The core asks for files and places through Electron's dialogs and gets paths back; here the paths are in the
 * in-memory file system:
 *
 *   open a file / files     the page shows the browser's file picker; what the person chose is copied into
 *                           /imports/<n>/ and those paths are the answer
 *   open a folder (to read) the page shows a folder picker; the folder is copied into /imports/<n>/<folder>
 *   choose where to save    answered at once with /downloads/<n>/<file name>: nothing is asked
 *   choose a folder to      answered at once with /downloads/<n>/ (openDirectory with createDirectory: an output folder)
 *   write into
 *
 * After every call of the core (`afterCall`), what was written into a /downloads/<n>/ folder is handed to the page
 * as a download — one file as it is, a project folder as a .spadewick.zip, several files as one zip — and the folder
 * is deleted. Nothing stays behind: imports are kept only for the last few dialogs (some features read the chosen
 * file again in a later call), and all of them go when the project is closed.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'fs'
import { join, dirname, basename, extname, normalize as normalizePath } from 'path'
import { walk } from '../../main/snapshotCore.js'
import { writeZip } from '../../main/zip.js'
import { closeProjectDb } from '../../main/db.js'
import { tr } from '../../shared/i18n.js'
import { exportProject, nameInDatabase } from '../project/service.js'

const IMPORTS = '/imports'
const DOWNLOADS = '/downloads'
const KEEP_IMPORTS = 4

let seq = 0
const nextFolder = (root, prefix) => {
  mkdirSync(root, { recursive: true })
  let dir
  do { dir = join(root, `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`) } while (existsSync(dir))
  mkdirSync(dir)
  return dir
}

const safeName = name => basename(String(name ?? '')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'download'

/** A path the page gave (a file's name, or its path inside a chosen folder), safe to put under a folder of ours. */
const relPath = p => String(p ?? '').replace(/\\/g, '/').split('/').filter(x => x && x !== '.' && x !== '..').join('/') || 'file'

/** The `accept` attribute of a file picker, from Electron's filters. */
export function acceptOf(filters) {
  const exts = (filters ?? []).flatMap(f => f.extensions ?? []).filter(e => e && e !== '*')
  return exts.length ? [...new Set(exts.map(e => `.${String(e).replace(/^\./, '').toLowerCase()}`))].join(',') : ''
}

/**
 * Make the dialogs. `post(message)` sends to the page; the page answers a { type: 'pick', id, … } with
 * { type: 'picked', id, files: [{ path, bytes }] | null } through `answerPick`.
 */
export function createDialogs(post) {
  const picks = new Map()      // id -> resolve(files | null)
  let pickId = 1
  const importFolders = []     // newest last
  /**
   * /downloads/<n> folders whose contents go to the person after a call:
   *   { savedAs }   the file name a save dialog answered (null for a folder chosen to write into)
   *   { zipName }   what several files are called together (an export: "My Game - Tabletop Simulator")
   *   { keep }      the folder stays after its first download, so a later call can read it again and write more into it
   *                 (the Steam Cloud links of a Tabletop Simulator export); only what is new is downloaded then
   *   { delivered } file path -> mtime of what the person already has
   */
  const downloadFolders = new Map()

  function askPage(request) {
    const id = pickId++
    return new Promise(resolve => {
      picks.set(id, resolve)
      post({ type: 'pick', id, ...request })
    })
  }

  function answerPick({ id, files }) {
    const resolve = picks.get(id)
    picks.delete(id)
    resolve?.(files)
  }

  function keepImport(dir) {
    importFolders.push(dir)
    while (importFolders.length > KEEP_IMPORTS) rmSync(importFolders.shift(), { recursive: true, force: true })
  }

  /** Forget every import (the project was closed or replaced). */
  function clearImports() {
    while (importFolders.length) rmSync(importFolders.shift(), { recursive: true, force: true })
  }

  async function open(opts = {}) {
    const props = opts.properties ?? []
    const folder = props.includes('openDirectory')
    if (folder && props.includes('createDirectory')) {
      // a folder to write into: nothing to ask, what is written there is downloaded
      const dir = nextFolder(DOWNLOADS, 'out-')
      downloadFolders.set(dir, { savedAs: null, zipName: null, keep: false, delivered: new Map() })
      return { canceled: false, filePaths: [dir] }
    }
    // Locate an image of an SVG design: the person may choose the other pictures of its folder with it, so they are found too
    const siblings = !folder && opts.title === tr('dialogs.locateImage')
    const files = await askPage({
      folder,
      multiple: !folder && (props.includes('multiSelections') || siblings),
      accept: folder ? '' : acceptOf(opts.filters),
      title: opts.title ?? '',
      hint: siblings ? 'siblings' : ''
    })
    if (!files?.length) return { canceled: true, filePaths: [] }
    const dir = nextFolder(IMPORTS, 'pick-')
    for (const f of files) {
      const rel = relPath(f.path)
      const file = join(dir, rel)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, f.bytes)
    }
    keepImport(dir)
    if (folder) {
      const [top] = readdirSync(dir)
      return { canceled: false, filePaths: [join(dir, top)] }
    }
    // the chosen file first, as the core takes filePaths[0] when it wanted one
    return { canceled: false, filePaths: files.map(f => join(dir, relPath(f.path))) }
  }

  async function save(opts = {}) {
    const dir = nextFolder(DOWNLOADS, 'save-')
    let name = safeName(opts.defaultPath)
    const ext = (opts.filters ?? []).flatMap(f => f.extensions ?? []).find(e => e && e !== '*')
    if (ext && !extname(name)) name += `.${ext}`
    downloadFolders.set(dir, { savedAs: name, zipName: null, keep: false, delivered: new Map() })
    return { canceled: false, filePath: join(dir, name) }
  }

  /**
   * A folder for an export the person did not choose a folder for (WEB-PRD Phase 7): everything it writes is downloaded,
   * several files as one zip called `zipName`. The newest export folder is kept, for what is asked of it afterwards.
   */
  function exportFolder(zipName) {
    for (const [dir, info] of [...downloadFolders]) if (info.keep) { rmSync(dir, { recursive: true, force: true }); downloadFolders.delete(dir) }
    const dir = nextFolder(DOWNLOADS, 'export-')
    downloadFolders.set(dir, { savedAs: null, zipName: safeName(zipName), keep: true, delivered: new Map() })
    return dir
  }

  /** After a call: download what was written into the download folders (what is new, for a kept one), and delete them. */
  function deliver() {
    for (const [dir, info] of [...downloadFolders]) {
      if (!existsSync(dir)) { downloadFolders.delete(dir); continue }
      const entries = readdirSync(dir)
      if (!entries.length) continue          // nothing written yet (a folder chosen for a later export)
      const files = walk(dir)
      const fresh = files.filter(f => info.delivered.get(f.file) !== statSync(f.file).mtimeMs)
      if (!fresh.length) continue
      try {
        if (info.keep && info.delivered.size) {
          // a later call wrote more into a kept export folder: those files, each as it is
          for (const f of fresh) post({ type: 'download', fileName: basename(f.file), bytes: readFileSync(f.file), mime: mimeOf(f.file) })
        } else {
          const out = packageFolder(dir, entries, info)
          if (out) post({ type: 'download', fileName: out.fileName, bytes: out.bytes, mime: out.mime })
        }
        for (const f of files) info.delivered.set(f.file, statSync(f.file).mtimeMs)
      } finally {
        if (!info.keep) {
          for (const e of entries) { try { closeProjectDb(join(dir, e)) } catch { /* not a project */ } }
          rmSync(dir, { recursive: true, force: true })
          downloadFolders.delete(dir)
        }
      }
    }
  }

  /** Kept export folders go with the project they came from. */
  function clearExports() {
    for (const [dir, info] of [...downloadFolders]) if (info.keep) { rmSync(dir, { recursive: true, force: true }); downloadFolders.delete(dir) }
  }

  /**
   * A place in a download folder means nothing to the person: they get a file. Answers name that file instead (in
   * `path`, `file` and `outputDir`): the file itself, or the zip a folder arrives in. Called before the download is made.
   */
  function shown(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    let out = value
    for (const key of ['path', 'file', 'outputDir']) {
      const v = value[key]
      if (typeof v !== 'string' || !v.startsWith(`${DOWNLOADS}/`)) continue
      out = { ...out, [key]: downloadName(v) }
    }
    return out
  }

  function downloadName(path) {
    try {
      if (!statSync(path).isDirectory()) return basename(path)
      if (existsSync(join(path, 'project.db'))) return `${basename(path)}.spadewick.zip`
      const info = downloadFolders.get(normalizePath(path))
      const entries = readdirSync(path)
      if (info && entries.length === 1 && statSync(join(path, entries[0])).isFile()) return entries[0]
      if (info?.zipName) return `${info.zipName}.zip`
      if (info?.savedAs) return `${basename(info.savedAs, extname(info.savedAs))}.zip`
      return `${basename(path)}.zip`
    } catch { return basename(path) }
  }

  /** Files the page was given (dropped on it): put them in /imports and answer their paths. */
  function put(files) {
    const dir = nextFolder(IMPORTS, 'drop-')
    const out = []
    for (const f of files ?? []) {
      const rel = relPath(f.path)
      const file = join(dir, rel)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, f.bytes)
      out.push(file)
    }
    keepImport(dir)
    return out
  }

  return { open, save, put, answerPick, deliver, clearImports, clearExports, exportFolder, shown, downloadFolders }
}

/**
 * What to download for a folder: one file as it is; a project as a .spadewick.zip; anything else as one zip, named
 * after the export, the file that was saved (a Markdown page with its pictures) or the one folder written (rules/).
 */
function packageFolder(dir, entries, { savedAs, zipName } = {}) {
  if (entries.length === 1) {
    const only = join(dir, entries[0])
    if (statSync(only).isFile()) return { fileName: entries[0], bytes: readFileSync(only), mime: mimeOf(entries[0]) }
    if (existsSync(join(only, 'project.db'))) {
      // a copy of the project (Duplicate: "Export a copy as…")
      const name = projectName(only) ?? entries[0]
      const { fileName, bytes } = exportProject(only, { name })
      return { fileName, bytes, mime: 'application/zip' }
    }
  }
  const files = walk(dir).map(e => ({ name: e.name, file: e.file }))
  if (!files.length) return null
  const zip = join(dirname(dir), `${basename(dir)}.zip`)
  writeZip(zip, files)
  try {
    const top = zipName ?? (savedAs ? basename(savedAs, extname(savedAs)) : entries.length === 1 ? entries[0] : 'Spadewick export')
    return { fileName: `${safeName(top)}.zip`, bytes: readFileSync(zip), mime: 'application/zip' }
  } finally { rmSync(zip, { force: true }) }
}

/** The name in a copied project's database (Duplicate left the copy open: closing it writes it into its file). */
function projectName(dir) {
  try { closeProjectDb(dir) } catch { /* not open */ }
  return nameInDatabase(join(dir, 'project.db'))
}

const MIME = { '.json': 'application/json', '.md': 'text/markdown', '.html': 'text/html', '.csv': 'text/csv', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.zip': 'application/zip', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
const mimeOf = name => MIME[extname(name).toLowerCase()] ?? 'application/octet-stream'
