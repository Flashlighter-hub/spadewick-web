/**
 * Files dropped on the page (WEB-PRD Phase 4).
 *
 *   a project — a .spadewick.zip, a zip of a project folder, a project folder or a project.db — is imported
 *     (after asking, when the open project has changes not exported);
 *   pictures, with a project open, are added to its assets.
 * Drops that a part of the app handles itself (the Import dialog, reordering in a list) are left to it.
 */
import { get } from 'svelte/store'
import { tr } from '../../shared/i18n.js'
import { invoke } from '../bridge/worker.js'
import { toast } from '../../renderer/src/stores/ui.js'
import { projectState, mayDiscard, bringIn, messageOf } from '../project/projectUi.js'

const PICTURE = /\.(png|jpe?g|webp|svg)$/i
const PROJECT = /\.(zip|db)$/i

const hasFiles = e => [...(e.dataTransfer?.types ?? [])].includes('Files')

/** Every file of a dropped folder, with its path inside the drop ('Game/assets/a.png'). */
function readEntry(entry, path = entry.name) {
  if (entry.isFile) return new Promise((resolve, reject) => entry.file(file => resolve([{ file, path }]), reject))
  return new Promise((resolve, reject) => {
    const reader = entry.createReader()
    const all = []
    const next = () => reader.readEntries(async batch => {
      if (!batch.length) {
        try { resolve((await Promise.all(all.map(e => readEntry(e, `${path}/${e.name}`)))).flat()) } catch (err) { reject(err) }
        return
      }
      all.push(...batch)
      next()
    }, reject)
    next()
  })
}

async function dropped(e) {
  const items = [...(e.dataTransfer?.items ?? [])].filter(i => i.kind === 'file')
  const entries = items.map(i => i.webkitGetAsEntry?.()).filter(Boolean)
  const folders = entries.some(en => en.isDirectory)
  const list = entries.length ? (await Promise.all(entries.map(en => readEntry(en)))).flat() : [...(e.dataTransfer?.files ?? [])].map(file => ({ file, path: file.name }))
  return { list, folders }
}

async function onDrop(e) {
  if (!hasFiles(e) || e.defaultPrevented) return
  e.preventDefault()
  document.body.classList.remove('web-dropping')
  let drop
  try { drop = await dropped(e) } catch (err) { toast(messageOf(err), 'error', 6000); return }
  const { list, folders } = drop
  if (!list.length) return

  const isProject = folders || (list.length === 1 && PROJECT.test(list[0].path))
  if (isProject) {
    if (!await mayDiscard()) return
    try {
      const placed = await bringIn(list)
      if (placed) {
        const { openProject } = await import('../../renderer/src/stores/actions.js')
        await openProject(placed.path)
      }
    } catch (err) { toast(err.message, 'error', 9000) }
    return
  }

  if (list.every(f => PICTURE.test(f.path))) {
    if (!get(projectState).open) { toast(tr('web.drop.openFirst'), 'info', 5000); return }
    try {
      const files = await Promise.all(list.map(async f => ({ path: f.path, bytes: new Uint8Array(await f.file.arrayBuffer()) })))
      const paths = await invoke('web:put-files', files)
      const added = await window.spadewick.assets.import(paths)
      toast(tr('web.drop.added', { n: added?.length ?? 0 }), 'info', 4000)
      window.dispatchEvent(new CustomEvent('spadewick:history-applied'))   // the asset browser looks again
    } catch (err) { toast(messageOf(err), 'error', 8000) }
    return
  }
  toast(tr('web.drop.unknown'), 'info', 6000)
}

export function install() {
  window.addEventListener('dragover', e => {
    if (!hasFiles(e) || e.defaultPrevented) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    document.body.classList.add('web-dropping')
  })
  window.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('web-dropping') })
  window.addEventListener('drop', onDrop)
}
