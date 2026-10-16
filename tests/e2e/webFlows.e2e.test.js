/**
 * What only the web version does (WEB-PRD Phase 12): a project comes in from a file and goes out as one, the browser
 * asks before a tab with unexported changes is closed, and every export arrives as a download.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { join } from 'path'
import { readFileSync } from 'fs'
import { startApp } from './harness.js'
import { seedSet } from './seed.js'

let app
beforeAll(async () => { app = await startApp() })
afterAll(async () => { await app.close() })

const template = '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 500 700"><rect width="500" height="700" fill="#264653"/><text data-spadewick-id="card_name" x="30" y="80" font-size="44" fill="#fff">{{card_name}}</text></svg>'

/** Export with Ctrl+S, and keep the file. */
async function exportNow(name) {
  const [d] = await Promise.all([app.page.waitForEvent('download'), app.page.keyboard.press('Control+s')])
  const file = join(app.root, '.e2e-download', name)
  await d.saveAs(file)
  return { file, suggested: d.suggestedFilename() }
}

/** Import a file through File → Import Project… and the Import dialog's file button. */
async function importFile(file) {
  await app.page.keyboard.press('Control+o')
  const [chooser] = await Promise.all([app.page.waitForEvent('filechooser'), app.page.getByRole('button', { name: 'Choose a file…' }).click()])
  await chooser.setFiles(file)
  await app.page.waitForFunction(() => document.body.innerText.includes('Nothing new since it was imported'), null, { timeout: 30000 })
  await app.settle()
}

describe('a project in a tab', () => {
  it('is exported, imported again in a new tab, and keeps an edit made in the table', async () => {
    await app.goto()
    await app.raw('projects:create', { name: 'Web Flow' })
    await seedSet({ name: 'Base', fields: [{ name: 'Power', slug: 'power', type: 'number' }], cards: [{ name: 'Imp', fields: { power: 1 } }, { name: 'Wyrm', fields: { power: 9 } }], template: { svg: template } })
    const first = await exportNow('first.spadewick.zip')
    expect(first.suggested).toBe('Web Flow.spadewick.zip')

    await app.goto()                                                     // a new tab: what was in memory is gone…
    await importFile(first.file)                                          // …and comes back from the file
    await app.page.locator('.set-item', { hasText: 'Base' }).first().click()
    await app.page.locator('.grid-row').first().waitFor()
    await app.edit(0, 'power', '4')
    await app.page.waitForFunction(() => document.body.innerText.includes('Changes since it was imported'))
    const second = await exportNow('second.spadewick.zip')

    await app.goto()
    await importFile(second.file)
    const [set] = await app.invoke('sets:list')
    const cards = await app.invoke('cards:list', set.id)
    expect(cards.map(c => Number(c.fields.power)).sort()).toEqual([4, 9])
  })

  it('makes the browser ask before a tab with unexported changes is closed', async () => {
    await app.invoke('sets:create', { name: 'Unsaved' })
    await app.page.waitForFunction(() => document.body.innerText.includes('export to keep them') || document.body.innerText.includes('Not exported yet'))
    app.leaveWarnings.length = 0
    await app.hardReload()                    // the browser's reload: the tab's project would be gone
    expect(app.leaveWarnings.length).toBe(1)
  })
})

describe('exports', () => {
  it('arrive as downloads: Tabletop Simulator as a zip, print-and-play as a PDF, a PNG sheet as a picture', async () => {
    await app.goto()
    await app.raw('projects:create', { name: 'Exports' })
    const { set } = await seedSet({ name: 'Deck', cards: [{ name: 'A' }, { name: 'B' }], template: { svg: template } })
    await app.raw('sets:update', { id: set.id, defaultTemplateId: (await app.raw('templates:list'))[0].id })
    const got = {}
    for (const [channel, key] of [['export:tts', 'tts'], ['export:pdf', 'pdf'], ['export:png-sheet', 'png']]) {
      const before = app.downloads.length
      await app.invoke(channel, { setIds: [set.id] })                  // no folder: the download is kept in app.downloads
      const d = app.downloads[before] ?? app.downloads.at(-1)
      got[key] = d?.name
      const head = readFileSync(d.file).subarray(0, 4)
      if (key === 'tts') expect(head.toString('latin1').startsWith('PK')).toBe(true)
      if (key === 'pdf') expect(head.toString('latin1')).toBe('%PDF')
      if (key === 'png') expect(head[1]).toBe(0x50)
    }
    expect(got).toEqual({ tts: 'Exports - Tabletop Simulator.zip', pdf: 'deck.pdf', png: 'deck_sheet.png' })
  })

  it('had no runtime errors', () => { expect(app.errors).toEqual([]) })
})
