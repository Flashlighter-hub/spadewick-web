/**
 * What the desktop scenarios import from tests/helpers/project.js, for the web e2e suite (vitest.config.mjs aliases it
 * here): the same helpers, calling the core in the page of the app the harness started last.
 */
import { writeFileSync } from 'fs'
import sharp from 'sharp'          // the web version's (src/web/shims/sharp.js), writing to the disk
import { currentApp } from './harness.js'

const invoke = (...a) => currentApp().raw(...a)

/** A set with fields and cards, as a typical user would build one. */
export async function seedSet({ name = 'Base Set', fields = [], cards = [], template, cardSize, cardMmW, cardMmH } = {}) {
  const set = await invoke('sets:create', { name, cardSize, cardMmW, cardMmH })
  const defs = []
  for (const f of fields) defs.push(await invoke('fields:create', { setId: set.id, ...f }))
  let templateRow = null
  if (template) templateRow = await invoke('templates:create', { name: template.name ?? 'Base', svgSource: template.svg, cardSize, cardMmW, cardMmH })
  if (cards.some(c => c.name) || defs.some(f => f.slug === 'card_name')) {
    if (!defs.some(f => f.slug === 'card_name')) await invoke('fields:create', { setId: set.id, name: 'Card name', slug: 'card_name', type: 'text' })
    await invoke('sets:update', { id: set.id, displayField: 'card_name' })
  }
  const rows = []
  for (const c of cards) {
    rows.push(await invoke('cards:create', { setId: set.id, displayName: c.name ?? '', fields: c.fields ?? {}, templateId: templateRow?.id ?? null }))
  }
  return { set, fields: defs, cards: rows, template: templateRow }
}

export async function makePng(path, w = 40, h = 60, color = '#ff0000') {
  await sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toFile(path)
  return path
}

export const writeText = (path, text) => writeFileSync(path, text, 'utf8')
export { invoke }
export const mockDialog = { open: (...p) => currentApp().mockDialog.open(...p), save: p => currentApp().mockDialog.save(p), reset: () => currentApp().mockDialog.reset() }
