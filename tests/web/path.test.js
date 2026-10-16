// `path` in the web version must answer what Node's path.posix answers (WEB-PRD Phase 1).
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import * as web from 'path'

const node = createRequire(import.meta.url)('path').posix

const paths = ['', '.', '..', '/', '/a', 'a', 'a/', '/a/b/', 'a/b/../c', '/a/./b', '../x', '/a/b.c', '/a/.b', '/a/b.c.d', 'a//b', '/..', 'file.tar.gz', '.hidden', '/a/b/']

describe('path (POSIX)', () => {
  for (const fn of ['normalize', 'dirname', 'basename', 'extname', 'isAbsolute']) {
    it(fn, () => {
      for (const p of paths) expect(web[fn](p), `${fn}(${JSON.stringify(p)})`).toBe(node[fn](p))
    })
  }

  it('join', () => {
    const cases = [['a', 'b'], ['/a', 'b', '../c'], ['/', 'a'], ['a', '', 'b'], ['', ''], ['/projects', 'My Game', 'project.db'], ['a/', '/b/']]
    for (const c of cases) expect(web.join(...c), JSON.stringify(c)).toBe(node.join(...c))
  })

  it('resolve (the current folder is /)', () => {
    const cases = [['a'], ['/a', 'b'], ['/a', '/b', 'c'], ['/a/b', '../c'], ['/'], ['/a/', './b/']]
    for (const c of cases) expect(web.resolve(...c), JSON.stringify(c)).toBe(node.resolve('/', ...c))
  })

  it('relative', () => {
    const cases = [['/a/b', '/a/b/c'], ['/a/b/c', '/a/d'], ['/a', '/a'], ['/', '/x/y'], ['/x/y', '/']]
    for (const [a, b] of cases) expect(web.relative(a, b), `${a} → ${b}`).toBe(node.relative(a, b))
  })

  it('basename with an extension, and sep', () => {
    expect(web.basename('/a/b.png', '.png')).toBe(node.basename('/a/b.png', '.png'))
    expect(web.sep).toBe('/')
    expect(web.posix.join('a', 'b')).toBe('a/b')
  })
})
