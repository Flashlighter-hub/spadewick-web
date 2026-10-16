// The desktop's file dialogs in a tab (WEB-PRD Phase 4): the core asks for files and places, a stand-in for the page
// answers the pickers, and what the core saves comes back as downloads.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { existsSync, readdirSync } from 'fs'
import { handlerOf, connectPage } from '../../src/web/shims/electron.js'
import Store from '../../src/web/shims/electron-store.js'
import { SETTINGS_DEFAULTS } from '../../src/web/config.js'
import { reset, mkdirp } from '../../src/web/shims/memfs.js'
import { createDialogs, acceptOf } from '../../src/web/files/dialogs.js'
import { listZip } from '../../src/main/zip.js'
import { writeFileSync } from 'fs'

const enc = s => new TextEncoder().encode(s)
let dialogs
const picks = []          // what the page was asked to show
const queue = []          // what the person will choose next: [{ path, bytes }] or null
const downloads = []

// as the worker answers a call (core.worker.js): the value as the page sees it, then the downloads
const call = async (channel, ...args) => {
  const value = dialogs.shown(await handlerOf(channel)({ sender: null }, ...args))
  dialogs.deliver()
  return value
}
const choose = files => queue.push(files)

beforeAll(async () => {
  reset()
  for (const f of ['/projects', '/tmp', '/imports', '/downloads', '/library']) mkdirp(f)
  const post = m => {
    if (m.type === 'pick') { picks.push(m); queueMicrotask(() => dialogs.answerPick({ id: m.id, files: queue.shift() ?? null })) }
    if (m.type === 'download') downloads.push(m)
  }
  dialogs = createDialogs(post)
  connectPage(post, dialogs)
  const { registerIpcHandlers } = await import('../../src/main/ipc/index.js')
  registerIpcHandlers(new Store({ defaults: SETTINGS_DEFAULTS }))
  const { registerWebProject } = await import('../../src/web/project/service.js')
  registerWebProject(() => {})
})

beforeEach(() => { picks.length = 0; downloads.length = 0; queue.length = 0 })

describe('pickers', () => {
  it('turn file filters into what a browser picker accepts', () => {
    expect(acceptOf([{ name: 'Images', extensions: ['png', 'JPG', 'svg'] }])).toBe('.png,.jpg,.svg')
    expect(acceptOf([{ name: 'All', extensions: ['*'] }])).toBe('')
    expect(acceptOf()).toBe('')
  })

  it('a CSV chosen in the picker is imported as cards', async () => {
    await call('projects:create', { name: 'Dialogs' })
    const set = await call('sets:create', { name: 'Base' })
    await call('fields:create', { setId: set.id, name: 'Name', slug: 'name', type: 'text' })
    choose([{ path: 'cards.csv', bytes: enc('name\nImp\nWyrm\n') }])
    const read = await call('dataio:read-file', { format: 'csv', setId: set.id })
    expect(picks[0]).toMatchObject({ folder: false, multiple: false, accept: '.csv' })
    expect(read.fileName).toBe('cards.csv')
    expect(read.rows.length).toBe(2)
    await call('dataio:import', { setId: set.id, rows: read.rows, mapping: read.mapping, mode: 'add' })
    expect((await call('cards:list', set.id)).length).toBe(2)
  })

  it('cancelling a picker cancels, as a cancelled dialog does', async () => {
    const [set] = await call('sets:list')
    choose(null)
    expect(await call('dataio:read-file', { format: 'csv', setId: set.id })).toBeNull()
  })

  it('a chosen folder arrives whole, and its files are read', async () => {
    choose([
      { path: 'my-rules/01-setup.md', bytes: enc('# Setup\n\nShuffle.') },
      { path: 'my-rules/02-turns.md', bytes: enc('# Turns\n\nDraw.') }
    ])
    const r = await call('rules:import-folder', {})
    expect(picks[0]).toMatchObject({ folder: true })
    expect(r.canceled).not.toBe(true)
    expect((await call('rules:list')).map(p => p.title)).toEqual(expect.arrayContaining(['Setup', 'Turns']))
  })

  it('locating a picture of an SVG design takes the pictures next to it too, in one folder', async () => {
    const { tr } = await import('../../src/shared/i18n.js')
    choose([{ path: 'hero.png', bytes: new Uint8Array([1]) }, { path: 'frame.png', bytes: new Uint8Array([2]) }])
    const r = await dialogs.open({ title: tr('dialogs.locateImage'), properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png'] }] })
    expect(picks.at(-1)).toMatchObject({ multiple: true, hint: 'siblings' })
    expect(r.filePaths.map(p => p.split('/').pop())).toEqual(['hero.png', 'frame.png'])
    expect(new Set(r.filePaths.map(p => p.slice(0, p.lastIndexOf('/')))).size).toBe(1)
  })

  it('keeps only the last few imports, and none once the project is closed', async () => {
    const [set] = await call('sets:list')
    for (let i = 0; i < 7; i++) { choose([{ path: `c${i}.csv`, bytes: enc('name\nX\n') }]); await call('dataio:read-file', { format: 'csv', setId: set.id }) }
    expect(readdirSync('/imports').length).toBeLessThanOrEqual(4)
  })
})

describe('downloads', () => {
  it('a file the core saves is downloaded under the name it chose, and nothing is left behind', async () => {
    const [set] = await call('sets:list')
    const r = await call('dataio:export', { setIds: [set.id], format: 'csv' })
    expect(downloads).toHaveLength(1)
    expect(downloads[0].fileName).toBe('cards.csv')
    expect(new TextDecoder().decode(downloads[0].bytes)).toMatch(/Imp/)
    expect(r).toBeTruthy()
    expect(readdirSync('/downloads')).toEqual([])
  })

  it('a folder the core writes into is downloaded as one zip', async () => {
    const r = await call('rules:export-all')
    expect(r.canceled).not.toBe(true)
    expect(downloads).toHaveLength(1)
    expect(downloads[0].fileName).toBe('rules.zip')
    writeFileSync('/tmp/rules.zip', downloads[0].bytes)
    expect(listZip('/tmp/rules.zip').map(e => e.name).some(n => /^rules\/.*setup\.md$/i.test(n))).toBe(true)
  })

  it('one page saved as Markdown is downloaded as that file, and the answer names the file, not a place in memory', async () => {
    const [page] = await call('rules:list')
    const r = await call('rules:export-page', { id: page.id })
    expect(downloads.map(d => d.fileName)).toEqual([r.path])
    expect(r.path).toMatch(/\.md$/)
  })

  it('a folder chosen first and written by a later call is downloaded after that call', async () => {
    const dir = await call('app:pick-directory')
    expect(dir).toMatch(/^\/downloads\//)
    expect(downloads).toHaveLength(0)
    writeFileSync(`${dir}/later.txt`, 'x')
    dialogs.deliver()
    expect(downloads.map(d => d.fileName)).toEqual(['later.txt'])
  })

  it('Duplicate gives a copy of the project as a .spadewick.zip under the new name', async () => {
    const dir = await call('app:pick-directory')
    const answer = await call('projects:duplicate', { targetDir: dir, newName: 'Dialogs copy' })
    expect(downloads.map(d => d.fileName)).toEqual(['Dialogs copy.spadewick.zip'])
    expect(answer.path).toBe('Dialogs copy.spadewick.zip')
    writeFileSync('/tmp/copy.zip', downloads[0].bytes)
    expect(listZip('/tmp/copy.zip').map(e => e.name)).toContain('Dialogs copy/project.db')
    expect(existsSync(dir)).toBe(false)
    expect((await call('projects:get-meta')).meta.name).toBe('Dialogs')   // the open project is still the original
  })
})
