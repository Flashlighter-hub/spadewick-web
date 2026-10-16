// Before every test file of the "web" project: the database engine is loaded and the in-memory file system has its
// folders, as in the core worker (src/web/worker/core.worker.js, globals.js).
import { beforeAll } from 'vitest'
import { loadSqlite } from '../../src/web/sqlite/engine.js'
import { mkdirp } from '../../src/web/shims/memfs.js'
import { FOLDERS } from '../../src/web/config.js'

beforeAll(async () => {
  await loadSqlite()
  for (const folder of FOLDERS) mkdirp(folder)
})
