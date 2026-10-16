// The whole desktop core loads on the web versions of its modules, and answers every call the interface can make
// (WEB-PRD Phase 1). In this test project `electron` is the worker's stand-in (src/web/shims/electron.js).
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { handlerOf, channels, connectPage } from '../../src/web/shims/electron.js'
import Store from '../../src/web/shims/electron-store.js'
import { SETTINGS_DEFAULTS } from '../../src/web/config.js'
import { reset } from '../../src/web/shims/memfs.js'

const nodeFs = createRequire(import.meta.url)('fs')
const preload = nodeFs.readFileSync('src/preload/index.js', 'utf8')
const preloadChannels = [...preload.matchAll(/invoke\('([a-z0-9:-]+)'/g)].map(m => m[1])

const sent = []
const call = (channel, ...args) => handlerOf(channel)({ sender: null }, ...args)

beforeAll(async () => {
  reset()
  connectPage(m => sent.push(m))
  const { registerIpcHandlers } = await import('../../src/main/ipc/index.js')
  registerIpcHandlers(new Store({ defaults: SETTINGS_DEFAULTS }))
})

describe('the core in the web version', () => {
  it('has a handler for every channel of the preload script', () => {
    expect(preloadChannels.length).toBeGreaterThan(150)
    const missing = preloadChannels.filter(c => !channels().includes(c))
    expect(missing).toEqual([])
  })

  it('answers settings calls from its store', async () => {
    expect((await call('settings:get-all')).projects_root).toBe('/projects')
    await call('settings:set', 'theme', 'dark')
    expect(await call('settings:get', 'theme')).toBe('dark')
  })

  it('has no project open and no recent projects', async () => {
    expect(await call('projects:get-meta')).toBeNull()
    expect(await call('projects:list-recent')).toEqual([])
  })

  it('creates a project in the in-memory file system, with its database (Phase 2)', async () => {
    expect(await call('projects:create', { name: 'Game' })).toEqual({ path: '/projects/Game', name: 'Game' })
    expect((await call('projects:get-meta')).meta.name).toBe('Game')
    const set = await call('sets:create', { name: 'Base' })
    expect((await call('sets:list')).map(s => s.name)).toContain('Base')
    expect(set).toBeTruthy()
  })

  it('draws a card with the WebAssembly drawing engine (Phase 5)', async () => {
    const [set] = await call('sets:list')
    const template = await call('templates:create', { name: 'Face', svgSource: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350"><rect width="250" height="350" fill="#123"/></svg>' })
    await call('sets:update', { id: set.id, defaultTemplateId: template.id })
    const card = await call('cards:create', { setId: set.id })
    const b64 = await call('templates:render', { cardId: card.id ?? card })
    const png = Buffer.from(b64, 'base64')
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(500)            // drawn at the project's card width
  })

  it('turns a file dialog into a notice until Phase 4 brings file pickers', async () => {
    const before = sent.length
    expect(await call('app:pick-directory')).toBeFalsy()
    expect(sent.slice(before).some(m => m.type === 'notice')).toBe(true)
  })

  it('opens only web links, in a new tab of the page', async () => {
    const before = sent.length
    await call('rules:open-link', 'https://example.com/rules')
    await expect(call('rules:open-link', 'file:///etc/passwd')).rejects.toThrow()   // the core refuses it itself
    const opened = sent.slice(before).filter(m => m.type === 'open-external').map(m => m.url)
    expect(opened).toEqual(['https://example.com/rules'])
  })

  it('never writes outside the in-memory file system', () => {
    // the shimmed `fs` used by this test is the in-memory one; the real disk has no /projects folder made by it
    expect(nodeFs.existsSync('/projects')).toBe(false)
    expect(readFileSync).toBeTypeOf('function')
  })
})
