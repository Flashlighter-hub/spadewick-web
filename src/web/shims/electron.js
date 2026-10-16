/**
 * `electron` for the core worker (WEB-PRD Phase 1): what src/main/ipc/*.js use of it.
 *
 *   ipcMain   handlers are kept here and called by the worker when the page invokes a channel (core.worker.js)
 *   dialog    file dialogs; in the browser they become file pickers and downloads (WEB-PRD Phase 4)
 *   shell     opening a web link asks the page to open a tab; opening a folder does nothing (there is none)
 *
 * The worker gives this module its way to talk to the page with `connectPage`.
 */
let toPage = () => {}
let dialogs = null

/** Called once by the worker: `post(message)` sends to the page; `dialogImpl` answers file dialogs (Phase 4). */
export function connectPage(post, dialogImpl = null) { toPage = post; dialogs = dialogImpl }

const handlers = new Map()

export const ipcMain = {
  handle(channel, fn) {
    if (handlers.has(channel)) throw new Error(`Attempted to register a second handler for '${channel}'`)
    handlers.set(channel, fn)
  },
  handleOnce(channel, fn) { ipcMain.handle(channel, async (...a) => { handlers.delete(channel); return fn(...a) }) },
  removeHandler(channel) { handlers.delete(channel) },
  on() {},
  off() {}
}

/** The handler of a channel, or undefined. */
export const handlerOf = channel => handlers.get(channel)
export const channels = () => [...handlers.keys()]

function notYet(what) {
  toPage({ type: 'notice', key: 'notYet', what })
}

export const dialog = {
  async showOpenDialog(_win, opts) {
    const o = opts ?? _win
    if (dialogs?.open) return dialogs.open(o)
    notYet('open')
    return { canceled: true, filePaths: [] }
  },
  async showSaveDialog(_win, opts) {
    const o = opts ?? _win
    if (dialogs?.save) return dialogs.save(o)
    notYet('save')
    return { canceled: true }
  },
  async showMessageBox() { return { response: 0 } },
  showErrorBox(title, content) { toPage({ type: 'notice', key: 'error', what: `${title}: ${content}` }) }
}

export const shell = {
  async openExternal(url) {
    const u = String(url)
    if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u)) toPage({ type: 'open-external', url: u })
  },
  async openPath() { return '' },
  showItemInFolder() {}
}

export const app = {
  isPackaged: true,
  getPath: () => '/tmp',
  getVersion: () => '2.0.0-web',
  getName: () => 'Spadewick',
  on() {}
}

export const BrowserWindow = { getAllWindows: () => [], getFocusedWindow: () => null }
export const Menu = { setApplicationMenu() {}, buildFromTemplate: t => t }

export default { ipcMain, dialog, shell, app, BrowserWindow, Menu }
