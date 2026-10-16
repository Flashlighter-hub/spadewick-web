/**
 * The menu's keyboard shortcuts in a browser (WEB-PRD Phase 9). Electron caught a menu's accelerators before the page
 * saw them; here a key press is matched against the menu's items (menu.js, keys.js) before the page handles it. A
 * shortcut whose item cannot be chosen now (no project open) still keeps the browser from doing something else with
 * the key (saving the page, opening its history).
 */
import { get } from 'svelte/store'
import { MENU, isEnabled, sendMenu } from './menu.js'
import { itemsWithKeys, shortcutFor } from './keys.js'
import { projectState } from '../project/projectUi.js'

export function install() {
  const items = itemsWithKeys(MENU)
  window.addEventListener('keydown', e => {
    if (e.defaultPrevented) return
    const item = shortcutFor(e, items, { canvasShown: !!document.querySelector('.canvas-editor') })
    if (!item) return
    e.preventDefault()
    e.stopPropagation()
    if (e.repeat || !isEnabled(item, get(projectState))) return
    sendMenu(item, { fromKeys: true })
  }, true)
}
