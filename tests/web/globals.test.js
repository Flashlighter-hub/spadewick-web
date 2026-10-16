// What Node gives every module and a browser worker does not (WEB-PRD Phase 1, src/web/worker/globals.js): every such
// global the desktop code uses is provided there. The tests run in Node, where they all exist, so they would not
// notice one missing in the browser (Phase 12 found setImmediate this way).
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const fs = require('fs'), path = require('path')

const NODE_ONLY = {
  setImmediate: /\bsetImmediate\(/, clearImmediate: /\bclearImmediate\(/, 'process.nextTick': /\bprocess\.nextTick\(/,
  Buffer: /\bBuffer\./, 'process.resourcesPath': /\bprocess\.resourcesPath\b/, 'process.platform': /\bprocess\.platform\b/
}
const UNAVAILABLE = { __dirname: /\b__dirname\b/, __filename: /\b__filename\b/, 'require(': /(^|[^.\w])require\(/, 'global.': /(^|[^.\w])global\./ }

const files = []
const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p) } }
walk('src/main'); walk('src/shared')
const code = files.map(f => [f, fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')])
const globals = fs.readFileSync('src/web/worker/globals.js', 'utf8')

describe('the worker gives the core what Node gave it', () => {
  it('provides every Node-only global the desktop code uses', () => {
    const used = Object.entries(NODE_ONLY).filter(([, re]) => code.some(([, src]) => re.test(src))).map(([name]) => name)
    expect(used).toContain('setImmediate')
    const missing = used.filter(name => !globals.includes(name.split('.').pop()))
    expect(missing).toEqual([])
  })

  it('uses nothing a module cannot have in a browser', () => {
    const found = []
    for (const [f, src] of code) for (const [name, re] of Object.entries(UNAVAILABLE)) if (re.test(src)) found.push(`${f}: ${name}`)
    expect(found).toEqual([])
  })
})
