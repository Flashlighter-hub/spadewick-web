// Before every test file of the "web" and desktop-on-web projects: what the core worker does when it starts
// (src/web/worker/core.worker.js, globals.js): the folders of the in-memory file system, the bundled resources at
// /resources (read from the repository when first used, as the site serves them), and the database and drawing engines.
import { beforeAll } from 'vitest'
import { createRequire } from 'module'
import { loadSqlite } from '../../src/web/sqlite/engine.js'
import { loadResvg } from '../../src/web/raster/resvg.js'
import { initWebp } from '../../src/web/image/codecs.js'
import { mkdirp, mountLazy } from '../../src/web/shims/memfs.js'
import { FOLDERS } from '../../src/web/config.js'

const require = createRequire(import.meta.url)
const nodeFs = require('fs'), nodePath = require('path')
const ROOT = nodePath.resolve(new URL('../..', import.meta.url).pathname)

// at load time, before the core: it reads the list of bundled font families when it starts
const index = []
const walk = (dir, rel) => {
  for (const e of nodeFs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) walk(nodePath.join(dir, e.name), r)
    else index.push({ path: r, size: nodeFs.statSync(nodePath.join(dir, e.name)).size })
  }
}
walk(nodePath.join(ROOT, 'resources'), '')
for (const folder of FOLDERS) mkdirp(folder)
mountLazy('/resources', index, abs => new Uint8Array(nodeFs.readFileSync(nodePath.join(ROOT, abs))))
process.resourcesPath = '/resources'

beforeAll(async () => {
  await loadSqlite()
  await loadResvg(nodeFs.readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')))
  // the WebP codec finds its WebAssembly by address in a browser; in Node it is handed the compiled modules
  const webp = nodePath.dirname(require.resolve('@jsquash/webp/package.json'))
  const { simd } = await import('wasm-feature-detect')
  await initWebp({
    decoder: await WebAssembly.compile(nodeFs.readFileSync(nodePath.join(webp, 'codec/dec/webp_dec.wasm'))),
    encoder: await WebAssembly.compile(nodeFs.readFileSync(nodePath.join(webp, (await simd()) ? 'codec/enc/webp_enc_simd.wasm' : 'codec/enc/webp_enc.wasm')))
  })
  for (const folder of FOLDERS) mkdirp(folder)
})
