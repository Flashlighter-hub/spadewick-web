/**
 * The desktop's file dialogs in a tab (WEB-PRD Phase 4), page side: the browser's file and folder pickers, and the files
 * the core saves handed to the person as downloads.
 *
 * A browser opens a file picker only during a person's click (for about five seconds). The core asks for a file a
 * moment after the click that started it — usually still in time; when it is not, a small dialog asks the person to
 * click "Choose…", and that click opens the picker.
 */
import { writable } from 'svelte/store'
import { on, answerPick } from '../bridge/worker.js'
import { download } from '../ui/download.js'

/** The picker request waiting for the person's click, or null (shown by PickDialog.svelte). */
export const pickRequest = writable(null)

const readAll = files => Promise.all([...files].map(async f => ({ path: f.webkitRelativePath || f.name, bytes: new Uint8Array(await f.arrayBuffer()) })))

/** Open the picker for a request; answers the worker once the person has chosen or cancelled. */
export function openPicker(request) {
  pickRequest.set(null)
  const input = document.createElement('input')
  input.type = 'file'
  if (request.folder) input.webkitdirectory = true
  if (request.multiple) input.multiple = true
  if (request.accept) input.accept = request.accept
  input.style.display = 'none'
  let done = false
  const finish = async files => {
    if (done) return
    done = true
    input.remove()
    try { answerPick(request.id, files?.length ? await readAll(files) : null) } catch (err) { console.error(err); answerPick(request.id, null) }
  }
  input.addEventListener('change', () => finish(input.files))
  input.addEventListener('cancel', () => finish(null))
  document.body.append(input)
  input.click()
}

/** The person closed the "Choose…" dialog without choosing. */
export function cancelPick(request) {
  pickRequest.set(null)
  answerPick(request.id, null)
}

export function install() {
  on('web:pick', async request => {
    // the end-to-end tests choose files for the person (tests/e2e/harness.js); nothing sets this in normal use
    const e2e = globalThis.__SPADEWICK_E2E__
    if (e2e?.pick) { const files = await e2e.pick(request); if (files !== undefined) { answerPick(request.id, files); return } }
    // still within the click that asked for it: open the picker straight away
    if (navigator.userActivation?.isActive) openPicker(request)
    else pickRequest.set(request)
  })
  on('web:download', ({ fileName, bytes, mime }) => download(fileName, bytes, mime))
}
