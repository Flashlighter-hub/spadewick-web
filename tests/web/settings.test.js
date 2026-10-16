// Which settings are remembered between visits (WEB-PRD §5.3, decided by the owner).
import { describe, it, expect } from 'vitest'
import Store from '../../src/web/shims/electron-store.js'
import { SETTINGS_DEFAULTS, REMEMBERED_SETTINGS } from '../../src/web/config.js'

describe('settings store', () => {
  it('starts from the defaults and the remembered values, and ignores anything else that was saved', () => {
    const s = new Store({ defaults: SETTINGS_DEFAULTS, saved: { theme: 'dark', projects_root: '/elsewhere', recent_projects: ['/x'] } })
    expect(s.get('theme')).toBe('dark')
    expect(s.get('projects_root')).toBe('/projects')
    expect(s.get('recent_projects')).toEqual([])
    expect(s.get('missing', 7)).toBe(7)
  })

  it('tells the page only about remembered settings', () => {
    const told = []
    const s = new Store({ defaults: SETTINGS_DEFAULTS, onRemember: (k, v) => told.push([k, v]) })
    s.set('ui_layout', { sidebar: 200 })
    s.set('recent_projects', ['/projects/A'])
    s.set('author_code', 'AB')
    expect(told).toEqual([['ui_layout', { sidebar: 200 }], ['author_code', 'AB']])
    expect(s.store.recent_projects).toEqual(['/projects/A'])
  })

  it('remembers nothing that names a place on the computer or a project', () => {
    for (const key of ['projects_root', 'recent_projects', 'library_dir']) expect(REMEMBERED_SETTINGS).not.toContain(key)
  })

  it('calls change listeners', () => {
    const s = new Store({ defaults: SETTINGS_DEFAULTS })
    const seen = []
    s.onDidChange('theme', (now, before) => seen.push([now, before]))
    s.set('theme', 'light')
    expect(seen).toEqual([['light', 'system']])
  })
})
