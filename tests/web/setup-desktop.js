// Before every desktop test run on the web versions (project "desktop-on-web"): the files those tests read from the
// repository are copied into the in-memory file system at the same paths, as if it were the disk.
// The bundled fonts and profile are at /resources, as in the web version (tests/web/setup.js).
import { createRequire } from 'module'
import { putFile, mkdirp, mountLazy } from '../../src/web/shims/memfs.js'

const nodeFs = createRequire(import.meta.url)('fs')
const nodePath = createRequire(import.meta.url)('path')
const ROOT = nodePath.resolve(new URL('../..', import.meta.url).pathname)

function mirror(rel) {
  const walk = dir => {
    for (const entry of nodeFs.readdirSync(dir, { withFileTypes: true })) {
      const full = nodePath.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else { mkdirp(nodePath.dirname(full)); putFile(full, new Uint8Array(nodeFs.readFileSync(full))) }
    }
  }
  walk(nodePath.join(ROOT, rel))
}

// at load time, not in beforeAll: some test files read these files while they are being loaded
mirror('tests/fixtures')
mirror('src')          // tests that look at the code itself (headlessCore.test.js)

// some tests read a font or the colour profile by its place in the repository: the same files there, read when used
const index = []
const list = (dir, rel) => {
  for (const e of nodeFs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) list(nodePath.join(dir, e.name), r)
    else index.push({ path: r, size: nodeFs.statSync(nodePath.join(dir, e.name)).size })
  }
}
list(nodePath.join(ROOT, 'resources'), '')
mountLazy(nodePath.join(ROOT, 'resources'), index, abs => new Uint8Array(nodeFs.readFileSync(abs)))
