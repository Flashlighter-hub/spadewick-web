/**
 * The core worker (WEB-PRD §3, Phase 1): the desktop app's main process, running in a Web Worker of the tab.
 *
 * It registers the desktop's own IPC handlers (src/main/ipc/, unchanged) on the `electron` shim and answers the page's
 * calls to them, so `window.spadewick` in the page behaves as it does in the desktop app.
 *
 * Messages, page → worker:
 *   { type: 'init', settings }                     the remembered settings (WEB-PRD §5.3); must come first
 *   { type: 'invoke', id, channel, args }          a call of window.spadewick.*
 * worker → page:
 *   { type: 'ready', channels }                    the handlers are registered
 *   { type: 'fatal', error }                       the core could not start
 *   { type: 'result', id, value }                  a call succeeded
 *   { type: 'result', id, error: { name, message } }
 *   { type: 'event', channel, args }               main → renderer events (project:changed)
 *   { type: 'remember', key, value }               a remembered setting changed: the page stores it
 *   { type: 'open-external', url }                 open a web link in a new tab
 *   { type: 'notice', key, what }                  something the user should be told
 *   { type: 'project-state', state }               the open project's name and whether it has unexported changes (Phase 3)
 *   { type: 'pick', id, folder, multiple, accept, title, hint }   show a file or folder picker (Phase 4) …
 * page → worker:
 *   { type: 'picked', id, files: [{ path, bytes }] | null }        … and what the person chose
 * worker → page:
 *   { type: 'download', fileName, bytes, mime }    a file for the person (something the core saved, Phase 4)
 */
import './globals.js'
import Store from '../shims/electron-store.js'
import { connectPage, handlerOf, channels, ipcMain } from '../shims/electron.js'
import { SETTINGS_DEFAULTS } from '../config.js'
import { loadSqlite } from '../sqlite/engine.js'
import { loadResvg } from '../raster/resvg.js'
import { mountSiteResources } from '../resources/resources.js'
import resvgWasmUrl from '@resvg/resvg-wasm/index_bg.wasm?url'

const post = message => self.postMessage(message)
const waiting = []          // calls that arrived before the core was ready
let ready = false
let afterCall = () => {}
let dialogs = null
let inFlight = 0

self.onmessage = event => {
  const message = event.data
  if (message?.type === 'init') { start(message).catch(fail); return }
  if (message?.type === 'invoke') { if (ready) answer(message); else waiting.push(message) }
  if (message?.type === 'picked') dialogs?.answerPick(message)
}

function fail(err) {
  console.error('The core could not start', err)
  post({ type: 'fatal', error: { name: err?.name ?? 'Error', message: String(err?.message ?? err) } })
}

async function start({ settings }) {
  const { createDialogs } = await import('../files/dialogs.js')
  dialogs = createDialogs(post)
  connectPage(post, dialogs)
  const store = new Store({ defaults: SETTINGS_DEFAULTS, saved: settings ?? {}, onRemember: (key, value) => post({ type: 'remember', key, value }) })

  // the fonts must be listed before the core loads: it reads the list of bundled families when it starts (fontFiles.js)
  await mountSiteResources()
  // the core is loaded only now, after globals.js has given it Buffer and process; the database and drawing engines with it
  const [{ registerIpcHandlers }, { onProjectChange }] = await Promise.all([
    import('../../main/ipc/index.js'),
    import('../../main/core/changes.js'),
    loadSqlite(),
    loadResvg(fetch(resvgWasmUrl))
  ])
  registerIpcHandlers(store)
  const { registerWebProject } = await import('../project/service.js')
  afterCall = registerWebProject(post)
  ipcMain.handle('web:put-files', async (_e, files) => dialogs.put(files))
  onProjectChange(change => post({ type: 'event', channel: 'project:changed', args: [change] }))

  ready = true
  post({ type: 'ready', channels: channels() })
  for (const message of waiting.splice(0)) answer(message)
}

const PROJECT_CHANGES = new Set(['projects:create', 'projects:open', 'projects:open-file', 'projects:close'])

async function answer({ id, channel, args }) {
  const fn = handlerOf(channel)
  inFlight++
  try {
    if (!fn) throw new Error(`No handler registered for '${channel}'`)
    const value = await fn({ sender: null }, ...(args ?? []))
    post({ type: 'result', id, value: dialogs.shown(value) })
  } catch (err) {
    post({ type: 'result', id, error: { name: err?.name ?? 'Error', message: String(err?.message ?? err), code: err?.code } })
  } finally {
    inFlight--
  }
  try {
    if (PROJECT_CHANGES.has(channel)) dialogs.clearImports()
    // what the core saved goes to the person once nothing is still writing (a long export, while the page asks how far it is)
    if (inFlight === 0) dialogs.deliver()
  } catch (err) { console.error('downloads', err) }
  try { afterCall() } catch (err) { console.error('project state', err) }
}
