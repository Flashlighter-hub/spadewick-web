/**
 * The menu's keys (WEB-PRD Phase 9): how an accelerator is shown, whether a key press is one, and which menu item a
 * key press is for. Nothing here touches the page, so the tests check it as it is.
 */

const isMac = () => /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '')

/** An accelerator as it is shown: 'Ctrl+Shift+Z' (or '⌘⇧Z' on a Mac). */
export function keysLabel(accelerator, mac = isMac()) {
  if (!accelerator) return ''
  const parts = accelerator.split('+').map(p => (p === '' ? '+' : p))
  if (mac) return parts.map(p => ({ CmdOrCtrl: '⌘', Shift: '⇧', Alt: '⌥', Plus: '+' }[p] ?? p)).join('')
  return parts.map(p => ({ CmdOrCtrl: 'Ctrl', Plus: '+' }[p] ?? p)).join('+')
}

/** Every item with keys, in menu order (the submenus opened). */
export function itemsWithKeys(menu) {
  return menu.flatMap(m => (m.submenu ? itemsWithKeys(m.submenu) : m.accelerator ? [m] : []))
}

/** Whether a key press is an accelerator: 'CmdOrCtrl+Shift+Z', 'Alt+N', 'CmdOrCtrl+,', 'CmdOrCtrl+Plus'. */
export function matches(accelerator, e) {
  const parts = accelerator.split('+')
  const key = parts.pop()
  const want = { mod: parts.includes('CmdOrCtrl'), shift: parts.includes('Shift'), alt: parts.includes('Alt') }
  if (!!(e.ctrlKey || e.metaKey) !== want.mod || !!e.altKey !== want.alt) return false
  if (key === 'Plus') return e.key === '+' || e.key === '='
  if (!!e.shiftKey !== want.shift) return false
  // Alt changes what e.key is on a Mac (Alt+N types ˜): the key's place on the keyboard decides then
  if (want.alt && /^[A-Z]$/i.test(key)) return e.code === `Key${key.toUpperCase()}`
  return String(e.key).toLowerCase() === key.toLowerCase()
}

/** Whether a key press happens while typing (a text field, a list box, editable text). */
export function isTyping(target) {
  if (!target || target === globalThis.document?.body) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(target.type)
}

/**
 * The menu item a key press is for, or null when the key is left to the page:
 *   - while typing, only the items marked `inFields` take their keys (the field keeps its own undo, select all, bold);
 *   - the canvas's own keys (`canvas`: zoom) are always left to it, and `canvasSelects` ones while it is shown.
 */
export function shortcutFor(e, items, { canvasShown = false } = {}) {
  const item = items.find(i => matches(i.accelerator, e))
  if (!item || item.canvas) return null
  if (item.canvasSelects && canvasShown) return null
  if (isTyping(e.target) && !item.inFields) return null
  return item
}

/** An accelerator as `aria-keyshortcuts` names it: 'Control+Shift+Z' (Meta on a Mac). */
export function ariaKeys(accelerator, mac = isMac()) {
  return accelerator.split('+').map(p => ({ CmdOrCtrl: mac ? 'Meta' : 'Control' }[p] ?? p)).join('+')
}
