/**
 * `zlib` for the core worker (WEB-PRD Phase 1): the three synchronous calls the core makes, done by fflate.
 *   deflateRawSync / inflateRawSync  raw DEFLATE (zip.js)
 *   inflateSync                      zlib-wrapped DEFLATE (WOFF font tables, fontFiles.js)
 */
import { Buffer } from 'buffer'
import { deflateSync, inflateSync as inflateRaw, unzlibSync } from 'fflate'

const bytes = data => (typeof data === 'string' ? new Uint8Array(Buffer.from(data)) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength))

function limited(out, options) {
  if (options?.maxOutputLength != null && out.byteLength > options.maxOutputLength) {
    const err = new RangeError('Cannot create a Buffer larger than maxOutputLength')
    err.code = 'ERR_BUFFER_TOO_LARGE'
    throw err
  }
  return Buffer.from(out.buffer, out.byteOffset, out.byteLength)
}

export const deflateRawSync = (data, options) => Buffer.from(deflateSync(bytes(data), { level: options?.level ?? 6 }))

export const inflateRawSync = (data, options) => limited(inflateRaw(bytes(data)), options)

export const inflateSync = (data, options) => limited(unzlibSync(bytes(data)), options)

export default { deflateRawSync, inflateRawSync, inflateSync }
