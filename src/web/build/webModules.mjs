/**
 * Which modules the web version replaces, and how (WEB-PRD §4 rule 2, Phase 1). Used by the build (vite.web.config.mjs)
 * and by the tests that run desktop code on the browser versions (vitest.config.mjs, project "web").
 */
import { fileURLToPath } from 'url'
import { normalize } from 'path'

const ROOT = new URL('../../../', import.meta.url)   // the repository
const here = p => fileURLToPath(new URL(p, ROOT))
const shim = name => here(`./src/web/shims/${name}`)

/** Node built-ins and native packages → their browser versions. */
export const MODULES = {
  fs: shim('fs.js'),
  path: shim('path.js'),
  os: shim('os.js'),
  crypto: shim('crypto.js'),
  zlib: shim('zlib.js'),
  url: shim('url.js'),
  child_process: shim('child_process.js'),
  'electron-store': shim('electron-store.js'),
  'better-sqlite3': shim('better-sqlite3.js'),   // Phase 2: SQLite WebAssembly
  sharp: shim('sharp.js'),                       // Phase 6: browser image operations
  '@resvg/resvg-js': shim('resvg.js')            // Phase 5: @resvg/resvg-wasm
}

/** Desktop source files the web build uses a different file for. */
export const FILES = {
  [here('./src/main/log.js')]: shim('log.js'),
  [here('./src/main/core/lock.js')]: shim('lock.js')
}

const PRELOAD = here('./src/preload/index.js')

/**
 * `electron` means two things: in the page (only the preload script imports it) the bridge to the worker; everywhere else
 * (the worker) the stand-in for the main process. Desktop files listed in FILES are swapped after they are resolved.
 */
export function webModules() {
  return {
    name: 'spadewick-web-modules',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const bare = source.replace(/^node:/, '')
      if (bare === 'electron') {
        return importer && normalize(importer.split('?')[0]) === PRELOAD ? here('./src/web/bridge/electron-renderer.js') : shim('electron.js')
      }
      if (MODULES[bare]) return MODULES[bare]
      if (source.startsWith('.') && importer) {
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
        const replacement = resolved && FILES[normalize(resolved.id.split('?')[0])]
        if (replacement) return replacement
      }
      return null
    }
  }
}

/** The same replacements as Vite aliases (dependency pre-bundling does not run plugins). */
export const webAliases = Object.entries(MODULES).map(([name, file]) => ({ find: new RegExp(`^(node:)?${name.replace(/[/@.-]/g, m => `\\${m}`)}$`), replacement: file }))
