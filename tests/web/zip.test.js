// The desktop's own zip code (src/main/zip.js, used for snapshots and packages) running on the in-memory file system.
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { writeZip, listZip, extractZip, zipBuffer } from '../../src/main/zip.js'
import { reset } from '../../src/web/shims/memfs.js'

beforeEach(() => { reset(); mkdirSync('/work/src/assets', { recursive: true }) })

describe('zip.js on the in-memory file system', () => {
  it('writes an archive and extracts it again', () => {
    writeFileSync('/work/src/project.db', Buffer.from('SQLite format 3\0'.repeat(500)))
    writeFileSync('/work/src/assets/a.png', new Uint8Array([137, 80, 78, 71, 1, 2, 3]))
    writeFileSync('/work/src/notes é.txt', 'résumé')
    writeZip('/work/out.zip', [
      { name: 'project.db', file: '/work/src/project.db' },
      { name: 'assets/a.png', file: '/work/src/assets/a.png' },
      { name: 'notes é.txt', file: '/work/src/notes é.txt' }
    ])
    expect(listZip('/work/out.zip').map(e => e.name)).toEqual(['project.db', 'assets/a.png', 'notes é.txt'])
    extractZip('/work/out.zip', '/work/back')
    expect(readFileSync('/work/back/project.db').equals(readFileSync('/work/src/project.db'))).toBe(true)
    expect([...readFileSync('/work/back/assets/a.png')]).toEqual([137, 80, 78, 71, 1, 2, 3])
    expect(readFileSync('/work/back/notes é.txt', 'utf8')).toBe('résumé')
  })

  it('refuses entries that would land outside the folder', () => {
    writeFileSync('/work/evil.zip', zipBuffer([{ name: '../escape.txt', data: Buffer.from('x') }]))
    expect(() => extractZip('/work/evil.zip', '/work/safe')).toThrow()
    expect(existsSync('/work/escape.txt')).toBe(false)
  })
})
