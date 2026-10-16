// The person's library travels with projects (WEB-PRD Phase 8): their own templates, presets and components go into
// every project export under spadewick-library/, and are merged into the tab's library when an archive comes in.
import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, utimesSync } from 'fs'
import { handlerOf, connectPage } from '../../src/web/shims/electron.js'
import Store from '../../src/web/shims/electron-store.js'
import { SETTINGS_DEFAULTS, FOLDERS } from '../../src/web/config.js'
import { reset, mkdirp, changeGeneration } from '../../src/web/shims/memfs.js'
import { createDialogs } from '../../src/web/files/dialogs.js'
import { listZip } from '../../src/main/zip.js'
import { countLibrary } from '../../src/web/project/library.js'

const call = async (channel, ...args) => handlerOf(channel)({ sender: null }, ...args)

const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 500 700">${body}</svg>`
const badge = { name: 'Cost badge', xml: ['<circle cx="40" cy="40" r="30" fill="#c33"/>'], defs: [], bounds: { x: 10, y: 10, w: 60, h: 60 } }

/** Empty the tab's library, as a new tab has it. */
function freshLibrary() {
  rmSync('/library', { recursive: true, force: true })
  for (const f of FOLDERS.filter(f => f.startsWith('/library'))) mkdirSync(f, { recursive: true })
}

const zipNames = bytes => { writeFileSync('/tmp/check.zip', bytes); return listZip('/tmp/check.zip').map(e => e.name) }
const bringIn = async (bytes, name = 'archive.spadewick.zip') => {
  const placed = await call('web:project-import', { kind: 'zip', name, bytes })
  if (placed.path) await call('projects:open', placed.path)
  return placed
}
const myComponents = async () => (await call('components:list')).filter(c => !c.builtIn)
const myPresets = async () => (await call('presets:list')).presets.filter(p => !p.shipped)

let archive, componentId, presetId, itemId, templateId

beforeAll(async () => {
  reset()
  for (const f of FOLDERS) mkdirp(f)
  const post = () => {}
  const dialogs = createDialogs(post)
  connectPage(post, dialogs)
  const { registerIpcHandlers } = await import('../../src/main/ipc/index.js')
  registerIpcHandlers(new Store({ defaults: SETTINGS_DEFAULTS }))
  const { registerWebProject } = await import('../../src/web/project/service.js')
  registerWebProject(() => {})

  await call('projects:create', { name: 'My Game' })
  const set = await call('sets:create', { name: 'Base' })
  componentId = (await call('components:save', badge)).id
  // a template that came from the library, and uses the component
  const t = await call('templates:create', { name: 'Hero', svgSource: svg(`<rect width="500" height="700" fill="#246"/><g data-spadewick-id="b1" data-spadewick-component="${componentId}" data-spadewick-component-version="1">${badge.xml[0]}</g>`) })
  itemId = (await call('templatelib:save', { templateId: t.id, setId: set.id, name: 'Hero frame' })).id
  await call('templatelib:use', { kind: 'mine', id: itemId, setId: set.id })
  templateId = (await call('templatelib:project-templates')).find(x => x.origin?.itemId === itemId).id
  const shipped = (await call('presets:list')).presets.find(p => p.shipped)
  presetId = (await call('presets:duplicate', { id: shipped.id, name: 'My printer' })).id
  writeFileSync('/tmp/preset-src.json', readFileSync(`/library/presets/${presetId}.json`))
  archive = await call('web:project-export', {})
})

describe('the library in a project archive', () => {
  it('goes beside the project folder, with only what is the person\'s own', () => {
    const names = zipNames(archive.bytes)
    expect(names).toContain(`spadewick-library/mine/${itemId}/manifest.json`)
    expect(names).toContain(`spadewick-library/presets/${presetId}.json`)
    expect(names).toContain(`spadewick-library/components/${componentId}.json`)
    expect(names).toContain('spadewick-library/library.json')
    expect(names.filter(n => n.startsWith('spadewick-library/')).every(n => /^spadewick-library\/(mine|presets|components)\/|library\.json$/.test(n))).toBe(true)
    expect(names.some(n => n.startsWith('My Game/project.db'))).toBe(true)
  })

  it('looking at the library is not a change of the project', async () => {
    const before = changeGeneration()
    await call('presets:list')
    await call('components:list')
    await call('templatelib:list')
    expect(changeGeneration()).toBe(before)
  })

  it('a new tab gets the library with the project, and the project still knows where its template came from', async () => {
    freshLibrary()
    expect(countLibrary()).toBe(0)
    const placed = await bringIn(archive.bytes)
    expect(placed.library).toMatchObject({ added: 3, same: 0, kept: 0, skipped: 0 })
    expect(existsSync(`${placed.path}/spadewick-library`)).toBe(false)
    expect((await myComponents()).map(c => c.id)).toEqual([componentId])
    expect((await myPresets()).map(p => p.id)).toEqual([presetId])
    const status = await call('templatelib:origin-status', templateId)
    expect(status).toMatchObject({ itemAvailable: true, updateAvailable: false })
    expect(status.origin.itemId).toBe(itemId)
  })

  it('bringing the same archive in again changes nothing', async () => {
    const placed = await bringIn(archive.bytes)
    expect(placed.library).toMatchObject({ added: 0, same: 3, kept: 0 })
    expect(countLibrary()).toBe(3)
  })

  it('an older item from the archive is kept as a copy, and the project is pointed at the copy', async () => {
    // the tab's component and template change after the archive was made
    await new Promise(r => setTimeout(r, 5))
    await call('components:rename', { id: componentId, name: 'Cost badge v2' })
    await call('templatelib:rename-item', { id: itemId, name: 'Hero frame v2' })
    const placed = await bringIn(archive.bytes)
    expect(placed.library).toMatchObject({ kept: 2, same: 1 })
    const comps = await myComponents()
    expect(comps.map(c => c.name).sort()).toEqual(['Cost badge (from My Game)', 'Cost badge v2'])
    const copy = comps.find(c => c.name === 'Cost badge (from My Game)')
    expect(copy.id).not.toBe(componentId)
    const items = (await call('templatelib:list')).mine
    expect(items.map(i => i.name).sort()).toEqual(['Hero frame (from My Game)', 'Hero frame v2'])
    const itemCopy = items.find(i => i.name === 'Hero frame (from My Game)')
    // the project's template follows the version it was made from
    const status = await call('templatelib:origin-status', templateId)
    expect(status.origin.itemId).toBe(itemCopy.id)
    expect(status.modified ?? false).toBe(false)
    // a component in the drawing keeps its id: the newer version under that id is an update the project may take
    expect((await call('templates:get', templateId)).svg_source).toContain(`data-spadewick-component="${componentId}"`)
  })

  it('a newer item from the archive takes the place, and the tab\'s version is kept as a copy', async () => {
    freshLibrary()
    await call('presets:import', { path: await presetFile('Old name') })
    utimesSync(`/library/presets/${presetId}.json`, new Date(1000), new Date(1000))     // changed long ago
    const before = (await myPresets()).find(p => p.id === presetId)
    expect(before.name).toBe('Old name')
    const placed = await bringIn(archive.bytes)
    expect(placed.library.kept).toBe(1)
    const presets = await myPresets()
    expect(presets.find(p => p.id === presetId).name).toBe('My printer')
    expect(presets.find(p => p.id !== presetId).name).toBe('Old name (earlier)')
  })

  it('a damaged item is left out, and the rest comes in', async () => {
    freshLibrary()
    const { exportLibrary } = await import('../../src/web/project/library.js')
    await bringIn(archive.bytes)
    const lib = exportLibrary()
    freshLibrary()
    // the library alone, with a component broken by hand
    const dir = '/tmp/broken'
    rmSync(dir, { recursive: true, force: true })
    const { extractZip, writeZip } = await import('../../src/main/zip.js')
    writeFileSync('/tmp/lib.zip', lib.bytes)
    extractZip('/tmp/lib.zip', dir)
    writeFileSync(`${dir}/spadewick-library/components/${componentId}.json`, '{ not json')
    const { walk } = await import('../../src/main/snapshotCore.js')
    writeZip('/tmp/broken.zip', walk(dir).map(e => ({ name: e.name, file: e.file })))
    const placed = await call('web:project-import', { kind: 'zip', name: 'lib.zip', bytes: readFileSync('/tmp/broken.zip') })
    expect(placed.path).toBeNull()
    expect(placed.library).toMatchObject({ added: 2, skipped: 1 })
  })

  it('the library alone downloads and comes in with no project', async () => {
    const { exportLibrary } = await import('../../src/web/project/library.js')
    const lib = exportLibrary()
    expect(lib.fileName).toBe('Spadewick library.zip')
    expect(zipNames(lib.bytes).every(n => n.startsWith('spadewick-library/'))).toBe(true)
    freshLibrary()
    expect(exportLibrary()).toBeNull()
    const placed = await call('web:project-import', { kind: 'zip', name: 'Spadewick library.zip', bytes: lib.bytes })
    expect(placed).toMatchObject({ path: null, library: { added: 2 } })
  })

  it('a zip with neither a project nor a library is refused', async () => {
    writeFileSync('/tmp/x.txt', 'hello')
    const { writeZip } = await import('../../src/main/zip.js')
    writeZip('/tmp/none.zip', [{ name: 'notes/x.txt', file: '/tmp/x.txt' }])
    await expect(call('web:project-import', { kind: 'zip', name: 'none.zip', bytes: readFileSync('/tmp/none.zip') })).rejects.toThrow(/no project\.db/)
  })
})

/** A preset file with the archive's preset id, under another name: what the tab had before the archive came. */
async function presetFile(name) {
  const p = JSON.parse(readFileSync(`/tmp/preset-src.json`, 'utf8'))
  writeFileSync('/tmp/preset-old.json', JSON.stringify({ ...p, name }))
  return '/tmp/preset-old.json'
}
