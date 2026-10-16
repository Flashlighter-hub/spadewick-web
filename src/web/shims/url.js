/**
 * `url` for the core worker (WEB-PRD Phase 1). In the browser `import.meta.url` is an http(s) address, not a file, so
 * `fileURLToPath` answers the address's path; code that used it to find files next to itself (fontFiles.js, safeRaster.js)
 * gets the web paths it needs in Phase 5.
 */
export function fileURLToPath(url) {
  const u = url instanceof URL ? url : new URL(String(url))
  return decodeURIComponent(u.pathname)
}

export function pathToFileURL(path) {
  return new URL(`file://${encodeURI(String(path))}`)
}

export default { fileURLToPath, pathToFileURL, URL: globalThis.URL }
