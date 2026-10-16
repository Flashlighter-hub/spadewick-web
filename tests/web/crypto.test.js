// Hashes and ids in the web version must be the ones Node makes (WEB-PRD Phase 1).
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { createHash, randomUUID } from 'crypto'

const node = createRequire(import.meta.url)('crypto')

describe('crypto', () => {
  it('SHA-1 and SHA-256 of text and bytes, in hex and base64', () => {
    const inputs = ['', 'abc', 'Spadewick ♠', Buffer.from([0, 1, 2, 255]), new Uint8Array(100000).fill(7)]
    for (const algo of ['sha1', 'sha256']) {
      for (const input of inputs) {
        for (const enc of ['hex', 'base64']) {
          expect(createHash(algo).update(input).digest(enc)).toBe(node.createHash(algo).update(input).digest(enc))
        }
      }
    }
  })

  it('takes data in several pieces', () => {
    expect(createHash('sha256').update('ab').update('c').digest('hex')).toBe(node.createHash('sha256').update('abc').digest('hex'))
  })

  it('refuses an algorithm it does not have', () => {
    expect(() => createHash('md4')).toThrow()
  })

  it('makes version 4 ids', () => {
    expect(randomUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
