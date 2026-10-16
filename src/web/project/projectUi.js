/**
 * The project's life in the web version, page side (WEB-PRD §5, Phase 3).
 *
 *   projectState   a store: { open, name, dirty, exportedAt, bytes } from the core worker
 *   webDialog      a store: which web dialog is open ('import' | 'export' | null)
 *   importProject  the Import dialog; resolves to the path of the project put into memory, or null
 *   exportProject  zip the open project and download it
 *   install()      put the web behaviour around the desktop's project calls, Ctrl+S / Ctrl+O, and the warning on leaving
 *
 * The desktop's own actions (src/renderer/src/stores/actions.js) still open, make and close projects; "Open Project…"
 * reaches projects.open(null), which here shows the Import dialog instead of a folder dialog, then opens what was
 * brought in with the desktop's own code (recovery, upgrade notices and all).
 */
import { writable, get } from 'svelte/store'
import { invoke, on } from '../bridge/worker.js'
import { download } from '../ui/download.js'
import { tr } from '../../shared/i18n.js'
import { askConfirm } from '../../renderer/src/stores/prompt.js'
import { toast } from '../../renderer/src/stores/ui.js'
import { WARN_PROJECT_BYTES, MAX_PROJECT_BYTES } from '../config.js'

export const projectState = writable({ open: false, name: null, dirty: false, exportedAt: null, bytes: 0 })
export const webDialog = writable(null)

/** Snapshots go into an export unless the person says otherwise (owner's decision, WEB-PRD §14 Q3); kept for the tab. */
export const includeSnapshots = writable(true)

/** The message of an error from the worker, without Electron's "Error invoking remote method" wrapping. */
export const messageOf = err => String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

let pendingImport = null   // resolve(path | null) of the Import dialog that is open

/** Show the Import dialog; resolves to the path of the project brought into memory, or null if the person cancels. */
export function importProject() {
  pendingImport?.(null)
  webDialog.set('import')
  return new Promise(resolve => { pendingImport = resolve })
}

/** The Import dialog is done. */
export function finishImport(path) {
  const resolve = pendingImport
  pendingImport = null
  webDialog.set(null)
  resolve?.(path)
}

const readBytes = file => file.arrayBuffer().then(b => new Uint8Array(b))

/**
 * Bring in what the person chose: one .zip or project.db file, or the files of a folder — from a folder picker (each
 * File with its webkitRelativePath) or dropped ([{ file, path }]). Resolves to { path, name } or throws an error whose
 * message can be shown.
 */
export async function bringIn(fileList) {
  const items = [...fileList].map(f => (f instanceof File ? { file: f, path: f.webkitRelativePath || f.name } : f))
  if (!items.length) return null
  const files = items.map(i => i.file)
  const total = files.reduce((n, f) => n + f.size, 0)
  if (total > MAX_PROJECT_BYTES) throw new Error(tr('web.project.tooBig'))
  if (total > WARN_PROJECT_BYTES && !await askConfirm(tr('web.project.large', { size: Math.round(total / 1048576) }))) return null

  let payload
  const asFolder = items.length > 1 || items[0].path.includes('/')
  if (asFolder) {
    payload = { kind: 'files', files: await Promise.all(items.map(async i => ({ path: i.path, bytes: await readBytes(i.file) }))) }
  } else {
    const [{ file }] = items
    payload = { kind: /\.db$/i.test(file.name) ? 'db' : 'zip', name: file.name, bytes: await readBytes(file) }
  }
  try { return await invoke('web:project-import', payload) } catch (err) { throw new Error(messageOf(err)) }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

let exporting = false

/** Zip the open project and download it. Returns the file name, or null when there is nothing to export. */
export async function exportProject(options = { includeSnapshots: get(includeSnapshots) }) {
  if (!get(projectState).open || exporting) return null
  exporting = true
  try {
    const { fileName, bytes } = await invoke('web:project-export', options)
    download(fileName, bytes, 'application/zip')
    toast(tr('web.project.exported', { file: fileName }), 'info', 5000)
    return fileName
  } catch (err) {
    toast(messageOf(err), 'error', 8000)
    return null
  } finally {
    exporting = false
    projectState.set(await invoke('web:project-state'))
  }
}

// ---------------------------------------------------------------------------
// Around the desktop's calls
// ---------------------------------------------------------------------------

/** Ask before unexported changes are thrown away; true when it is fine to go on. */
export async function mayDiscard() {
  const s = get(projectState)
  if (!s.open || !s.dirty) return true
  return askConfirm(tr('web.project.discard', { name: s.name }))
}

export function install() {
  on('web:project-state', s => projectState.set(s))
  invoke('web:project-state').then(s => projectState.set(s)).catch(() => {})

  const projects = window.spadewick.projects
  const open = projects.open, create = projects.create

  // "Open Project…" (the welcome screen, the menu): bring a project in, then open it with the desktop's code
  async function openBroughtIn() {
    if (!await mayDiscard()) return null
    const path = await importProject()
    return path ? open(path) : null
  }
  projects.open = path => (path ? open(path) : openBroughtIn())
  projects.openFile = () => openBroughtIn()

  // making a new project replaces the one in memory
  projects.create = async opts => (await mayDiscard() ? create(opts) : null)

  // Ctrl+S exports, Ctrl+O imports (WEB-PRD §5.4); the browser's own Save and Open would mean nothing here
  window.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
    const key = e.key.toLowerCase()
    if (key === 's') { e.preventDefault(); if (get(projectState).open) exportProject() }
    else if (key === 'o') { e.preventDefault(); import('../../renderer/src/stores/actions.js').then(a => a.openProject(null)) }
  }, true)

  // closing or reloading the tab ends the project: the browser asks first while there are unexported changes
  window.addEventListener('beforeunload', e => {
    if (get(projectState).dirty) { e.preventDefault(); e.returnValue = '' }
  })
}
