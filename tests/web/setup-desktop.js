// Before every desktop test run on the web versions (project "desktop-on-web"): the files those tests read from the
// repository are copied into the in-memory file system at the same paths, as if it were the disk.
// Fonts are not copied yet: making the bundled fonts available is WEB-PRD Phase 5.
import { createRequire } from 'module'
import { putFile, mkdirp } from '../../src/web/shims/memfs.js'

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
mirror('resources/profiles')
mirror('src')          // tests that look at the code itself (headlessCore.test.js)
