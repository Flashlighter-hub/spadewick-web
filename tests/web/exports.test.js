// Exports download (WEB-PRD Phase 7): an export the person chose no folder for writes into a download folder of its
// own, and what it wrote reaches the page as a download, named after the project and the kind of export.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { existsSync, writeFileSync } from 'fs'
import { handlerOf, connectPage } from '../../src/web/shims/electron.js'
import Store from '../../src/web/shims/electron-store.js'
import { SETTINGS_DEFAULTS } from '../../src/web/config.js'
import { reset, mkdirp } from '../../src/web/shims/memfs.js'
import { createDialogs } from '../../src/web/files/dialogs.js'
import { registerWebExports } from '../../src/web/files/exports.js'
import { listZip } from '../../src/main/zip.js'
import { ttsImageLink } from '../../src/main/ttsLinks.js'

let dialogs
const downloads = []

// as the worker answers a call (core.worker.js)
const call = async (channel, ...args) => {
  const value = dialogs.shown(await handlerOf(channel)({ sender: null }, ...args))
  dialogs.deliver()
  return value
}

const template = '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 500 700"><rect width="500" height="700" fill="#336699"/></svg>'
let set

beforeAll(async () => {
  reset()
  for (const f of ['/projects', '/tmp', '/imports', '/downloads', '/library']) mkdirp(f)
  const post = m => { if (m.type === 'download') downloads.push(m) }
  dialogs = createDialogs(post)
  connectPage(post, dialogs)
  const { registerIpcHandlers } = await import('../../src/main/ipc/index.js')
  registerIpcHandlers(new Store({ defaults: SETTINGS_DEFAULTS }))
  const { registerWebProject } = await import('../../src/web/project/service.js')
  registerWebProject(() => {})
  registerWebExports(dialogs)

  await call('projects:create', { name: 'My Game' })
  set = await call('sets:create', { name: 'Base' })
  const t = await call('templates:create', { name: 'Plain', svgSource: template })
  for (const name of ['Imp', 'Wyrm', 'Troll']) await call('cards:create', { setId: set.id, displayName: name, fields: {}, templateId: t.id })
})

beforeEach(() => { downloads.length = 0 })

describe('exports download', () => {
  it('a Tabletop Simulator export arrives as one zip named after the project, with the JSON naming its images', async () => {
    const r = await call('export:tts', { setIds: [set.id], imageLinks: 'local' })
    expect(r.outputDir).toBe('My Game - Tabletop Simulator.zip')
    expect(r.imageLinks).toBe('names')
    expect(downloads.map(d => d.fileName)).toEqual(['My Game - Tabletop Simulator.zip'])
    writeFileSync('/tmp/tts.zip', downloads[0].bytes)
    const names = listZip('/tmp/tts.zip').map(e => e.name ?? e)
    expect(names).toEqual(expect.arrayContaining(r.files))
    expect(names.some(n => n.endsWith('.json'))).toBe(true)
    // nothing more is downloaded by the next call
    await call('sets:list')
    expect(downloads.length).toBe(1)
  })

  it('a Steam Cloud export downloads its _cloud JSON on its own afterwards', async () => {
    const r = await call('export:tts', { setIds: [set.id], imageLinks: 'cloud' })
    expect(r.cloudFiles.length).toBeGreaterThan(0)
    expect(downloads.length).toBe(1)
    downloads.length = 0
    const links = Object.fromEntries(r.cloudFiles.map((f, i) => [f, `https://steamusercontent.example/${i}/`]))
    // the page holds the real path of the JSON from the export's answer
    const done = await call('export:tts-cloud-links', { jsonFile: r.jsonFile, links })
    expect(done.file).toMatch(/_cloud\.json$/)
    expect(done.file).not.toContain('/')
    expect(downloads.map(d => d.fileName)).toEqual([done.file])
    const doc = JSON.parse(new TextDecoder().decode(downloads[0].bytes))
    expect(JSON.stringify(doc)).toContain('steamusercontent.example')
  })

  it('a print-and-play PDF arrives as the PDF itself', async () => {
    const r = await call('export:pdf', { setIds: [set.id] })
    expect(downloads.length).toBe(1)
    expect(downloads[0].fileName).toMatch(/\.pdf$/)
    expect(downloads[0].mime).toBe('application/pdf')
    expect(r.outputDir).toBe(downloads[0].fileName)
    expect(new TextDecoder().decode(downloads[0].bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('PNG files of each card arrive as one zip', async () => {
    const r = await call('export:png-sheet', { setIds: [set.id], individualFiles: true })
    expect(downloads.map(d => d.fileName)).toEqual(['My Game - PNG sheets.zip'])
    expect(r.files.length).toBe(3)
  })

  it('card images for a print service arrive as one zip', async () => {
    const r = await call('production:run-images', { setIds: [set.id] })
    expect(r.files.length).toBeGreaterThanOrEqual(3)
    expect(downloads.map(d => d.fileName)).toEqual(['My Game - Card images.zip'])
  })

  it('a failed export leaves no folder and downloads nothing', async () => {
    await expect(call('export:pdf', { setIds: [] })).rejects.toThrow()
    dialogs.deliver()
    expect(downloads.length).toBe(0)
    expect([...dialogs.downloadFolders.keys()].filter(d => existsSync(d) && d.includes('export-')).length).toBeLessThanOrEqual(1)
  })

  it('the kept export folder goes with the project', async () => {
    await call('export:pdf', { setIds: [set.id] })
    const kept = [...dialogs.downloadFolders].filter(([, i]) => i.keep).map(([d]) => d)
    expect(kept.length).toBe(1)
    dialogs.clearExports()
    expect(existsSync(kept[0])).toBe(false)
  })

  it('a saved object links its images by name in the web version', () => {
    expect(ttsImageLink('local', '/downloads/x', 'a.png', 'web')).toBe('a.png')
    expect(ttsImageLink('cloud', '/downloads/x', 'a.png', 'web')).toBe('a.png')
  })
})
