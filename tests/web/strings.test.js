// Every piece of web text the web code asks for exists, and is given what its {placeholders} need (WEB-PRD §4 rule 5).
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { webStrings, mergeStrings } from '../../src/web/strings.web.js'
import { strings } from '../../src/shared/strings.js'

const require = createRequire(import.meta.url)
const nodeFs = require('fs'), nodePath = require('path')

const files = []
const walk = dir => { for (const e of nodeFs.readdirSync(dir, { withFileTypes: true })) { const p = nodePath.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|svelte)$/.test(e.name)) files.push(p) } }
walk('src/web')

const merged = mergeStrings(strings, webStrings)
const lookup = key => key.split('.').reduce((n, k) => n?.[k], merged)

describe('web text', () => {
  const uses = files.flatMap(f => [...nodeFs.readFileSync(f, 'utf8').matchAll(/\btr\('([\w.]+)'(?:,\s*\{([^}]*)\})?/g)].map(m => ({ f, key: m[1], params: m[2] ?? '' })))

  it('every key used in src/web exists', () => {
    expect(uses.length).toBeGreaterThan(20)
    expect(uses.filter(u => !['string', 'function'].includes(typeof lookup(u.key))).map(u => `${u.f}: ${u.key}`)).toEqual([])   // functions make plurals
  })

  it('every {placeholder} of a web text is given', () => {
    const missing = []
    for (const u of uses.filter(u => u.key.startsWith('web.') && typeof lookup(u.key) === 'string')) {
      for (const [, name] of String(lookup(u.key)).matchAll(/\{(\w+)\}/g)) if (!new RegExp(`\\b${name}\\b`).test(u.params)) missing.push(`${u.key} needs {${name}}`)
    }
    expect(missing).toEqual([])
  })

  it('replaces only desktop text that exists, with the same kind of text', () => {
    // every piece of text laid over the desktop's is there on the desktop, as a string or (plurals) a function
    const wrong = []
    const check = (over, base, path) => {
      for (const [key, value] of Object.entries(over)) {
        const at = `${path}.${key}`, there = base?.[key]
        if (value && typeof value === 'object') { if (!there || typeof there !== 'object') wrong.push(`${at} is not desktop text`); else check(value, there, at) }
        else if (typeof value !== typeof there || !['string', 'function'].includes(typeof there)) wrong.push(`${at}: ${typeof value} over ${typeof there}`)
      }
    }
    for (const [area, entries] of Object.entries(webStrings)) if (area !== 'web') check(entries, strings[area], area)
    expect(wrong).toEqual([])
  })
})
