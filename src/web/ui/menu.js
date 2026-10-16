/**
 * The application menu of the web version (WEB-PRD Phase 9), as data: drawn by MenuBar.svelte, its keys handled by
 * shortcuts.js (with keys.js).
 *
 * The desktop app built this menu with Electron in src/main/index.js; each item sent a `menu:*` event that the interface
 * (App.svelte) already listens to. Here an item names the same event (`channel`, `args`), so the interface needs no
 * change; items that exist only in the web version run an `action` instead. Labels are functions so they follow the
 * active language.
 *
 * Item fields:
 *   label        () => text
 *   channel/args the menu:* event to send, or
 *   action       () => void, what to do
 *   keyAction    () => void, what the keyboard shortcut does when it differs from a click (Ctrl+S exports at once)
 *   accelerator  the keys, in Electron's form ('CmdOrCtrl+Shift+Z'); shown in the menu
 *   inFields     the shortcut also works while typing in a field (otherwise the field gets the key: its own undo, select all)
 *   canvas       the template canvas handles the key itself; the menu only shows it, so the browser's zoom works elsewhere
 *   canvasSelects  the key is the canvas's own while the template canvas is shown (Ctrl+A selects its elements)
 *   needs        'project' | 'library': disabled without an open project, or without items in the library
 *
 * Changed from the desktop: Open Project… is Import Project… (a .db file is imported the same way, so Open Project File
 * is gone), Export Project and Download Library are added, Duplicate Project is Export a Copy As…; removed are Recent
 * Projects, Reveal in Explorer, Open Logs Folder (Help → Copy Error Report instead, Phase 10), Toggle Developer Tools and Reload (the browser has the last two, and
 * a reload ends the project). New Project is Alt+N: browsers keep Ctrl+N for a new window.
 */
import { tr } from '../../shared/i18n.js'
import { emit } from '../bridge/worker.js'
import { webDialog, exportProject, exportLibrary, mayDiscard } from '../project/projectUi.js'

const actions = () => import('../../renderer/src/stores/actions.js')

export const MENU = [
  {
    label: () => tr('menu.file'),
    submenu: [
      { label: () => tr('menu.newProject'), accelerator: 'Alt+N', inFields: true, channel: 'menu:new-project' },
      { label: () => tr('menu.openProject'), accelerator: 'CmdOrCtrl+O', inFields: true, channel: 'menu:open-project' },
      { label: () => tr('web.menu.exportProject'), accelerator: 'CmdOrCtrl+S', inFields: true, needs: 'project', action: () => webDialog.set('export'), keyAction: () => exportProject() },
      { label: () => tr('menu.duplicateProject'), needs: 'project', channel: 'menu:duplicate-project' },
      { label: () => tr('menu.closeProject'), needs: 'project', action: async () => { if (await mayDiscard()) (await actions()).closeProject() } },
      { type: 'separator' },
      {
        label: () => tr('menu.export'),
        needs: 'project',
        submenu: [
          { label: () => tr('menu.tabletopSimulator'), needs: 'project', channel: 'menu:export-tts' },
          { label: () => tr('menu.printAndPlayPdf'), needs: 'project', channel: 'menu:export-pdf' },
          { label: () => tr('menu.pngSheet'), needs: 'project', channel: 'menu:export-png' }
        ]
      },
      { label: () => tr('web.menu.downloadLibrary'), needs: 'library', action: () => exportLibrary() },
      { type: 'separator' },
      { label: () => tr('menu.preferences'), accelerator: 'CmdOrCtrl+,', inFields: true, channel: 'menu:preferences' }
    ]
  },
  {
    label: () => tr('menu.edit'),
    submenu: [
      { label: () => tr('menu.undo'), accelerator: 'CmdOrCtrl+Z', needs: 'project', channel: 'menu:undo' },
      { label: () => tr('menu.redo'), accelerator: 'CmdOrCtrl+Shift+Z', needs: 'project', channel: 'menu:redo' },
      { type: 'separator' },
      { label: () => tr('menu.findAndReplace'), accelerator: 'CmdOrCtrl+H', needs: 'project', channel: 'menu:find-replace' },
      { label: () => tr('menu.selectAllCards'), accelerator: 'CmdOrCtrl+A', canvasSelects: true, needs: 'project', channel: 'menu:select-all' }
    ]
  },
  {
    label: () => tr('menu.view'),
    submenu: [
      { label: () => tr('menu.toggleSidebar'), accelerator: 'CmdOrCtrl+B', channel: 'menu:toggle-sidebar' },
      { type: 'separator' },
      { label: () => tr('menu.cardPreviewSmall'), channel: 'menu:preview-size', args: ['small'] },
      { label: () => tr('menu.cardPreviewMedium'), channel: 'menu:preview-size', args: ['medium'] },
      { label: () => tr('menu.cardPreviewLarge'), channel: 'menu:preview-size', args: ['large'] },
      { type: 'separator' },
      { label: () => tr('menu.toggleRulers'), channel: 'menu:canvas', args: ['rulers'] },
      { label: () => tr('menu.toggleGrid'), channel: 'menu:canvas', args: ['grid'] },
      { label: () => tr('menu.toggleSnap'), channel: 'menu:canvas', args: ['snap'] },
      { label: () => tr('menu.toggleGuides'), channel: 'menu:canvas', args: ['guides'] },
      { type: 'separator' },
      { label: () => tr('menu.zoomIn'), accelerator: 'CmdOrCtrl+Plus', canvas: true, channel: 'menu:canvas', args: ['zoom-in'] },
      { label: () => tr('menu.zoomOut'), accelerator: 'CmdOrCtrl+-', canvas: true, channel: 'menu:canvas', args: ['zoom-out'] },
      { label: () => tr('menu.zoomActual'), accelerator: 'CmdOrCtrl+1', canvas: true, channel: 'menu:canvas', args: ['zoom-reset'] },
      { label: () => tr('menu.zoomFit'), accelerator: 'CmdOrCtrl+0', canvas: true, channel: 'menu:canvas', args: ['zoom-fit'] }
    ]
  },
  {
    label: () => tr('menu.project'),
    submenu: [
      { label: () => tr('menu.manageFields'), needs: 'project', channel: 'menu:manage-fields' },
      { label: () => tr('menu.cardIds'), needs: 'project', channel: 'menu:card-ids' },
      { label: () => tr('menu.manageFonts'), needs: 'project', channel: 'menu:manage-fonts' },
      { label: () => tr('menu.icons'), needs: 'project', channel: 'menu:icons' },
      { label: () => tr('menu.textStyles'), needs: 'project', channel: 'menu:text-styles' },
      { label: () => tr('menu.checkText'), needs: 'project', channel: 'menu:check-text' },
      { label: () => tr('menu.checkPrint'), needs: 'project', channel: 'menu:check-print' },
      { type: 'separator' },
      { label: () => tr('menu.createSnapshot'), needs: 'project', channel: 'menu:create-snapshot' },
      { label: () => tr('menu.viewSnapshots'), needs: 'project', channel: 'menu:view-snapshots' },
      { label: () => tr('menu.whatChanged'), needs: 'project', channel: 'menu:what-changed' }
    ]
  },
  {
    label: () => tr('menu.help'),
    submenu: [
      { label: () => tr('menu.guide'), channel: 'menu:guide' },
      { type: 'separator' },
      { label: () => tr('menu.aboutSpadewick'), channel: 'menu:about' },
      { label: () => tr('menu.checkDatabaseIntegrity'), needs: 'project', channel: 'menu:db-integrity' },
      { label: () => tr('web.menu.copyErrorReport'), action: async () => (await import('./recovery.js')).copyErrorReport() }
    ]
  }
]

/** The window title the desktop app gave its window. */
export const appTitle = () => tr('menu.appTitle')

/** Whether an item can be chosen, given the project state ({ open, libraryItems }). */
export const isEnabled = (item, state) =>
  item.enabled !== false && (item.needs !== 'project' || !!state?.open) && (item.needs !== 'library' || !!state?.libraryItems)

/** Do what a menu item does: run its action, or send its event as Electron's menu did. */
export function sendMenu(item, { fromKeys = false } = {}) {
  if (!item || item.enabled === false) return
  const run = (fromKeys && item.keyAction) || item.action
  if (run) { run(); return }
  if (item.channel) emit(item.channel, ...(item.args ?? []))
}
