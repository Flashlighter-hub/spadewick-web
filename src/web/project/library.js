/**
 * The person's library in a tab (WEB-PRD Phase 8, decision §14 Q2).
 *
 * On the desktop the template library, the manufacturer presets and the component library are kept in a folder of the
 * computer, shared by every project (`library_dir`). In a tab that folder is /library, in memory, and it travels inside
 * every project archive, as `spadewick-library/` beside the project folder, in the same layout:
 *
 *   mine/<id>/…            a template of the person's own (manifest.json, templates/, fonts/, assets/, mockup/)
 *   presets/<id>.json      a preset of the person's own
 *   components/<id>.json   a component of the person's own
 *   library.json           when each item was last changed (written by the web version; the desktop ignores it)
 *
 * What ships with the app (starter templates, shipped presets, built-in components) is in the code, not in /library,
 * so it is never in an archive.
 *
 * Bringing an archive in merges its library into the tab's (`mergeLibrary`):
 *   - an item the tab does not have is added;
 *   - the same item with the same content is left as it is;
 *   - the same item with different content: the more recently changed one keeps its place, and the other is kept as a
 *     copy under a new id, named "<name> (from <project>)" or "<name> (earlier)", so nothing is lost without a word.
 *     When the archive's template became the copy, the project's templates that came from it are pointed at the copy.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, statSync, utimesSync, cpSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import { walk } from '../../main/snapshotCore.js'
import { writeZip } from '../../main/zip.js'
import { readManifest } from '../../main/templateLibrary.js'
import { normalize as normalizeComponent } from '../../main/core/components.js'
import { SHIPPED } from '../../main/presets/shipped.js'
import { validatePreset } from '../../shared/presets.js'
import { isStarterComponentId } from '../../main/componentStarters.js'

export const LIBRARY = '/library'
export const ARCHIVE_FOLDER = 'spadewick-library'
const INDEX = 'library.json'
const INDEX_FORMAT = 1

const TEMPLATE_ID = /^[A-Za-z0-9-]{1,64}$/
const COMPONENT_ID = /^[0-9a-f-]{36}$/
const PRESET_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/

/**
 * The items of a library folder: [{ key, area, id, dir|file, files: [{ rel, file }] }]. Only what has the shape of an
 * item is listed (a template folder's staging copy, a stray file, are not).
 */
export function itemsOf(root) {
  const out = []
  const mine = join(root, 'mine')
  if (existsSync(mine)) {
    for (const id of readdirSync(mine)) {
      const dir = join(mine, id)
      if (!TEMPLATE_ID.test(id) || !statSync(dir).isDirectory() || !existsSync(join(dir, 'manifest.json'))) continue
      out.push({ key: `mine/${id}`, area: 'mine', id, dir, files: walk(dir).map(e => ({ rel: e.name, file: e.file })) })
    }
  }
  for (const [area, valid] of [['presets', PRESET_ID], ['components', COMPONENT_ID]]) {
    const dir = join(root, area)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      const id = name.replace(/\.json$/, '')
      const file = join(dir, name)
      if (!name.endsWith('.json') || !valid.test(id) || !statSync(file).isFile()) continue
      out.push({ key: `${area}/${id}`, area, id, file, files: [{ rel: name, file }] })
    }
  }
  return out
}

/** How many items the tab's library holds (cheap: the folders are only listed). */
export function countLibrary() {
  const n = (area, ok) => { try { return readdirSync(join(LIBRARY, area)).filter(ok).length } catch { return 0 } }
  return n('mine', id => TEMPLATE_ID.test(id) && existsSync(join(LIBRARY, 'mine', id, 'manifest.json')))
    + n('presets', f => f.endsWith('.json')) + n('components', f => f.endsWith('.json'))
}

/** The tab's library alone, as a zip in the archive layout (to keep it, or to take it to another tab with no project). */
export function exportLibrary() {
  mkdirSync('/downloads', { recursive: true })
  const dir = join('/downloads', `library-${randomUUID()}`)
  mkdirSync(dir)
  try {
    const entries = libraryEntries(dir)
    if (!entries.length) return null
    const zip = join(dir, 'library.zip')
    writeZip(zip, entries)
    return { fileName: 'Spadewick library.zip', bytes: readFileSync(zip) }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

/** When an item of the tab's library was last changed. */
const changedAt = item => Math.max(...item.files.map(f => statSync(f.file).mtimeMs))

/** The same files with the same bytes. */
function sameContent(a, b) {
  if (a.files.length !== b.files.length) return false
  const theirs = new Map(b.files.map(f => [f.rel, f.file]))
  return a.files.every(f => {
    const other = theirs.get(f.rel)
    if (!other) return false
    const x = readFileSync(f.file), y = readFileSync(other)
    return x.length === y.length && x.equals(y)
  })
}

/** Zip entries for the tab's library (none when it is empty), and the index file to put with them. */
export function libraryEntries(scratchDir) {
  const items = itemsOf(LIBRARY)
  if (!items.length) return []
  const entries = []
  const index = { format: INDEX_FORMAT, changed: {} }
  for (const item of items) {
    index.changed[item.key] = changedAt(item)
    const base = item.area === 'mine' ? `${ARCHIVE_FOLDER}/mine/${item.id}` : `${ARCHIVE_FOLDER}/${item.area}`
    for (const f of item.files) entries.push({ name: `${base}/${f.rel}`, file: f.file })
  }
  const indexFile = join(scratchDir, INDEX)
  writeFileSync(indexFile, JSON.stringify(index))
  entries.push({ name: `${ARCHIVE_FOLDER}/${INDEX}`, file: indexFile })
  return entries
}

/** What an item is called, and how to tell which of two is newer when the archive did not say. */
function describe(item) {
  try {
    if (item.area === 'mine') { const m = readManifest(item.dir); return { name: m.name, version: m.version ?? 1, updated: 0 } }
    const raw = JSON.parse(readFileSync(item.file, 'utf8'))
    return { name: String(raw.name ?? item.id), version: raw.version ?? 1, updated: raw.updated ?? 0 }
  } catch { return null }
}

/** An item of the archive that the desktop would accept, or a reason it is skipped. */
function acceptable(item) {
  try {
    if (item.area === 'mine') { readManifest(item.dir); return true }
    const raw = JSON.parse(readFileSync(item.file, 'utf8'))
    if (item.area === 'presets') return validatePreset(raw).length === 0 && raw.id === item.id && !SHIPPED.some(s => s.id === raw.id)
    if (isStarterComponentId(item.id)) return false
    normalizeComponent(raw, { id: item.id, keepId: true })
    return true
  } catch { return false }
}

/** A new id for a copy of an item, not used in the tab's library. */
function freeId(area, id) {
  if (area === 'presets') {
    let n = 2
    while (existsSync(join(LIBRARY, 'presets', `${id}-${n}.json`)) || SHIPPED.some(s => s.id === `${id}-${n}`)) n++
    return `${id}-${n}`.slice(0, 64)
  }
  return randomUUID()
}

/** Put an item (from `from`) into the tab's library as `id`, renamed if `name` is given, dated `time`. */
function place(from, area, id, { name, time }) {
  let files
  if (area === 'mine') {
    const dest = join(LIBRARY, 'mine', id)
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(join(LIBRARY, 'mine'), { recursive: true })
    cpSync(from.dir, dest, { recursive: true })
    if (name) {
      const manifestFile = join(dest, 'manifest.json')
      writeFileSync(manifestFile, JSON.stringify({ ...JSON.parse(readFileSync(manifestFile, 'utf8')), name }, null, 2))
    }
    files = walk(dest).map(e => e.file)
  } else {
    const dest = join(LIBRARY, area, `${id}.json`)
    mkdirSync(join(LIBRARY, area), { recursive: true })
    const raw = JSON.parse(readFileSync(from.file, 'utf8'))
    const changed = name || id !== from.id
    writeFileSync(dest, changed ? JSON.stringify({ ...raw, id, ...(name ? { name } : {}) }, null, area === 'presets' ? 2 : 0) : readFileSync(from.file))
    files = [dest]
  }
  if (time) for (const f of files) utimesSync(f, new Date(time), new Date(time))
}

/** The name of a copy, kept under the item's own length limit. */
const copyName = (area, name, suffix) => `${name.slice(0, (area === 'presets' ? 80 : area === 'components' ? 100 : 200) - suffix.length)}${suffix}`

/**
 * Merge the library of an archive (a folder in the `spadewick-library/` layout) into the tab's.
 * @param {string} folder      the archive's library, as extracted
 * @param {string} projectName the project it came with (for the name of a copy)
 * @returns {{ added: number, same: number, kept: number, skipped: number, renamed: Map<string, string> }}
 *   kept: items of which both versions are kept (one as a copy); renamed: archive key -> the id its copy got
 */
export function mergeLibrary(folder, projectName) {
  const summary = { added: 0, same: 0, kept: 0, skipped: 0, renamed: new Map() }
  if (!existsSync(folder)) return summary
  let index = {}
  try { index = JSON.parse(readFileSync(join(folder, INDEX), 'utf8')).changed ?? {} } catch { /* an archive made elsewhere: no dates */ }
  const mine = new Map(itemsOf(LIBRARY).map(i => [i.key, i]))
  const from = projectName ? ` (from ${projectName})` : ' (imported)'

  for (const theirs of itemsOf(folder)) {
    if (!acceptable(theirs)) { summary.skipped++; continue }
    const time = Number.isFinite(index[theirs.key]) ? index[theirs.key] : null
    const ours = mine.get(theirs.key)
    if (!ours) { place(theirs, theirs.area, theirs.id, { time }); summary.added++; continue }
    if (sameContent(ours, theirs)) { summary.same++; continue }

    // both kept: the more recently changed one keeps the id
    const a = describe(ours), b = describe(theirs)
    const theirsNewer = time !== null
      ? time > changedAt(ours)
      : (b?.version ?? 0) > (a?.version ?? 0) || ((b?.version ?? 0) === (a?.version ?? 0) && (b?.updated ?? 0) > (a?.updated ?? 0))
    const copyId = freeId(theirs.area, theirs.id)
    if (theirsNewer) {
      // the tab's version is copied out first, then replaced
      place(ours, ours.area, copyId, { name: copyName(ours.area, a?.name ?? ours.id, ' (earlier)'), time: changedAt(ours) })
      place(theirs, theirs.area, theirs.id, { time })
    } else {
      place(theirs, theirs.area, copyId, { name: copyName(theirs.area, b?.name ?? theirs.id, from), time })
      summary.renamed.set(theirs.key, copyId)
    }
    summary.kept++
  }
  return summary
}

/**
 * The project came with templates of the library that were kept as copies: its templates that came from one now point
 * at the copy, so "update available" follows the version the project had. (Components are left as they are: a newer
 * component under the same id is an update the project may take, and rewriting the drawing would mark it changed.)
 */
export function pointProjectAtCopies(projectDb, renamed) {
  const templates = new Map()
  for (const [key, id] of renamed) {
    const [area, old] = key.split('/')
    if (area === 'mine') templates.set(old, id)
  }
  if (!templates.size) return
  const db = new Database(projectDb)
  try {
    const update = db.prepare('UPDATE templates SET origin = ? WHERE id = ?')
    db.transaction(() => {
      for (const row of db.prepare('SELECT id, origin FROM templates WHERE origin IS NOT NULL').all()) {
        let o
        try { o = JSON.parse(row.origin) } catch { continue }
        if (o?.source === 'library' && o.kind === 'mine' && templates.has(o.itemId)) update.run(JSON.stringify({ ...o, itemId: templates.get(o.itemId) }), row.id)
      }
    })()
  } finally { db.close() }
}
