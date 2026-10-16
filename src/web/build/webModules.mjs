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
  '@resvg/resvg-js': shim('resvg.js')            // @resvg/resvg-wasm, fonts given as bytes
}

/** Desktop source files the web build uses a different file for. */
export const FILES = {
  [here('./src/main/log.js')]: shim('log.js'),
  [here('./src/main/core/lock.js')]: shim('lock.js'),
  // parts of the interface that say something else in a tab (Phase 9): src/web/ui/desktop/ has the web versions
  ...Object.fromEntries(['Welcome', 'PreferencesDialog', 'AboutDialog', 'StatusBar'].map(name =>
    [here(`./src/renderer/src/components/${name}.svelte`), here(`./src/web/ui/desktop/${name}.svelte`)]))
}

const PRELOAD = here('./src/preload/index.js')

/**
 * `electron` means two things: in the page (only the preload script imports it) the bridge to the worker; everywhere else
 * (the worker) the stand-in for the main process. Desktop files listed in FILES are swapped after they are resolved.
 * `electron` and `childProcess` (options) replace the worker's versions: the desktop tests bring their own
 * (tests/helpers/electron-mock.js, tests/web/child_process.js).
 */
export function webModules({ electron, childProcess } = {}) {
  return {
    name: 'spadewick-web-modules',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const bare = source.replace(/^node:/, '')
      if (bare === 'electron') {
        if (importer && normalize(importer.split('?')[0]) === PRELOAD) return here('./src/web/bridge/electron-renderer.js')
        return electron ?? shim('electron.js')
      }
      if (bare === 'child_process' && childProcess) return childProcess
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

/**
 * wawoff2 (WOFF2 fonts, fontFiles.js) is an Emscripten build that hands back its module only under Node; in a browser
 * its wrapper would wait for the WebAssembly forever. The one line it lacks is added when the site is built (and when
 * the development server bundles it). Its WebAssembly is inside the file, so nothing else is fetched.
 */
const WAWOFF2_BINDING = /wawoff2[\\/]build[\\/](de)?compress_binding\.js$/
const exportModule = code => `${code}\n;module.exports = Module;\n`

export function wawoff2Export() {
  return {
    name: 'spadewick-wawoff2',
    enforce: 'pre',          // before the bundler turns the file into a module
    // the file itself only: the bundler also makes a wrapper of it ('…?commonjs-wrapped'), which must stay as it is
    transform(code, id) { return WAWOFF2_BINDING.test(id) ? { code: exportModule(code), map: null } : null }
  }
}

/** The same for esbuild, which bundles dependencies for the development server. */
export const wawoff2EsbuildExport = {
  name: 'spadewick-wawoff2',
  setup(build) {
    build.onLoad({ filter: WAWOFF2_BINDING }, async args => {
      const { readFile } = await import('fs/promises')
      return { contents: exportModule(await readFile(args.path, 'utf8')), loader: 'js' }
    })
  }
}

/** The same replacements as Vite aliases (dependency pre-bundling does not run plugins). */
export const webAliases = Object.entries(MODULES).map(([name, file]) => ({ find: new RegExp(`^(node:)?${name.replace(/[/@.-]/g, m => `\\${m}`)}$`), replacement: file }))
