// The web menu bar (WEB-PRD Phase 9): every item reaches something the interface listens to, and its keys work as a
// browser allows.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { keysLabel, ariaKeys, matches, shortcutFor, isTyping, itemsWithKeys } from '../../src/web/ui/keys.js'

const require = createRequire(import.meta.url)
const read = f => require('fs').readFileSync(f, 'utf8')
const menuSource = read('src/web/ui/menu.js')
const app = read('src/renderer/src/App.svelte')

const key = (k, mods = {}) => ({ key: k, code: /^[a-z]$/i.test(k) ? `Key${k.toUpperCase()}` : '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: null, ...mods })
const field = { tagName: 'INPUT', type: 'text' }

// the items with keys, as menu.js has them (the flags that decide who gets a key)
const items = itemsWithKeys([
  { submenu: [
    { accelerator: 'Alt+N', inFields: true, id: 'new' },
    { accelerator: 'CmdOrCtrl+O', inFields: true, id: 'import' },
    { accelerator: 'CmdOrCtrl+S', inFields: true, id: 'export' },
    { accelerator: 'CmdOrCtrl+Z', id: 'undo' },
    { accelerator: 'CmdOrCtrl+Shift+Z', id: 'redo' },
    { accelerator: 'CmdOrCtrl+A', canvasSelects: true, id: 'all' },
    { submenu: [{ accelerator: 'CmdOrCtrl+Plus', canvas: true, id: 'zoom' }] }
  ] }
])
const idOf = (e, opts) => shortcutFor(e, items, opts)?.id ?? null

describe('the menu', () => {
  it('sends only events the interface listens to', () => {
    const channels = [...new Set([...menuSource.matchAll(/channel: '(menu:[\w-]+)'/g)].map(m => m[1]))]
    expect(channels.length).toBeGreaterThan(25)
    expect(channels.filter(c => !app.includes(`on('${c}'`))).toEqual([])
  })

  it('has none of what a browser cannot do', () => {
    for (const gone of ['menu:open-recent', 'menu:reveal-project', 'menu:open-logs', 'menu:open-project-file', 'recentProjects', 'revealInExplorer', 'openLogsFolder'])
      expect(menuSource).not.toContain(gone)
    expect(menuSource).toContain("accelerator: 'Alt+N'")            // browsers keep Ctrl+N
  })
})

describe('keys', () => {
  it('are shown as on the platform', () => {
    expect(keysLabel('CmdOrCtrl+Shift+Z', false)).toBe('Ctrl+Shift+Z')
    expect(keysLabel('CmdOrCtrl+Plus', false)).toBe('Ctrl++')
    expect(keysLabel('CmdOrCtrl+Shift+Z', true)).toBe('⌘⇧Z')
    expect(ariaKeys('CmdOrCtrl+Shift+Z', false)).toBe('Control+Shift+Z')
    expect(ariaKeys('CmdOrCtrl+,', true)).toBe('Meta+,')
  })

  it('match exactly their keys', () => {
    expect(matches('CmdOrCtrl+Z', key('z', { ctrlKey: true }))).toBe(true)
    expect(matches('CmdOrCtrl+Z', key('z', { metaKey: true }))).toBe(true)
    expect(matches('CmdOrCtrl+Z', key('Z', { ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(matches('CmdOrCtrl+Shift+Z', key('Z', { ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(matches('CmdOrCtrl+,', key(',', { ctrlKey: true }))).toBe(true)
    expect(matches('CmdOrCtrl+Plus', key('=', { ctrlKey: true }))).toBe(true)
    expect(matches('CmdOrCtrl+Plus', key('+', { ctrlKey: true, shiftKey: true }))).toBe(true)
    // Alt+N on a Mac types ˜: the key's place decides
    expect(matches('Alt+N', { ...key('˜', { altKey: true }), code: 'KeyN' })).toBe(true)
    expect(matches('Alt+N', key('n', { altKey: true, ctrlKey: true }))).toBe(false)
  })

  it('leave a field its own keys, except the ones that keep work', () => {
    expect(idOf(key('z', { ctrlKey: true }))).toBe('undo')
    expect(idOf(key('z', { ctrlKey: true, target: field }))).toBeNull()
    expect(idOf(key('a', { ctrlKey: true, target: { tagName: 'TEXTAREA' } }))).toBeNull()
    expect(idOf(key('a', { ctrlKey: true, target: { tagName: 'DIV', isContentEditable: true } }))).toBeNull()
    expect(idOf(key('s', { ctrlKey: true, target: field }))).toBe('export')
    expect(idOf(key('o', { ctrlKey: true, target: field }))).toBe('import')
    expect(idOf(key('z', { ctrlKey: true, target: { tagName: 'INPUT', type: 'checkbox' } }))).toBe('undo')
  })

  it('leave the canvas its own keys, and the browser its zoom', () => {
    expect(idOf(key('=', { ctrlKey: true }))).toBeNull()
    expect(idOf(key('a', { ctrlKey: true }))).toBe('all')
    expect(idOf(key('a', { ctrlKey: true }), { canvasShown: true })).toBeNull()
    expect(idOf(key('z', { ctrlKey: true }), { canvasShown: true })).toBe('undo')
  })

  it('know when someone is typing', () => {
    expect(isTyping(null)).toBe(false)
    expect(isTyping(field)).toBe(true)
    expect(isTyping({ tagName: 'INPUT', type: 'number' })).toBe(true)
    expect(isTyping({ tagName: 'BUTTON' })).toBe(false)
  })
})
