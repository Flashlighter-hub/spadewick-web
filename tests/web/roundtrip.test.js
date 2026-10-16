// Round trip with the desktop's database engine (WEB-PRD Phase 12, §2 goal 2): a project exported here opens in native
// SQLite (the engine the desktop app uses, here Node's built-in node:sqlite) in the desktop's WAL mode, passes its
// integrity check, takes a change made there, and comes back here with that change after being zipped as a folder.
import { describe, it, expect, beforeAll } from 'vitest'
import { createRequire } from 'module'
import { handlerOf, connectPage } from '../../src/web/shims/electron.js'
import Store from '../../src/web/shims/electron-store.js'
import { SETTINGS_DEFAULTS, FOLDERS } from '../../src/web/config.js'
import { reset, mkdirp } from '../../src/web/shims/memfs.js'
import { createDialogs } from '../../src/web/files/dialogs.js'

const require = createRequire(import.meta.url)
const disk = require('fs'), nodePath = require('path'), os = require('os')
const { DatabaseSync } = require('node:sqlite')
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

/** The files of a zip, unpacked onto the disk (the person unzips the export). */
async function unzipToDisk(bytes, dir) {
  const { unzipSync } = await import('fflate')
  for (const [name, data] of Object.entries(unzipSync(new Uint8Array(bytes)))) {
    if (name.endsWith('/')) continue
    const file = nodePath.join(dir, ...name.split('/'))
    disk.mkdirSync(nodePath.dirname(file), { recursive: true })
    disk.writeFileSync(file, data)
  }
}

/** A folder of the disk as the files a folder picker gives. */
function folderFiles(dir, top = nodePath.basename(dir)) {
  const out = []
  const walk = (d, rel) => { for (const e of disk.readdirSync(d, { withFileTypes: true })) { const full = nodePath.join(d, e.name); if (e.isDirectory()) walk(full, `${rel}/${e.name}`); else out.push({ path: `${rel}/${e.name}`, bytes: new Uint8Array(disk.readFileSync(full)) }) } }
  walk(dir, top)
  return out
}

describe('a project between the web version and native SQLite', () => {
  it('opens there, takes a change, and comes back with it', async () => {
    await call('projects:create', { name: 'Round Trip' })
    const set = await call('sets:create', { name: 'Heroes' })
    await call('fields:create', { setId: set.id, name: 'Power', slug: 'power', type: 'number' })
    for (const n of ['Ana', 'Bo']) await call('cards:create', { setId: set.id, displayName: n, fields: { power: 3 } })
    const archive = await call('web:project-export', {})

    const tmp = disk.mkdtempSync(nodePath.join(os.tmpdir(), 'spadewick-roundtrip-'))
    try {
      await unzipToDisk(archive.bytes, tmp)
      const projectDir = nodePath.join(tmp, 'Round Trip')
      expect(disk.existsSync(nodePath.join(projectDir, 'project.db'))).toBe(true)
      expect(disk.existsSync(nodePath.join(projectDir, 'project.db-wal'))).toBe(false)

      // as the desktop app opens it: WAL mode, an integrity check, a change, then closed (its log folded back in)
      const db = new DatabaseSync(nodePath.join(projectDir, 'project.db'))
      expect(db.prepare('PRAGMA journal_mode = WAL').get().journal_mode).toBe('wal')
      expect(db.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok')
      expect(db.prepare("SELECT value FROM project_meta WHERE key = 'name'").get().value).toBe('Round Trip')
      expect(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n).toBe(2)
      db.prepare('UPDATE sets SET name = ? WHERE id = ?').run('Heroes (edited on the desktop)', set.id)
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      db.close()
      disk.rmSync(nodePath.join(projectDir, 'project.db-wal'), { force: true })
      disk.rmSync(nodePath.join(projectDir, 'project.db-shm'), { force: true })

      // the folder comes back to the web version
      await call('projects:close')
      const placed = await call('web:project-import', { kind: 'files', files: folderFiles(projectDir) })
      await call('projects:open', placed.path)
      expect((await call('sets:list')).map(s => s.name)).toEqual(['Heroes (edited on the desktop)'])
      expect((await call('cards:list', set.id)).length).toBe(2)
      expect(await call('projects:check-integrity')).toBe(true)
    } finally { disk.rmSync(tmp, { recursive: true, force: true }) }
  })
})
