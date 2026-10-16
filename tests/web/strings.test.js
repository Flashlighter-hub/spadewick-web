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
    expect(uses.filter(u => typeof lookup(u.key) !== 'string').map(u => `${u.f}: ${u.key}`)).toEqual([])
  })

  it('every {placeholder} of a web text is given', () => {
    const missing = []
    for (const u of uses.filter(u => u.key.startsWith('web.'))) {
      for (const [, name] of String(lookup(u.key)).matchAll(/\{(\w+)\}/g)) if (!new RegExp(`\\b${name}\\b`).test(u.params)) missing.push(`${u.key} needs {${name}}`)
    }
    expect(missing).toEqual([])
  })

  it('replaces only desktop text that exists', () => {
    for (const [area, entries] of Object.entries(webStrings)) {
      if (area === 'web') continue
      for (const key of Object.keys(entries)) expect(typeof strings[area]?.[key], `${area}.${key}`).toBe('string')
    }
  })
})
