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
 */
import './globals.js'
import Store from '../shims/electron-store.js'
import { connectPage, handlerOf, channels } from '../shims/electron.js'
import { SETTINGS_DEFAULTS } from '../config.js'
import { loadSqlite } from '../sqlite/engine.js'

const post = message => self.postMessage(message)
const waiting = []          // calls that arrived before the core was ready
let ready = false

self.onmessage = event => {
  const message = event.data
  if (message?.type === 'init') { start(message).catch(fail); return }
  if (message?.type === 'invoke') { if (ready) answer(message); else waiting.push(message) }
}

function fail(err) {
  console.error('The core could not start', err)
  post({ type: 'fatal', error: { name: err?.name ?? 'Error', message: String(err?.message ?? err) } })
}

async function start({ settings }) {
  connectPage(post)
  const store = new Store({ defaults: SETTINGS_DEFAULTS, saved: settings ?? {}, onRemember: (key, value) => post({ type: 'remember', key, value }) })

  // the core is loaded only now, after globals.js has given it Buffer and process; the database engine with it
  const [{ registerIpcHandlers }, { onProjectChange }] = await Promise.all([
    import('../../main/ipc/index.js'),
    import('../../main/core/changes.js'),
    loadSqlite()
  ])
  registerIpcHandlers(store)
  onProjectChange(change => post({ type: 'event', channel: 'project:changed', args: [change] }))

  ready = true
  post({ type: 'ready', channels: channels() })
  for (const message of waiting.splice(0)) answer(message)
}

async function answer({ id, channel, args }) {
  const fn = handlerOf(channel)
  try {
    if (!fn) throw new Error(`No handler registered for '${channel}'`)
    const value = await fn({ sender: null }, ...(args ?? []))
    post({ type: 'result', id, value })
  } catch (err) {
    post({ type: 'result', id, error: { name: err?.name ?? 'Error', message: String(err?.message ?? err), code: err?.code } })
  }
}
