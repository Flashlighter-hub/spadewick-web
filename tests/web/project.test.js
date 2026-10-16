// A project's life in the web version (WEB-PRD §5, Phase 3), worker side: the desktop's handlers with the web layer
// around them, on the in-memory file system.
import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import { handlerOf, connectPage } from '../../src/web/shims/electron.js'
import Store from '../../src/web/shims/electron-store.js'
import { SETTINGS_DEFAULTS } from '../../src/web/config.js'
import { reset, mkdirp } from '../../src/web/shims/memfs.js'
import { zipBuffer, listZip } from '../../src/main/zip.js'

const sent = []
const call = (channel, ...args) => handlerOf(channel)({ sender: null }, ...args)
const state = () => call('web:project-state')
let afterCall

async function makeProject(name, cards = ['Imp', 'Wyrm']) {
  await call('projects:create', { name })
  const set = await call('sets:create', { name: 'Base' })
  for (const c of cards) await call('cards:create', { setId: set.id, displayName: c })
  return set
}

const zipEntries = bytes => {
  writeFileSync('/tmp/check.zip', bytes)
  return listZip('/tmp/check.zip').map(e => e.name)
}

beforeAll(async () => {
  reset()
  for (const f of ['/projects', '/tmp', '/imports', '/downloads', '/library']) mkdirp(f)
  connectPage(m => sent.push(m))
  const { registerIpcHandlers } = await import('../../src/main/ipc/index.js')
  registerIpcHandlers(new Store({ defaults: SETTINGS_DEFAULTS }))
  const { registerWebProject } = await import('../../src/web/project/service.js')
  afterCall = registerWebProject(m => sent.push(m))
})

describe('export', () => {
  it('zips the project folder in the desktop layout, without the undo stash and outputs', async () => {
    const set = await makeProject('Dragon Duel')
    await call('snapshots:create', { name: 'one' })
    mkdirSync('/projects/Dragon Duel/exports', { recursive: true })
    writeFileSync('/projects/Dragon Duel/exports/old.pdf', 'x')
    const { fileName, bytes } = await call('web:project-export', { includeSnapshots: true })
    expect(fileName).toBe('Dragon Duel.spadewick.zip')
    const names = zipEntries(bytes)
    expect(names).toContain('Dragon Duel/project.db')
    expect(names.some(n => n.startsWith('Dragon Duel/snapshots/'))).toBe(true)
    expect(names.some(n => /\/(\.cache|exports)\//.test(n))).toBe(false)
    expect(set.id).toBeTruthy()

    const without = await call('web:project-export', { includeSnapshots: false })
    expect(zipEntries(without.bytes).some(n => n.includes('/snapshots/'))).toBe(false)
  })

  it('a project made here has unexported changes until exported, and again after an edit', async () => {
    await makeProject('Fresh')
    expect((await state()).dirty).toBe(true)
    await call('web:project-export', {})
    expect((await state()).dirty).toBe(false)
    expect((await state()).exportedAt).toBeTypeOf('number')
    const [set] = await call('sets:list')
    await call('cards:create', { setId: set.id, displayName: 'New' })
    expect((await state()).dirty).toBe(true)
  })
})

describe('import', () => {
  it('brings back an exported project: same cards, and nothing to export until it changes', async () => {
    await makeProject('Round Trip', ['A', 'B', 'C'])
    const { bytes } = await call('web:project-export', {})
    await call('projects:close')
    const placed = await call('web:project-import', { kind: 'zip', name: 'Round Trip.spadewick.zip', bytes })
    expect(placed.name).toBe('Round Trip')
    const opened = await call('projects:open', placed.path)
    expect(opened.meta.name).toBe('Round Trip')
    const [set] = await call('sets:list')
    expect((await call('cards:list', set.id)).length).toBe(3)
    expect((await state())).toMatchObject({ open: true, name: 'Round Trip', dirty: false })
    afterCall()                                    // measuring the project writes the database into its file: not a change
    expect((await state()).dirty).toBe(false)
  })

  it('keeps one project in memory: opening or making another removes the one before', async () => {
    await makeProject('First')
    await makeProject('Second')
    expect(readdirSync('/projects')).toEqual(['Second'])
    await call('projects:close')
    expect(readdirSync('/projects')).toEqual([])
    expect((await state()).open).toBe(false)
  })

  it('takes a zip with project.db at the top, a folder\'s files, and a project.db alone', async () => {
    await makeProject('Shapes', ['Circle'])
    const { bytes } = await call('web:project-export', {})
    writeFileSync('/tmp/shapes.zip', bytes)
    const { readZipEntries } = await import('../../src/main/zip.js')
    const files = [...readZipEntries('/tmp/shapes.zip', () => true)].map(([path, data]) => ({ path, bytes: data }))
    await call('projects:close')

    // the folder, as a folder picker gives it: paths start with the folder's name
    const fromFolder = await call('web:project-import', { kind: 'files', files })
    expect((await call('projects:open', fromFolder.path)).meta.name).toBe('Shapes')

    // brought in again while it is open: it sits in another folder for a moment, but exports under its own name
    const again = await call('web:project-import', { kind: 'files', files })
    expect(again.path).toBe('/projects/Shapes 2')
    await call('projects:open', again.path)
    expect(readdirSync('/projects')).toEqual(['Shapes 2'])
    const { fileName, bytes: again2 } = await call('web:project-export', {})
    expect(fileName).toBe('Shapes.spadewick.zip')
    expect(zipEntries(again2)).toContain('Shapes/project.db')

    // the same files zipped without their folder
    const flat = zipBuffer(files.map(f => ({ name: f.path.replace(/^Shapes\//, ''), data: Buffer.from(f.bytes) })))
    const fromFlat = await call('web:project-import', { kind: 'zip', name: 'shapes.zip', bytes: flat })
    expect((await call('projects:open', fromFlat.path)).meta.name).toBe('Shapes')

    // project.db alone
    const db = files.find(f => f.path === 'Shapes/project.db').bytes
    const fromDb = await call('web:project-import', { kind: 'db', name: 'project.db', bytes: db })
    expect((await call('projects:open', fromDb.path)).meta.name).toBe('Shapes')
  })

  it('refuses what is not a project, a zip with several, and a folder copied while the desktop app had it open', async () => {
    await expect(call('web:project-import', { kind: 'zip', name: 'x.zip', bytes: Buffer.from('not a zip at all') })).rejects.toThrow(/not a zip/)
    const none = zipBuffer([{ name: 'readme.txt', data: Buffer.from('hi') }])
    await expect(call('web:project-import', { kind: 'zip', name: 'x.zip', bytes: none })).rejects.toThrow(/no project.db/)
    const two = zipBuffer([{ name: 'A/project.db', data: Buffer.from('a') }, { name: 'B/project.db', data: Buffer.from('b') }])
    await expect(call('web:project-import', { kind: 'zip', name: 'x.zip', bytes: two })).rejects.toThrow(/more than one/)
    const wal = zipBuffer([{ name: 'G/project.db', data: Buffer.from('a') }, { name: 'G/project.db-wal', data: Buffer.from('pending') }])
    await expect(call('web:project-import', { kind: 'zip', name: 'x.zip', bytes: wal })).rejects.toThrow(/desktop app still had it open/)
    expect(readdirSync('/imports')).toEqual([])
  })

  it('refuses a zip whose entries would land outside the project', async () => {
    const evil = zipBuffer([{ name: 'G/project.db', data: Buffer.from('a') }, { name: '../../escape.txt', data: Buffer.from('x') }])
    await expect(call('web:project-import', { kind: 'zip', name: 'x.zip', bytes: evil })).rejects.toThrow()
    expect(existsSync('/escape.txt')).toBe(false)
  })
})

describe('the page is told', () => {
  it('the project\'s state after calls, only when it changed', async () => {
    sent.length = 0
    afterCall()
    afterCall()
    const states = sent.filter(m => m.type === 'project-state')
    expect(states.length).toBeLessThanOrEqual(1)
  })

  it('no recent projects, and no autosave time', async () => {
    expect(await call('projects:list-recent')).toEqual([])
    expect(await call('projects:autosave')).toBeNull()
  })
})

describe('a damaged project (PRD §14.2)', () => {
  it('opens to offer its latest snapshot instead of failing, and is itself again after the restore', async () => {
    const { handlerOf } = await import('../../src/web/shims/electron.js')
    const call = (c, ...a) => handlerOf(c)({ sender: null }, ...a)
    const { writeFileSync } = await import('fs')
    await call('projects:create', { name: 'Damaged', parentDir: '/tmp' })   // outside /projects: closing it keeps its folder
    await call('sets:create', { name: 'Base' })
    await call('snapshots:create', { name: 'known good' })
    const { path } = await call('projects:get-meta')
    await call('projects:close')
    writeFileSync(`${path}/project.db`, new Uint8Array(4096).fill(9))
    const state = await call('projects:open', path)
    expect(state.corrupt).toBe(true)
    const [latest] = await call('snapshots:list')
    await call('snapshots:restore', latest.id)
    expect((await call('sets:list')).map(s => s.name)).toEqual(['Base'])
    expect((await call('web:project-state')).name).toBe('Damaged')
  })
})
