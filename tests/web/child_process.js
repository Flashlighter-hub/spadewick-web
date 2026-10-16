// `child_process` for the desktop tests run on the web versions: the app's own replacement (fork starts the drawing
// helper), plus the real programs some tests use to check what the app wrote (pdftoppm, unzip). Those programs work on
// the real disk, so the in-memory files a command names are copied into a temporary folder first, and what the
// program writes there is copied back.
import { createRequire } from 'module'
import { fork } from '../../src/web/shims/child_process.js'
import { lookup, putFile, mkdirp } from '../../src/web/shims/memfs.js'

const require = createRequire(import.meta.url)
const real = require('child_process'), nodeFs = require('fs'), nodePath = require('path'), os = require('os')

function onDisk(args) {
  const root = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'web-cp-'))
  const dirs = new Set()
  const mapped = args.map(a => {
    if (typeof a !== 'string' || !a.startsWith('/')) return a
    const target = nodePath.join(root, a)
    nodeFs.mkdirSync(nodePath.dirname(target), { recursive: true })
    const node = lookup(a)
    if (node?.type === 'file') nodeFs.writeFileSync(target, node.data)
    if (lookup(nodePath.dirname(a))?.type === 'dir') dirs.add(nodePath.dirname(a))
    return target
  })
  return { root, mapped, dirs }
}

function back({ root, dirs }) {
  for (const dir of dirs) {
    const there = nodePath.join(root, dir)
    if (!nodeFs.existsSync(there)) continue
    for (const name of nodeFs.readdirSync(there)) {
      const file = nodePath.join(there, name)
      if (nodeFs.statSync(file).isFile()) { mkdirp(dir); putFile(nodePath.join(dir, name), new Uint8Array(nodeFs.readFileSync(file))) }
    }
  }
  nodeFs.rmSync(root, { recursive: true, force: true })
}

export function execFileSync(file, args = [], options) {
  const run = onDisk(args)
  try { return real.execFileSync(file, run.mapped, options) } finally { back(run) }
}

export { fork }
export default { fork, execFileSync }
