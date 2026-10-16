/**
 * End-to-end harness of the web version (WEB-PRD Phase 12): the built site (out-web/, made by global-setup.mjs) is
 * served on a local port and driven in Chromium. The core runs in the page's worker as it does for a person.
 *
 * It keeps the desktop harness's interface, so the desktop's scenarios run with few changes:
 *   invoke / raw   call a channel of the core (through the page's bridge)
 *   menu           send a menu:* event, as the menu bar does
 *   mockDialog     .open(paths) answers the next file picker with files from the test's folder; a folder the core asks
 *                  for to write into, .save(path), and an `outputDir` given to a call say where the next download goes
 *   root           a folder of the test's own on the disk. The tab's memory mirrors it at the same path: files the
 *                  test puts there reach the core before each call, and what the core writes there is copied back
 *                  after each call, so a scenario can make files and read results as on the desktop.
 */
import http from 'http'
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, writeFileSync, rmSync, mkdtempSync, copyFileSync } from 'fs'
import { join, extname, normalize, sep, basename, dirname, relative } from 'path'
import { tmpdir } from 'os'
import { chromium } from 'playwright-core'
import { extractZip } from '../../src/main/zip.js'

const OUT = join(process.cwd(), 'out-web')
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.icc': 'application/vnd.iccprofile', '.map': 'application/json'
}

/** Every file under a folder of the disk, with its time. */
function hostFiles(dir, out = new Map()) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) hostFiles(full, out)
    else out.set(full, statSync(full).mtimeMs)
  }
  return out
}

/** The files of a path on the disk as a picker gives them: [{ path, b64 }] (a folder's files start with its name). */
function pickedFiles(p) {
  if (!existsSync(p)) return []
  if (!statSync(p).isDirectory()) return [{ path: basename(p), b64: readFileSync(p).toString('base64') }]
  return [...hostFiles(p).keys()].map(f => ({ path: `${basename(p)}/${relative(p, f).split(sep).join('/')}`, b64: readFileSync(f).toString('base64') }))
}

let current = null
/** The app the harness started last (for the scenarios' helpers, seed.js). */
export const currentApp = () => current

export async function startApp() {
  const root = mkdtempSync(join(tmpdir(), 'spadewick-e2e-'))
  if (!existsSync(join(OUT, 'index.html'))) throw new Error('out-web/ is missing: the e2e global setup builds it (npm run build)')

  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0])
    const file = normalize(join(OUT, rel === '/' ? 'index.html' : rel))
    if (!file.startsWith(OUT) || !existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; return res.end() }
    res.setHeader('content-type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream')
    res.end(readFileSync(file))
  }).listen(0)

  const executablePath = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => existsSync(p))
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  // the desktop window was 1600 × 950; the web version's menu bar takes 36 pixels above the same interface
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 + 36 }, acceptDownloads: true })
  await context.addInitScript(() => { window.__SPADEWICK_E2E__ = {} })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)

  // --- dialogs: files the scenario chooses, and where downloads go ------------------------------------------------
  const openQueue = []          // [paths] for the next pickers
  const outQueue = []           // where the next downloads go: a file path, or a folder (a zip is unpacked into it)
  const downloads = []          // [{ name, file }] that went nowhere in particular
  let handledDownloads = 0
  const mockDialog = {
    open: (...paths) => openQueue.push(paths),
    save: path => outQueue.push({ path, kind: 'file' }),
    reset: () => { openQueue.length = 0; outQueue.length = 0 }
  }
  await context.exposeFunction('__e2ePick', request => {
    const paths = openQueue.shift()
    if (!paths) return null                                  // nothing chosen: the dialog was cancelled
    return paths.flatMap(pickedFiles)
  })
  // the desktop harness's window.__emitMenu: the test's files go in first, as for a call
  await context.exposeFunction('__e2ePush', async args => { await push(); await pushNamed(args) })
  await context.addInitScript(() => {
    window.__emitMenu = async (channel, ...args) => { await window.__e2ePush(args); window.__SPADEWICK_E2E__.emit(channel, ...args) }
    window.__SPADEWICK_E2E__.pick = async request => {
      const files = await window.__e2ePick(request)
      if (!files) return null
      return files.map(f => ({ path: f.path, bytes: Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)) }))
    }
  })
  const saving = []
  let lastDir = null
  /** A downloaded file goes where the scenario said: a file path, a folder (a zip is unpacked into it), or the list. */
  function place(name, tmp) {
    if (process.env.E2E_DEBUG) console.error("[e2e place]", name, JSON.stringify(outQueue), JSON.stringify(openQueue), lastDir)
    let target = outQueue.shift()
    if (!target) { const i = openQueue.findIndex(p => p.length === 1 && existsSync(p[0]) && statSync(p[0]).isDirectory()); if (i >= 0) target = { path: openQueue.splice(i, 1)[0][0], kind: 'dir' } }
    // one file more of the last export (the _cloud JSON of a Tabletop Simulator export) goes where that export went
    if (!target && lastDir && !/\.zip$/i.test(name)) target = { path: lastDir, kind: 'dir' }
    if (target?.kind === 'dir') lastDir = target.path
    if (!target) downloads.push({ name, file: tmp })
    else if (target.kind === 'file') { mkdirSync(dirname(target.path), { recursive: true }); copyFileSync(tmp, target.path) }
    else if (/\.zip$/i.test(name)) extractZip(tmp, target.path)
    else { mkdirSync(target.path, { recursive: true }); copyFileSync(tmp, join(target.path, name)) }
  }
  const tmpFile = name => { const f = join(root, '.e2e-download', `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${name}`); mkdirSync(dirname(f), { recursive: true }); return f }
  // what the core saves (the dialogs' downloads): handed over by the page, which waits until it is placed
  await context.exposeFunction('__e2eDownload', (name, b64) => { const tmp = tmpFile(name); writeFileSync(tmp, Buffer.from(b64, 'base64')); place(name, tmp) })
  await context.addInitScript(() => {
    window.__SPADEWICK_E2E__.download = m => {
      let s = ''
      for (let i = 0; i < m.bytes.length; i += 0x8000) s += String.fromCharCode(...m.bytes.subarray(i, i + 0x8000))
      return window.__e2eDownload(m.fileName, btoa(s))
    }
  })
  // what the page itself downloads (an exported project, the library): the browser's downloads
  const onDownload = async d => {
    const name = d.suggestedFilename()
    const tmp = tmpFile(name)
    await d.saveAs(tmp)
    place(name, tmp)
    handledDownloads++
  }
  page.on('download', d => saving.push(onDownload(d)))

  // --- the app's own question dialogs, answered from a queue (as in the desktop harness) ------------------------
  const answers = []
  const dialogs = []
  let declineConfirms = 0
  const hold = { confirms: false }
  const leaveWarnings = []      // the browser's own "leave this page?" (the web version asks it on purpose: unexported changes)
  page.on('dialog', async d => {
    if (d.type() === 'beforeunload') { leaveWarnings.push(Date.now()); await d.accept(); return }
    dialogs.push({ type: d.type(), message: d.message(), native: true })
    if (d.type() === 'prompt') { const next = answers.shift(); next === undefined ? await d.dismiss() : await d.accept(String(next)) }
    else if (declineConfirms > 0) { declineConfirms--; await d.dismiss() }
    else await d.accept()
  })
  await context.exposeFunction('__nextAnswer', () => (answers.length ? String(answers.shift()) : null))
  await context.exposeFunction('__confirmAnswer', message => {
    dialogs.push({ type: 'confirm', message })
    if (hold.confirms) return null
    if (declineConfirms > 0) { declineConfirms--; return false }
    return true
  })
  await context.addInitScript(() => {
    const answerPrompt = async form => {
      if (window.__holdPrompts) return
      const answer = await window.__nextAnswer()
      if (answer === null) { form.querySelector('button[type=button]').click(); return }
      const input = form.querySelector('input')
      input.value = answer; input.dispatchEvent(new Event('input', { bubbles: true }))
      form.querySelector('button[type=submit]').click()
    }
    const answerConfirm = async form => {
      if (form.dataset.asked) return
      form.dataset.asked = '1'
      const message = form.querySelector('.message')?.textContent ?? ''
      const yes = await window.__confirmAnswer(message)
      if (yes === null) return
      form.querySelector(yes ? '[data-confirm-yes]' : '[data-confirm-no]').click()
    }
    new MutationObserver(records => {
      for (const r of records) for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue
        const confirm = n.matches?.('[data-confirm-dialog]') ? n : n.querySelector?.('[data-confirm-dialog]')
        if (confirm) answerConfirm(confirm)
        const prompt = n.matches?.('[data-prompt-dialog]') ? n : n.querySelector?.('[data-prompt-dialog]')
        if (prompt) answerPrompt(prompt)
      }
    }).observe(document, { childList: true, subtree: true })
  })

  const errors = []
  const quiet = t => /Failed to load resource/.test(t)
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error' && !quiet(m.text())) errors.push(`console: ${m.text()}`) })

  const url = `http://localhost:${server.address().port}/`

  // --- the test's folder, mirrored in the tab's memory ----------------------------------------------------------
  const known = new Map()       // path on the disk -> mtime it had when the two sides last agreed
  const fromCore = new Set()    // files the core wrote (copied to the disk)
  const coreTimes = new Map()   // path -> the time the core's copy had when it was last copied
  let loaded = false
  async function load() {
    await page.goto(url)
    await page.waitForFunction(() => window.spadewick && window.__SPADEWICK_E2E__?.invoke && !document.getElementById('web-loading'), null, { timeout: 60000 })
    loaded = true
  }
  // the desktop's core outlived its window; here it lives in the page, so the page is loaded before the first call
  const coreCall = async (channel, args) => {
    if (!loaded) await load()
    return page.evaluate(([c, a]) => window.__SPADEWICK_E2E__.invoke(c, ...a), [channel, args])
  }

  async function push() {
    const changed = [...hostFiles(root)].filter(([f, t]) => !f.includes(`${sep}.e2e-download${sep}`) && known.get(f) !== t)
    if (!changed.length) return
    if (!loaded) await load()
    const files = changed.map(([f]) => ({ path: f.split(sep).join('/'), b64: readFileSync(f).toString('base64') }))
    await page.evaluate(fs => window.__SPADEWICK_E2E__.invoke('web:test-put', fs.map(f => ({ path: f.path, bytes: Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)) }))), files)
    for (const [f, t] of changed) known.set(f, t)
  }

  /** Files outside the test's folder that a call names (a folder made in the system's temporary folder): put in too. */
  const pushedOutside = new Map()
  async function pushNamed(args) {
    const paths = []
    const scan = v => {
      if (typeof v === 'string') { if (v.startsWith('/') && !v.startsWith(root) && !v.startsWith('/downloads/') && !v.startsWith('/projects') && v.length < 4096 && existsSync(v)) paths.push(v) }
      else if (Array.isArray(v)) v.forEach(scan)
      else if (v && typeof v === 'object') Object.values(v).forEach(scan)
    }
    scan(args)
    const files = []
    for (const p of paths) {
      const list = statSync(p).isDirectory() ? [...hostFiles(p)] : [[p, statSync(p).mtimeMs]]
      for (const [f, t] of list) if (pushedOutside.get(f) !== t) { files.push({ path: f, b64: readFileSync(f).toString('base64') }); pushedOutside.set(f, t) }
      if (statSync(p).isDirectory() && !list.length) files.push({ path: p, dir: true })
    }
    if (!files.length) return
    if (!loaded) await load()
    await page.evaluate(fs => window.__SPADEWICK_E2E__.invoke('web:test-put', fs.map(f => (f.dir ? f : { path: f.path, bytes: Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)) }))), files)
  }

  async function pull() {
    const tree = await coreCall('web:test-tree', [root.split(sep).join('/')])
    const want = tree.filter(e => { const host = e.path.split('/').join(sep); return !existsSync(host) || coreTimes.get(host) !== e.mtime })
    const seen = new Set(tree.map(e => e.path.split('/').join(sep)))
    if (want.length) {
      if (!loaded) await load()
      const files = await page.evaluate(async paths => {
        const read = await window.__SPADEWICK_E2E__.invoke('web:test-read', paths)
        const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s) }
        return read.map(f => ({ path: f.path, b64: b64(f.bytes) }))
      }, want.map(e => e.path))
      const times = new Map(want.map(e => [e.path, e.mtime]))
      for (const f of files) {
        const host = f.path.split('/').join(sep)
        coreTimes.set(host, times.get(f.path))
        mkdirSync(dirname(host), { recursive: true })
        writeFileSync(host, Buffer.from(f.b64, 'base64'))
        known.set(host, statSync(host).mtimeMs)
        fromCore.add(host)
      }
    }
    // what the core deleted is deleted on the disk too (only files that came from it)
    for (const host of [...fromCore]) if (!seen.has(host)) { rmSync(host, { force: true }); fromCore.delete(host); known.delete(host); coreTimes.delete(host) }
  }

  const settleNow = async () => {
    try {
      await page.waitForFunction(() => !window.__SPADEWICK_E2E__?.pending?.(), null, { timeout: 5000 })
      await page.evaluate(() => new Promise(r => setTimeout(r, 30)))
      await page.waitForFunction(() => !window.__SPADEWICK_E2E__?.pending?.(), null, { timeout: 5000 })
      // every download the page started has landed where it goes
      const started = await page.evaluate(() => window.__SPADEWICK_E2E__?.downloads ?? 0)
      const until = Date.now() + 5000
      while (handledDownloads < started && Date.now() < until) await new Promise(r => setTimeout(r, 25))
      await Promise.all(saving)
    } catch { /* the page is not loaded yet */ }
  }

  /**
   * Call a channel of the core: the test's files go in first, what the core wrote comes back after (`mirror`: not for
   * `raw`, the bulk seeding of a scenario, which reads nothing back from the disk).
   */
  async function call(channel, args, { mirror = true } = {}) {
    await push()
    await pushNamed(args)
    const out = args[0] && typeof args[0] === 'object' && typeof args[0].outputDir === 'string' ? args[0].outputDir : null
    if (out && !out.startsWith('/downloads/')) outQueue.push({ path: out, kind: 'dir' })
    let result
    try { result = await coreCall(channel, args) } catch (err) {
      throw new Error(String(err.message).replace(/^page\.evaluate: /, '').replace(/^Error: /, '').replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '').split('\n')[0])
    }
    if (mirror) { await settleNow(); await pull() }
    return result ?? null
  }

  // a scenario that reloads the window means the desktop's: the interface again, the project still open
  const hardReload = page.reload.bind(page)
  page.reload = async () => { await current.goto() }

  current = {
    hardReload,
    page, root, errors, dialogs, mockDialog, url, context, downloads, leaveWarnings,
    /** Another window, as a second player's: a tab with no project, counting what it asks to have drawn. */
    newGuestPage: async () => {
      const guest = await context.newPage()
      guest.setDefaultTimeout(8000)
      await guest.addInitScript(() => {
        window.__renders = 0
        let api
        Object.defineProperty(window, 'spadewick', {
          configurable: true,
          get: () => api,
          set: v => {
            api = v
            api.projects.getMeta = async () => null
            api.projects.listRecent = async () => []
            const render = api.templates.render
            api.templates.render = (...a) => { window.__renders++; return render(...a) }
            const preview = api.assets.getPreview
            api.assets.getPreview = (...a) => { window.__renders++; return preview(...a) }
          }
        })
      })
      guest.on('pageerror', e => errors.push(`guest pageerror: ${e.message}`))
      guest.on('console', m => { if (m.type() === 'error' && !quiet(m.text())) errors.push(`guest console: ${m.text()}`) })
      await guest.goto(url)
      await guest.waitForFunction(() => window.spadewick && !document.getElementById('web-loading'), null, { timeout: 60000 })
      return guest
    },
    settle: async () => { await settleNow(); await pull().catch(() => {}) },
    raw: (channel, ...args) => call(channel, args, { mirror: false }),
    invoke: async (channel, ...args) => { await settleNow(); return call(channel, args) },
    /** The next download goes into this folder (an export the scenario starts from the dialog). */
    downloadsTo: dir => outQueue.push({ path: dir, kind: 'dir' }),
    answer: (...values) => answers.push(...values),
    /**
     * Open the window (again). The desktop reloaded only the interface, and its core kept the project open; here a
     * reload starts a new core, so the test's folder is put back into it and the project that was open is opened
     * again, as the interface would find it.
     */
    goto: async () => {
      if (!loaded) { await load(); return }
      await settleNow()
      await pull()
      const open = await coreCall('projects:get-meta', []).catch(() => null)
      await hardReload()
      await page.waitForFunction(() => window.spadewick && window.__SPADEWICK_E2E__?.invoke && !document.getElementById('web-loading'), null, { timeout: 60000 })
      known.clear(); fromCore.clear(); coreTimes.clear()
      await push()
      if (open?.path) {
        await page.evaluate(p => window.__SPADEWICK_E2E__.emit('menu:open-recent', p), open.path)
        await page.waitForFunction(p => window.__SPADEWICK_E2E__.invoke('projects:get-meta').then(m => m?.path === p), open.path, { timeout: 15000 }).catch(() => {})
        await settleNow()
      }
    },
    declineNextConfirm: () => { declineConfirms++ },
    holdPrompts: on => page.evaluate(v => { window.__holdPrompts = v }, on),
    holdConfirms: on => { hold.confirms = on },
    menu: async (channel, ...args) => { await push(); await pushNamed(args); await page.evaluate(([c, a]) => window.__SPADEWICK_E2E__.emit(c, ...a), [channel, args]) },
    edit: async (row, col, value) => {
      await page.locator('.grid-row').nth(row).locator(`.cell[data-col="${col}"]`).dblclick()
      const editor = page.locator('.cell-editor')
      await editor.fill(value)
      await editor.press('Enter')
      await editor.waitFor({ state: 'detached' })
      await settleNow()
    },
    cellText: (row, col) => page.locator('.grid-row').nth(row).locator(`.cell[data-col="${col}"]`).innerText(),
    toast: () => page.locator('.toasts .toast').allInnerTexts(),
    close: async () => {
      await browser.close().catch(() => {})
      server.close()
      rmSync(root, { recursive: true, force: true })
    }
  }
  return current
}

/**
 * Run the axe-core accessibility engine against the current page (WCAG 2.0/2.1 A + AA).
 * Returns the violations as short readable strings; an empty list means the page passed.
 */
export async function axeViolations(page, { include } = {}) {
  const source = readFileSync(join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')
  await page.evaluate(src => { if (!window.axe) (0, eval)(src) }, source)
  const results = await page.evaluate(async ctx => {
    const out = await window.axe.run(ctx ? document.querySelector(ctx) : document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
      resultTypes: ['violations']
    })
    return out.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map(n => n.target.join(' ') + (n.any?.[0]?.message ? ' — ' + n.any[0].message : '')) }))
  }, include ?? null)
  return results.map(v => `${v.impact} ${v.id}: ${v.help}\n    ${v.nodes.join('\n    ')}`)
}
