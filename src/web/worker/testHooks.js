/**
 * Channels for the end-to-end tests only (tests/e2e/harness.js, WEB-PRD Phase 12), registered when the page starts the
 * core with `e2e` (the harness sets that before the page loads; nothing does in normal use). The desktop's scenarios
 * put files on the disk and read what the app wrote there; these copy files between the test's folder and the same
 * path in the tab's memory.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { walk } from '../../main/snapshotCore.js'

export function registerTestHooks(ipcMain) {
  ipcMain.handle('web:test-put', async (_e, files) => {
    for (const f of files ?? []) {
      if (f.dir) { mkdirSync(f.path, { recursive: true }); continue }
      mkdirSync(dirname(f.path), { recursive: true })
      writeFileSync(f.path, f.bytes)
    }
    return files?.length ?? 0
  })
  // what is under a folder: [{ path, size, mtime }] (reading a database gets its newest bytes)
  ipcMain.handle('web:test-tree', async (_e, dir) => (existsSync(dir) ? walk(dir).map(e => { const s = statSync(e.file); return { path: e.file, size: s.size, mtime: s.mtimeMs } }) : []))
  ipcMain.handle('web:test-read', async (_e, paths) => paths.map(p => ({ path: p, bytes: readFileSync(p) })))
}
