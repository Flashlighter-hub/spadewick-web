/**
 * The bundled resources in the in-memory file system (WEB-PRD Phase 5): the fonts (46 MB in 170 files) and the colour
 * profile, at /resources, as the desktop has them beside the program. The site serves them as files; the build writes
 * their list (resources/index.json, see vite.web.config.mjs). Each file is fetched the first time the core reads it,
 * so only the fonts a project uses are ever downloaded, and the browser's cache keeps them for the next visit.
 */
import { mountLazy } from '../shims/memfs.js'

export const RESOURCES = '/resources'

/** Fetch a file synchronously: the core reads fonts in synchronous code, and a worker may block on a request. */
function fetchNow(url) {
  const xhr = new XMLHttpRequest()
  xhr.open('GET', url, false)
  xhr.responseType = 'arraybuffer'
  xhr.send()
  if (xhr.status !== 200) {
    const err = new Error(`ENOENT: no such file or directory, open '${url}' (the site answered ${xhr.status})`)
    err.code = 'ENOENT'
    throw err
  }
  return new Uint8Array(xhr.response)
}

/** In the core worker: list what the site serves under /resources/ and make it readable. `base` is the site's address. */
export async function mountSiteResources(base = self.location.origin) {
  const res = await fetch(new URL('/resources/index.json', base))
  if (!res.ok) throw new Error(`The list of fonts could not be loaded (${res.status})`)
  const entries = await res.json()
  mountLazy(RESOURCES, entries, path => fetchNow(new URL(path.split('/').map(encodeURIComponent).join('/'), base)))
  return entries.length
}
