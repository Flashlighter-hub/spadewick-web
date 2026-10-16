/**
 * The build of the web version (WEB-PRD Phase 1, Phase 13).
 *
 * The page is src/web/index.html. The desktop app's main-process code runs in a Web Worker (src/web/worker/core.worker.js),
 * and the modules it imports from Node, Electron and native packages are replaced here by browser versions in
 * src/web/shims/, so the desktop source files do not have to change (WEB-PRD §4).
 */
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'url'
import { webModules, webAliases, wawoff2Export, wawoff2EsbuildExport } from './src/web/build/webModules.mjs'
import { cpSync, createReadStream, existsSync, statSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, extname, normalize, sep } from 'path'

const here = p => fileURLToPath(new URL(p, import.meta.url))

/**
 * The fonts and the colour profile in resources/ are served as they are and fetched when needed (WEB-PRD Phase 5):
 * from the folder itself during development, copied into the build otherwise.
 */
/** Every file under resources/ as [{ path, size }], paths relative to it with '/' (the list the core worker mounts). */
function resourceIndex(dir) {
  const out = []
  const walk = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(full, r)
      else out.push({ path: r, size: statSync(full).size })
    }
  }
  walk(dir, '')
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

function resources() {
  const dir = here('./resources')
  const TYPES = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.icc': 'application/vnd.iccprofile', '.md': 'text/markdown; charset=utf-8' }
  let outDir
  return {
    name: 'spadewick-resources',
    configResolved(config) { outDir = config.build.outDir },
    configureServer(server) {
      server.middlewares.use('/resources', (req, res, next) => {
        if (req.url.split('?')[0] === '/index.json') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(resourceIndex(dir)))
          return
        }
        const file = normalize(join(dir, decodeURIComponent(req.url.split('?')[0])))
        if (!file.startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream')
        createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      if (!outDir) return
      cpSync(dir, join(outDir, 'resources'), { recursive: true })
      writeFileSync(join(outDir, 'resources', 'index.json'), JSON.stringify(resourceIndex(dir)))
    }
  }
}

/**
 * The licences of what the site is made with (Help → About, WEB-PRD Phase 9): THIRD-PARTY-NOTICES.md as a page of its
 * own, licenses.html. Its words are shown as they are written (Phase 14 brings the notices up to date for the web).
 */
function notices() {
  const page = () => {
    const text = readFileSync(here('./THIRD-PARTY-NOTICES.md'), 'utf8').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spadewick: licences</title><style>body{margin:0;padding:24px;font:14px/1.55 system-ui,sans-serif;background:#fff;color:#222}
pre{white-space:pre-wrap;font:13px/1.5 ui-monospace,monospace;max-width:960px;margin:0 auto}
@media (prefers-color-scheme:dark){body{background:#1e1e1e;color:#eee}}</style></head><body><pre>${text}</pre></body></html>`
  }
  let outDir
  return {
    name: 'spadewick-notices',
    configResolved(config) { outDir = config.build.outDir },
    configureServer(server) {
      server.middlewares.use('/licenses.html', (_req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(page()) })
    },
    closeBundle() { if (outDir) writeFileSync(join(outDir, 'licenses.html'), page()) }
  }
}

const VERSION = JSON.parse(readFileSync(here('./package.json'), 'utf8')).version

export default defineConfig({
  root: here('./src/web'),
  publicDir: here('./public'),
  plugins: [webModules(), wawoff2Export(), svelte({ configFile: here('./svelte.config.mjs') }), resources(), notices()],
  define: { __SPADEWICK_VERSION__: JSON.stringify(VERSION) },
  resolve: { alias: webAliases },
  worker: {
    format: 'es',
    plugins: () => [webModules(), wawoff2Export()]
  },
  optimizeDeps: {
    // the worker's dependencies, which Vite would otherwise only find after the first load (and then reload the page)
    entries: ['index.html', 'worker/core.worker.js'],
    include: ['buffer', 'fflate', '@noble/hashes/legacy.js', '@noble/hashes/sha2.js', 'pdf-lib', 'bidi-js', 'linebreak', 'konva', 'wawoff2'],
    esbuildOptions: { plugins: [wawoff2EsbuildExport] },
    // WebAssembly packages find their .wasm next to themselves; pre-bundling would move them away from it (wawoff2 carries its own)
    exclude: ['harfbuzzjs', 'lcms-wasm', '@sqlite.org/sqlite-wasm', '@resvg/resvg-wasm']
  },
  build: {
    outDir: here('./out-web'),
    emptyOutDir: true,
    target: 'es2022',          // top-level await in the page and the worker
    sourcemap: true,
    chunkSizeWarningLimit: 4096
  },
  server: {
    fs: { allow: [here('.')] }
  }
})
