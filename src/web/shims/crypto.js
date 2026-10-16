/**
 * `crypto` for the core worker (WEB-PRD Phase 1): `randomUUID` from the browser, and a synchronous `createHash` for SHA-1
 * and SHA-256 (the browser's own digest is asynchronous, and the core hashes inside synchronous code).
 */
import { Buffer } from 'buffer'
import { sha1 } from '@noble/hashes/legacy.js'
import { sha256 } from '@noble/hashes/sha2.js'

const ALGORITHMS = { sha1, sha256 }

export const randomUUID = () => globalThis.crypto.randomUUID()

export const getRandomValues = array => globalThis.crypto.getRandomValues(array)

export function createHash(algorithm) {
  const fn = ALGORITHMS[String(algorithm).toLowerCase()]
  if (!fn) throw new Error(`Hash algorithm not available in the web version: ${algorithm}`)
  const hash = fn.create()
  let done = false
  const api = {
    update(data, encoding) {
      if (done) throw new Error('Digest already called')
      hash.update(typeof data === 'string' ? new Uint8Array(Buffer.from(data, encoding ?? 'utf8')) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
      return api
    },
    digest(encoding) {
      done = true
      const out = Buffer.from(hash.digest())
      return encoding ? out.toString(encoding) : out
    }
  }
  return api
}

export default { randomUUID, getRandomValues, createHash }
