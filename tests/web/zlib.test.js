// Compression in the web version must read what Node writes and the other way round (WEB-PRD Phase 1).
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { deflateRawSync, inflateRawSync, inflateSync } from 'zlib'

const node = createRequire(import.meta.url)('zlib')
const text = Buffer.from('Spadewick '.repeat(2000))

describe('zlib', () => {
  it('raw deflate round trips, both ways with Node', () => {
    expect(Buffer.from(inflateRawSync(deflateRawSync(text, { level: 6 }))).equals(text)).toBe(true)
    expect(Buffer.from(node.inflateRawSync(deflateRawSync(text))).equals(text)).toBe(true)
    expect(Buffer.from(inflateRawSync(node.deflateRawSync(text))).equals(text)).toBe(true)
  })

  it('inflates zlib-wrapped data (WOFF font tables)', () => {
    expect(Buffer.from(inflateSync(node.deflateSync(text))).equals(text)).toBe(true)
  })

  it('keeps to maxOutputLength', () => {
    expect(() => inflateRawSync(node.deflateRawSync(text), { maxOutputLength: 10 })).toThrow()
  })
})
