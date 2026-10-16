// Errors in the web version (WEB-PRD Phase 10): there is no log file; the core keeps its last errors in memory for
// Help → Copy Error Report, and a failing call is logged with its channel as on the desktop.
import { describe, it, expect, beforeAll } from 'vitest'
import { handlerOf, connectPage } from '../../src/web/shims/electron.js'
import Store from '../../src/web/shims/electron-store.js'
import { SETTINGS_DEFAULTS, FOLDERS } from '../../src/web/config.js'
import { reset, mkdirp } from '../../src/web/shims/memfs.js'
import { createDialogs } from '../../src/web/files/dialogs.js'
import { logError, recentErrors } from '../../src/web/shims/log.js'
import { logError as desktopLogError } from '../../src/main/log.js'

beforeAll(async () => {
  reset()
  for (const f of FOLDERS) mkdirp(f)
  const dialogs = createDialogs(() => {})
  connectPage(() => {}, dialogs)
  const { registerIpcHandlers } = await import('../../src/main/ipc/index.js')
  registerIpcHandlers(new Store({ defaults: SETTINGS_DEFAULTS }))
})

describe('the error log', () => {
  it('is the web one wherever the desktop code logs', () => {
    expect(desktopLogError).toBe(logError)
  })

  it('keeps a failing call with its channel and stack', async () => {
    await expect(handlerOf('sets:update')({ sender: null }, { id: 'no-such-set', name: 'x' })).rejects.toThrow()
    const last = recentErrors().at(-1)
    expect(last).toMatch(/\[sets:update\]/)
  })

  it('keeps only the last 200', () => {
    for (let i = 0; i < 250; i++) logError('test', new Error(`number ${i}`))
    const kept = recentErrors()
    expect(kept.length).toBe(200)
    expect(kept.at(-1)).toContain('number 249')
    expect(kept.some(e => e.includes('number 49\n') || e.endsWith('number 49'))).toBe(false)
  })
})
