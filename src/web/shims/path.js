/**
 * `path` for the core worker (WEB-PRD Phase 1). The in-memory file system uses POSIX paths, so this is Node's
 * `path.posix`, with the current folder fixed at '/'. `win32` is there only because ttsLinks.js imports it for
 * Windows links, which the web version never writes (its platform is 'web').
 */
const parts = p => String(p).split('/').filter(Boolean)

function normalizeParts(list, absolute) {
  const out = []
  for (const p of list) {
    if (p === '.') continue
    if (p === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!absolute) out.push('..') }
    else out.push(p)
  }
  return out
}

export const sep = '/'
export const delimiter = ':'

export const isAbsolute = p => String(p).startsWith('/')

export function normalize(p) {
  p = String(p)
  if (!p) return '.'
  const abs = isAbsolute(p)
  const trailing = p.endsWith('/')
  let out = normalizeParts(parts(p), abs).join('/')
  if (!out && !abs) out = '.'
  if (out && trailing) out += '/'
  return (abs ? '/' : '') + out
}

export function join(...args) {
  const joined = args.filter(a => { if (typeof a !== 'string') throw new TypeError('The "path" argument must be of type string'); return a.length }).join('/')
  return joined ? normalize(joined) : '.'
}

export function resolve(...args) {
  let path = ''
  for (let i = args.length - 1; i >= 0 && !isAbsolute(path); i--) {
    const a = String(args[i])
    if (a) path = path ? `${a}/${path}` : a
  }
  if (!isAbsolute(path)) path = `/${path}`
  return '/' + normalizeParts(parts(path), true).join('/')
}

export function relative(from, to) {
  const a = parts(resolve(from)), b = parts(resolve(to))
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/')
}

export function dirname(p) {
  p = String(p)
  if (!p) return '.'
  const abs = isAbsolute(p)
  const trimmed = p.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  if (i < 0) return abs ? '/' : '.'
  if (i === 0) return '/'
  return trimmed.slice(0, i)
}

export function basename(p, ext) {
  let base = String(p).replace(/\/+$/, '')
  base = base.slice(base.lastIndexOf('/') + 1)
  if (ext && base.endsWith(ext) && base !== ext) base = base.slice(0, -ext.length)
  return base
}

export function extname(p) {
  const base = basename(p)
  const i = base.lastIndexOf('.')
  return i <= 0 || base === '..' ? '' : base.slice(i)
}

export function parse(p) {
  const base = basename(p), ext = extname(p)
  return { root: isAbsolute(p) ? '/' : '', dir: dirname(p), base, ext, name: ext ? base.slice(0, -ext.length) : base }
}

export function format({ dir, root, base, name, ext }) {
  const file = base ?? `${name ?? ''}${ext ?? ''}`
  return dir ? `${dir === '/' ? '' : dir}/${file}` : `${root ?? ''}${file}`
}

export const toNamespacedPath = p => p

export const posix = { sep, delimiter, isAbsolute, normalize, join, resolve, relative, dirname, basename, extname, parse, format, toNamespacedPath }
posix.posix = posix
export const win32 = posix
posix.win32 = win32

export default posix
