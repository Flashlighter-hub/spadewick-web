// The virtual table in a tab (WEB-PRD Phase 11): saved tables are files inside the project, so they travel in its
// archive and come back with it.
import { describe, it, expect, beforeAll } from 'vitest'
import { writeFileSync } from 'fs'
import { handlerOf, connectPage } from '../../src/web/shims/electron.js'
import Store from '../../src/web/shims/electron-store.js'
import { SETTINGS_DEFAULTS, FOLDERS } from '../../src/web/config.js'
import { reset, mkdirp } from '../../src/web/shims/memfs.js'
import { createDialogs } from '../../src/web/files/dialogs.js'
import { listZip } from '../../src/main/zip.js'
import { createTable } from '../../src/shared/table.js'

const call = (channel, ...args) => handlerOf(channel)({ sender: null }, ...args)

beforeAll(async () => {
  reset()
  for (const f of FOLDERS) mkdirp(f)
  const dialogs = createDialogs(() => {})
  connectPage(() => {}, dialogs)
  const { registerIpcHandlers } = await import('../../src/main/ipc/index.js')
  registerIpcHandlers(new Store({ defaults: SETTINGS_DEFAULTS }))
  const { registerWebProject } = await import('../../src/web/project/service.js')
  registerWebProject(() => {})
})

describe('saved tables', () => {
  it('go with the project archive and come back with it', async () => {
    await call('projects:create', { name: 'Table Game' })
    const set = await call('sets:create', { name: 'Base' })
    const cards = []
    for (const name of ['Imp', 'Wyrm']) cards.push(await call('cards:create', { setId: set.id, displayName: name, fields: {} }))
    const state = createTable({ decks: [{ id: set.id, name: 'Base', size: { mmW: 63.5, mmH: 88.9 }, cards: cards.map(c => ({ id: c.id, name: c.display_name ?? '' })) }], seats: 2 })
    const saved = await call('table:save', { name: 'Friday game', state, log: ['shuffled'] })

    const archive = await call('web:project-export', {})
    writeFileSync('/tmp/t.zip', archive.bytes)
    expect(listZip('/tmp/t.zip').map(e => e.name)).toContain(`Table Game/tables/${saved.id}.json`)

    await call('projects:close')
    const placed = await call('web:project-import', { kind: 'zip', name: 'Table Game.spadewick.zip', bytes: archive.bytes })
    await call('projects:open', placed.path)
    expect((await call('table:list')).map(t => t.name)).toEqual(['Friday game'])
    const back = await call('table:load', saved.id)
    expect(Object.keys(back.state.cards).length).toBe(2)
    expect(back.log).toEqual(['shuffled'])
  })
})
