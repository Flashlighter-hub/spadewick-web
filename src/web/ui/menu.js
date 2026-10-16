/**
 * The application menu of the web version, as data (WEB-PRD Phase 1; drawn by the menu bar of Phase 9).
 *
 * The desktop app built this menu with Electron in src/main/index.js; each item sent a `menu:*` event that the interface
 * (App.svelte) already listens to. Here each item names the same event (`channel`, `args`), and `sendMenu` delivers it
 * through the bridge, so the interface needs no change. Labels are functions so they follow the active language.
 *
 * Phase 9 turns File → Open into Import, adds Export Project, and removes what a browser cannot do (marked below).
 */
import { tr } from '../../shared/i18n.js'
import { emit } from '../bridge/worker.js'

export const MENU = [
  {
    label: () => tr('menu.file'),
    submenu: [
      { label: () => tr('menu.newProject'), accelerator: 'CmdOrCtrl+N', channel: 'menu:new-project' },
      { label: () => tr('menu.openProject'), accelerator: 'CmdOrCtrl+O', channel: 'menu:open-project' },
      { label: () => tr('menu.openProjectFileDb'), channel: 'menu:open-project-file' },                       // Phase 9: merged into Import
      { label: () => tr('menu.recentProjects'), submenu: [{ label: () => tr('menu.noRecentProjects'), enabled: false }] },   // Phase 9: removed
      { type: 'separator' },
      { label: () => tr('menu.closeProject'), channel: 'menu:close-project' },
      { label: () => tr('menu.duplicateProject'), channel: 'menu:duplicate-project' },                         // Phase 9: Export a Copy As…
      { label: () => tr('menu.revealInExplorer'), channel: 'menu:reveal-project' },                            // Phase 9: removed
      { type: 'separator' },
      {
        label: () => tr('menu.export'),
        submenu: [
          { label: () => tr('menu.tabletopSimulator'), channel: 'menu:export-tts' },
          { label: () => tr('menu.printAndPlayPdf'), channel: 'menu:export-pdf' },
          { label: () => tr('menu.pngSheet'), channel: 'menu:export-png' }
        ]
      },
      { type: 'separator' },
      { label: () => tr('menu.preferences'), accelerator: 'CmdOrCtrl+,', channel: 'menu:preferences' }
    ]
  },
  {
    label: () => tr('menu.edit'),
    submenu: [
      { label: () => tr('menu.undo'), accelerator: 'CmdOrCtrl+Z', channel: 'menu:undo' },
      { label: () => tr('menu.redo'), accelerator: 'CmdOrCtrl+Shift+Z', channel: 'menu:redo' },
      { type: 'separator' },
      { label: () => tr('menu.findAndReplace'), accelerator: 'CmdOrCtrl+H', channel: 'menu:find-replace' },
      { label: () => tr('menu.selectAllCards'), accelerator: 'CmdOrCtrl+A', channel: 'menu:select-all' }
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
      { label: () => tr('menu.zoomIn'), accelerator: 'CmdOrCtrl+Plus', channel: 'menu:canvas', args: ['zoom-in'] },
      { label: () => tr('menu.zoomOut'), accelerator: 'CmdOrCtrl+-', channel: 'menu:canvas', args: ['zoom-out'] },
      { label: () => tr('menu.zoomActual'), accelerator: 'CmdOrCtrl+1', channel: 'menu:canvas', args: ['zoom-reset'] },
      { label: () => tr('menu.zoomFit'), accelerator: 'CmdOrCtrl+0', channel: 'menu:canvas', args: ['zoom-fit'] }
      // the desktop's Toggle Developer Tools and Reload are the browser's own (Reload would also end the project)
    ]
  },
  {
    label: () => tr('menu.project'),
    submenu: [
      { label: () => tr('menu.manageFields'), channel: 'menu:manage-fields' },
      { label: () => tr('menu.cardIds'), channel: 'menu:card-ids' },
      { label: () => tr('menu.manageFonts'), channel: 'menu:manage-fonts' },
      { label: () => tr('menu.icons'), channel: 'menu:icons' },
      { label: () => tr('menu.textStyles'), channel: 'menu:text-styles' },
      { label: () => tr('menu.checkText'), channel: 'menu:check-text' },
      { label: () => tr('menu.checkPrint'), channel: 'menu:check-print' },
      { type: 'separator' },
      { label: () => tr('menu.createSnapshot'), channel: 'menu:create-snapshot' },
      { label: () => tr('menu.viewSnapshots'), channel: 'menu:view-snapshots' },
      { label: () => tr('menu.whatChanged'), channel: 'menu:what-changed' }
    ]
  },
  {
    label: () => tr('menu.help'),
    submenu: [
      { label: () => tr('menu.guide'), channel: 'menu:guide' },
      { type: 'separator' },
      { label: () => tr('menu.aboutSpadewick'), channel: 'menu:about' },
      { label: () => tr('menu.openLogsFolder'), channel: 'menu:open-logs' },                                   // Phase 9: removed
      { label: () => tr('menu.checkDatabaseIntegrity'), channel: 'menu:db-integrity' }
    ]
  }
]

/** The window title the desktop app gave its window. */
export const appTitle = () => tr('menu.appTitle')

/** Do what a menu item does: send its event, as Electron's menu did. */
export function sendMenu(item) {
  if (item?.channel && item.enabled !== false) emit(item.channel, ...(item.args ?? []))
}
