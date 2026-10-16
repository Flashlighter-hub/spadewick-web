# Spadewick Web — PRD for the browser-only version

Status: draft 2 (owner decisions of §14 applied) · Repository: `Flashlighter-hub/spadewick-web` · Based on: Spadewick 2.0.0-dev.23 (desktop, `Flashlighter-hub/spadewick`)

This document lists everything needed to turn this copy of the Spadewick desktop application into a browser-only
application hosted for free on Cloudflare Pages. It covers what changes, what is added, what is removed and what must be
fixed for the code to run in a browser. The desktop repository (`Flashlighter-hub/spadewick`) is not changed by any of it.

## Progress

| Phase | State | Notes |
|---|---|---|
| 0 Repository preparation | done | Electron, packaging, CLI, Windows CI and spikes removed; Linux CI `.github/workflows/web.yml`. `src/main/log.js` and `src/main/core/lock.js` are kept and replaced at build time (`src/web/build/webModules.mjs`) instead of deleted, which keeps upstream merges simpler. `@sqlite.org/sqlite-wasm` and `@resvg/resvg-wasm` are added in the phases that use them (2 and 5). |
| 1 Runtime foundation | done | Worker, bridge (unchanged preload), shims for `fs` (in-memory), `path`, `os`, `url`, `crypto`, `zlib`, `child_process`, `electron`, settings store with remembered preferences. The application menu is now data in `src/web/ui/menu.js` (the menu bar that draws it is Phase 9). better-sqlite3, sharp and resvg are placeholders that say which phase brings them. |
| 2–15 | not started | |

Known test changes: the unit tests that need the database, drawing or images, `tests/integration/` and `tests/e2e/` are
not run until the phases that bring what they need (list in `vitest.config.mjs`). `tests/unit/tableLink.test.js` waited
too little for a guest's channel to close (it passed on Windows only); fixed with a `WEB:` line.

---

## 1. Summary

Spadewick Web is the same card-game design tool, running entirely inside a browser tab:

- **No server work.** The site is static files (HTML, JavaScript, WebAssembly, fonts). Cloudflare only serves the program;
  it never receives, stores or sees a project, an image, a font or an export.
- **No project storage on the user's computer.** The application keeps the open project in the tab's memory only. It
  does not store project data in the browser (no IndexedDB, no Origin Private File System, no localStorage for project
  data), does not autosave, and does not write into folders on the disk. Closing or reloading the tab deletes the project
  permanently. The one exception is a small set of **interface preferences** (theme, panel sizes, export options…),
  remembered in `localStorage` between visits (§5.3); they contain no project content.
- **Files move only when the user asks.** The only way data reaches the disk is a file the user explicitly downloads
  (*Export project*, a PDF, a PNG sheet, a Tabletop Simulator package…), through the browser's normal download prompt.
  The only way data enters the app is a file the user explicitly picks or drops in.
- **The desktop app stays as it is.** The web version is built in this separate repository, structured so that later
  desktop changes can still be merged in (see §4).

## 2. Goals and non-goals

### Goals
1. Every feature of the desktop app that does not need the operating system works in the browser: the card table,
   fields and formulas, templates and the canvas editor, components, card backs, text engine and rich text, icons, text
   styles, keyword rules, rules pages, the virtual table (including sharing with other players), snapshots and
   "what changed?", preflight, TTS / print-and-play PDF / PNG sheet / production PDF exports.
2. A project can be brought in from a file and taken out as a file, and a project exported from the web version opens in
   the desktop version (and the other way round) after unzipping.
3. Hosting costs nothing: Cloudflare Pages free plan.
4. No user data leaves the tab except by an explicit user download, and no project data survives closing the tab
   (interface preferences do, §5.3).
5. The site is private: only the owner can open it (§6 Phase 13, Cloudflare Access).

### Non-goals
- Accounts, cloud saving, sync, collaboration on the same project.
- The command line (`src/cli/`), the portable Windows build, the logs folder, the lock file, recent projects.
- Working offline after the tab is closed (a service worker / installable PWA would store the program on the computer;
  out of scope for v1, see §13).
- Mobile/touch layouts. Desktop browsers only.

### Supported browsers
Current Chrome and Edge (primary, same engine as Electron 42), current Firefox. Safari 17+ best effort.
Requirements used: Web Workers, module workers, WebAssembly, `OffscreenCanvas` in workers, `createImageBitmap`,
`CompressionStream`, `<input type="file" webkitdirectory>`, WebRTC.

---

## 3. Target architecture

```
 Browser tab (main thread)                         Web Worker ("core worker")
 ┌───────────────────────────────┐                 ┌──────────────────────────────────────────────┐
 │ Svelte UI (src/renderer, as is)│                 │ src/main/core/*  (services, unchanged)        │
 │   window.spadewick.*           │  postMessage    │ src/main/ipc/*   (handlers, unchanged)        │
 │ src/preload/index.js (as is)   │ ─────────────▶  │   registered on a fake `ipcMain`              │
 │   ← fake `electron` (bridge)   │ ◀─────────────  │ render.js, text/, production/, colour/ …      │
 │ src/web/ui/: menu bar, file    │  events, file   │                                              │
 │   pickers, downloads, warnings │  requests       │ Shims (src/web/shims/), wired by Vite aliases:│
 └───────────────────────────────┘                 │   fs, path, os, crypto, zlib, url, Buffer,    │
                                                   │   child_process, electron, electron-store,    │
                                                   │   better-sqlite3 → SQLite WASM (in memory)    │
                                                   │   sharp → OffscreenCanvas image ops           │
                                                   │   @resvg/resvg-js → @resvg/resvg-wasm         │
                                                   │ In-memory file system (MemFS): the project    │
                                                   │   folder, imports, temp files, downloads      │
                                                   └──────────────────────────────────────────────┘
                     static files from Cloudflare Pages: app bundle, *.wasm, fonts (fetched on demand), ICC profile
```

Key idea: the desktop code already separates the UI from a "headless core" that receives everything through a `ctx`
(`src/main/core/context.js`, `src/main/core/session.js`). The end-to-end test harness (`tests/e2e/harness.js`,
`tests/helpers/electron-mock.js`) already runs the real UI in Chromium with a stand-in for Electron. The web version does the
same thing for real: the core runs in a Web Worker, and the modules it imports from Node and Electron are replaced
by browser versions **at build time through aliases**, so the core source files barely change.

Why a worker: the core uses synchronous file and database calls and long rendering loops. In a worker they do not freeze the
UI, and the synchronous in-memory file system and synchronous SQLite WASM API work there unchanged.

---

## 4. Ground rules for keeping upstream merges easy

The desktop app keeps being developed in `Flashlighter-hub/spadewick`. To pull its changes in with
`git fetch upstream main && git merge upstream/main`:

1. **New code goes in new files** under `src/web/` (shims, worker, bridge, web UI pieces), `vite.web.config.mjs`,
   `public/`, `tests/web/`.
2. **Replace modules by alias, not by editing callers.** `import { readFileSync } from 'fs'` stays as it is in the core;
   the web build maps `fs` to `src/web/shims/fs.js`.
3. **Edits to shared files are small and marked.** Where a shared file must change, keep the change minimal and put a
   `// WEB:` comment on it so conflicts are easy to recognise. §6 lists every such edit.
4. **Deleted desktop-only files stay deleted.** When upstream changes a file this repository removed, git reports a
   modify/delete conflict; resolve it by keeping the deletion (`git rm <file>`), then check whether the upstream change
   needs a matching change on the web side.
5. **Strings:** new UI text goes in a separate `src/web/strings.web.js` merged over `src/shared/strings.js` at start-up,
   instead of editing the 3,000-line shared strings file.

---

## 5. Data and storage model

### 5.1 The project in memory
A project is the same folder layout as on the desktop (`db.js` → `ensureProjectDirs`):

```
/projects/<Name>/project.db
                 templates/  assets/  fonts/  exports/  snapshots/  .cache/undo/
```

In the web version this folder lives in **MemFS**, an in-memory file system in the core worker
(`src/web/shims/memfs.js`: a `Map` of path → `Uint8Array` plus directory entries and mtimes). Nothing is written anywhere
else. One project is open at a time.

`project.db` is an SQLite database opened **in memory** with the SQLite WASM build. Its bytes are written into MemFS
(`sqlite3_js_db_export`) whenever a file-level operation needs them: exporting the project, making a snapshot, comparing
with a snapshot, duplicating.

### 5.2 The project file: `.spadewick.zip`
- **Export project** writes a standard zip whose single top-level folder is the project folder
  (`<Name>/project.db`, `<Name>/assets/…`). Unzipping it gives a folder the desktop app opens with *Open Project*.
- Excluded from the archive: `.cache/` (undo stash), `exports/` (outputs are downloaded separately), `.spadewick.lock`.
- Included by default: `snapshots/`. The export dialog has a checkbox *Include snapshots* (on by default; snapshots can
  be large).
- Included always: the user's **library** (own templates, presets and components, Phase 8) in a second top-level folder
  `spadewick-library/` next to the project folder. The desktop app ignores it (it is outside the project folder); the
  web app merges it into the session's library on import (Phase 8). Starter items that ship with the app are not
  included.
- File name: `<Name>.spadewick.zip`. **Import project** accepts:
  - a `.zip` (with the project folder at the top, or `project.db` directly at the top),
  - a project folder picked with the folder picker (`webkitdirectory`), for projects made by the desktop app,
  - a single `project.db` (a project without assets).
- Limits: zip64 is not supported by `src/main/zip.js`, so archives are limited to 4 GB. In practice the tab memory limit
  is lower; the import warns above 500 MB and refuses above 2 GB (both limits configurable in `src/web/config.js`).

### 5.3 What is kept and what is not
| Desktop location | Web behaviour |
|---|---|
| Project folder on disk | MemFS, gone when the tab closes |
| `projects_root`, recent projects | Removed |
| electron-store settings (`settings.json`) | Interface preferences in `localStorage` (allowlist below); everything else in memory |
| Template library (`library_dir`), presets, component library | In memory during the session, seeded from the starters; saved **inside every project export** and restored on import (Phase 8) |
| Logs folder | Browser console only |
| `.spadewick.lock` | Not needed (one tab = one copy) |
| Undo stash `.cache/undo` | MemFS, never exported |

**Interface preferences in `localStorage` (decided, §14 Q1).** Stored under one key, `spadewick.settings`, as JSON, and
only these settings keys (an allowlist in `src/web/shims/electron-store.js`; any other key stays in memory):
`theme`, `preview_size`, `ui_layout`, `undo_limit`, `default_export_dpi`, `canvas_smart_guides`, `tts_image_links`,
`image_export_options`, `production_options`, `author_code` (the card ID author code, so card IDs made in different
visits stay distinct). Never stored: `projects_root`, `recent_projects`, `library_dir`, and any value containing a
MemFS path. The renderer already keeps two preferences in `localStorage` itself (`spadewick.rulesMode` in
`RulesView.svelte`, the table-sharing settings in `lib/shareSettings.js`); they stay as they are.
*Preferences → Forget my preferences* clears the key. All access is wrapped in `try/catch` (private windows may refuse
storage; the app then behaves as if nothing was stored).

### 5.4 Losing work
Because closing the tab deletes everything:
- A `beforeunload` warning is shown whenever the project has changes made after the last *Export project*.
- The status bar replaces "Saved just now" (autosave) with **"Not exported — changes since export: N"** /
  **"Exported 3 min ago"**.
- The welcome screen and the *About* dialog say plainly: "Your project only exists in this tab. Export it to keep it."
- `Ctrl+S` runs *Export project*.

---

## 6. Work breakdown

Each step lists **Changes** (existing code that is modified), **Additions** (new code), **Removals** and **Fixes**
(things that are wrong or would break in a browser). File references are to this repository.

### Phase 0 — Repository preparation

**Removals**
- `electron-builder.yml`, `build/` (Windows icons: keep `build/icon.svg`/`icon.png` only as the favicon source, move
  them to `public/`), `scripts/native.mjs`, `scripts/verify-package.mjs`, `scripts/spadewick.cmd`.
- `src/cli/` and the CLI docs `docs/command-line.md`; the `cli` and `rasterWorker` entries in
  `electron.vite.config.mjs`.
- `src/main/index.js` (Electron window and native menu), `src/main/portable.js`, `src/main/log.js` file logging
  (replaced by a console shim), `src/main/core/lock.js` usage (see Phase 3).
- `.github/workflows/test.yml` Windows jobs (`windows`, `package`).
- `spikes/` (desktop research notes, not used by the build).
- Dependencies: `electron`, `electron-builder`, `electron-vite`, `@electron/rebuild`, `electron-store`, `better-sqlite3`,
  `sharp`, `@resvg/resvg-js`.
- Tests that only make sense for the desktop: `tests/integration/cli*.test.js`, `shell.test.js` (packaging),
  `safeRaster.test.js` (child process; replaced in Phase 5), the parts of `projects.test.js` about the lock file,
  recent projects and portable paths.

**Changes**
- `package.json`: name `spadewick-web`, description, scripts:
  `dev` → `vite -c vite.web.config.mjs`, `build` → `vite build -c vite.web.config.mjs`, `preview`, `test`,
  `test:browser`, `test:e2e`; remove `postinstall`, `dist`, `rebuild`, `native`. `docs` keeps only the SVG naming guide.
- `README.md`, `SETUP.md`: rewritten for the web version (what it is, privacy model, `npm run dev`, deploying).
- `.gitignore`: add `out-web/`, `.wrangler/`.

**Additions**
- Dependencies: `vite` (already a dev dependency), `@sqlite.org/sqlite-wasm`, `@resvg/resvg-wasm`, `buffer`
  (Buffer polyfill), `path-browserify` (or a small posix `path` in `src/web/shims/path.js`), `@noble/hashes`
  (synchronous SHA-1/SHA-256), `fflate` (synchronous deflate/inflate).
- `.github/workflows/web.yml`: install, unit tests, browser tests, build, upload `out-web` as an artifact (Linux runner).
- `.nvmrc` with `20` for Cloudflare's build image.

### Phase 1 — Runtime foundation (worker, shims, bridge)

**Additions**
- `vite.web.config.mjs`
  - `root: src/renderer`, output `out-web/`, Svelte plugin (same as the desktop renderer config).
  - `resolve.alias` for the **worker** build: `fs`, `fs/promises`, `path`, `os`, `crypto`, `zlib`, `url`,
    `child_process`, `electron`, `electron-store`, `better-sqlite3`, `sharp`, `@resvg/resvg-js` → `src/web/shims/*`.
  - `define: { 'process.platform': '"web"', 'process.env': '{}' }` plus a tiny `process` shim
    (`process.resourcesPath` undefined, `process.cwd()` → `/`).
  - `worker.format: 'es'`, `optimizeDeps.exclude` for the WASM packages, `assetsInclude: ['**/*.wasm']`.
  - Copy `resources/fonts/**` and `resources/profiles/**` to `out-web/resources/` (fetched on demand, not bundled).
- `src/web/worker/core.worker.js` — the core worker:
  1. loads SQLite WASM, resvg WASM, HarfBuzz, lcms (in parallel, with a progress message to the UI);
  2. creates the in-memory settings and the web `ui` object (Phase 4);
  3. calls the **existing** `registerIpcHandlers(store)` from `src/main/ipc/index.js`, which registers every handler
     on the fake `ipcMain`;
  4. answers `{ id, channel, args }` messages by calling the registered handler and posting `{ id, result | error }`.
     Results are transferred (`Uint8Array` buffers as transferables) instead of copied.
  5. forwards `project:changed` events (`onProjectChange`) to the main thread.
- `src/web/bridge.js` — runs in the main thread before the UI:
  - creates the worker;
  - provides the fake `electron` module for `src/preload/index.js`: `contextBridge.exposeInMainWorld(name, api)` →
    `window[name] = api`; `ipcRenderer.invoke` → message to the worker; `ipcRenderer.on/off` → events from the worker
    and from the web menu bar (`menu:*` channels).
  - imports `src/preload/index.js` **unchanged**, so `window.spadewick` has exactly the desktop API (≈200 methods).
- `src/web/shims/electron.js` (worker side): `ipcMain.handle` registry (as in `tests/helpers/electron-mock.js`),
  `dialog.showOpenDialog/showSaveDialog` (Phase 4), `shell.openExternal` → ask the main thread to `window.open(url,
  '_blank', 'noopener')`, `shell.openPath` → no-op returning `''`, `BrowserWindow.getAllWindows` → `[]`,
  `app.getPath` → `/tmp`, `app.isPackaged` → `true`.
- `src/web/shims/memfs.js` + `src/web/shims/fs.js`: synchronous implementations of every `fs` function the code uses —
  `existsSync, statSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, unlinkSync, renameSync,
  copyFileSync, cpSync, mkdtempSync, appendFileSync, openSync, closeSync, readSync, writeSync, fstatSync` — plus the
  `fs/promises` versions if any are used. `statSync` returns `{ size, mtimeMs, isFile(), isDirectory() }`.
  `readFileSync(p, 'utf8')` returns a string, otherwise a `Buffer` (from the `buffer` polyfill) so `.toString('base64')`
  keeps working. Paths are POSIX; the root holds `/projects`, `/tmp`, `/imports`, `/downloads`, `/library`, `/resources`.
- `src/web/shims/path.js` (POSIX `join, dirname, basename, extname, resolve, relative, sep, posix`),
  `os.js` (`tmpdir()` → `/tmp`), `url.js` (`fileURLToPath` passthrough), `crypto.js` (`randomUUID` →
  `crypto.randomUUID()`, `createHash('sha1'|'sha256').update(x).digest('hex'|'base64'|…)` synchronous via
  `@noble/hashes`), `zlib.js` (`deflateRawSync`, `inflateRawSync`, `inflateSync` via `fflate`),
  `child_process.js` (`fork` throws, so `safeRaster.js` takes its in-process path; see Phase 5).
- `src/web/shims/electron-store.js`: a settings store with electron-store's shape (`get`, `set`, `store`,
  `onDidChange`) and the desktop defaults from `src/main/index.js` (`undo_limit`, `autosave_interval_seconds`,
  `preview_size`, `theme`, `default_export_dpi`, `canvas_smart_guides`, `tts_image_links`, `library_dir: '/library'`,
  `projects_root: '/projects'`). Allowlisted keys (§5.3) are loaded from and written to `localStorage`. The worker has
  no `localStorage`, so the main thread owns the store: it sends the saved values to the worker at start-up, and the
  worker posts every `set` of an allowlisted key back to the main thread, which writes it.
- `src/web/main.js`: entry point. Imports `bridge.js`, merges `strings.web.js`, mounts the web shell (menu bar,
  drop zone, download handler), then imports `src/renderer/src/main.js`.
- `src/web/index.html`: the page (title, favicon, `<noscript>` text, CSP meta fallback).

**Fixes**
- `Buffer` is used in 19 files (`Buffer.from`, `.toString('base64')`, `Buffer.concat`). Inject the polyfill globally in the
  worker (`globalThis.Buffer = Buffer`) before any core module loads.
- `src/main/ipc/index.js` `withErrorLogging()` patches `ipcMain.handle`; the shim must allow that (plain object, writable).
- Structured cloning: some handler results may contain `Buffer`s; the bridge converts them to `Uint8Array` the way
  `tests/e2e/harness.js` `revive()` does, so the renderer receives the same shapes as under Electron.

### Phase 2 — Database: better-sqlite3 → SQLite WASM in memory

**Additions**
- `src/web/shims/better-sqlite3.js`: a `Database` class with the better-sqlite3 API the code uses, on top of the
  SQLite WASM `oo1` API:
  - `new Database(path)` — if `path` exists in MemFS, load its bytes with `sqlite3_deserialize`; otherwise create an
    empty in-memory database. Keep `db.name = path` (used by `projectDirOfDb` in `src/main/core/context.js`).
  - `prepare(sql)` → statement with `run(...params)` (returns `{ changes, lastInsertRowid }`), `get`, `all`,
    `iterate`, `raw()`, `columns()`, named (`@name`, `:name`, `$name`) and positional parameters.
  - `exec(sql)`, `transaction(fn)` (returns a function; nested calls become savepoints, as in better-sqlite3),
    `pragma(text, { simple })`, `close()`, `open` flag.
  - `serialize()` → `Uint8Array` (`sqlite3_js_db_export`), and a `flush()` helper writing those bytes to `db.name` in MemFS.
- A `flushProjectDb(projectDir)` call in the places that copy or read `project.db` as a file:
  `snapshotCore.writeSnapshot`, snapshot restore and compare (`core/snapshots.js`, `core/snapshotCompare.js`),
  `core/projects.js` duplicate, and the new *Export project* (Phase 3).

**Changes (marked `// WEB:`)**
- `src/main/db.js`
  - line ~577: the code that picks the Electron prebuilt `better_sqlite3.node` must be skipped in the web build
    (guard on `process.platform === 'web'`).
  - lines 594–595: `journal_mode = WAL` is not available for an in-memory database; skip it on the web
    (`foreign_keys = ON` stays).
- `src/main/snapshotCore.js:28` and `src/main/core/projects.js:142`: `wal_checkpoint` becomes "flush the in-memory
  database to MemFS" on the web (the shim's `pragma('wal_checkpoint…')` can do this, which avoids editing the callers).

**Fixes**
- After a snapshot restore replaces `project.db` in MemFS, the open in-memory database must be reopened from the new
  bytes (`closeProjectDb` + `openProjectDb` already exist; check that restore calls them in that order).
- Integrity check (`db.pragma('integrity_check')`) works unchanged; keep *Help → Check database integrity*.

### Phase 3 — Project lifecycle (new, import, export, close)

**Changes**
- `core/projects.js`
  - `create` — unchanged; `parentDir` defaults to `/projects` from the settings shim.
  - `open` / `openFile` — reached through *Import project*; the web dialog (Phase 4) copies the chosen zip/folder/db
    into MemFS first and returns its path, so `openProject` works as it is. A zip is unpacked by the web layer using
    `src/main/zip.js`'s reader before `openProject` is called.
  - Before opening a different project, the previous one is **removed from MemFS** (not just closed), after a
    confirmation if it has changes since the last export.
  - `duplicate` → becomes *Export a copy as…* (exports under a new name), since there is no second folder to keep.
  - `reveal` → removed from the UI.
  - `autosave` → becomes a no-op that returns `Date.now()`; the status bar no longer uses it (§5.4).
  - Recent projects (`listRecent`, `addRecent`) → always `[]`.
  - `acquire`/`release` of the lock file → no-ops (alias `core/lock.js` to a stub to avoid editing `projects.js`).

**Additions**
- `src/web/project/exportProject.js` (worker): flush the DB, zip `/projects/<Name>` (excluding `.cache/`,
  `exports/`, optionally `snapshots/`) using `src/main/zip.js`'s writer adapted to write into memory, and transfer the
  bytes to the main thread for download as `<Name>.spadewick.zip`.
- `src/web/project/importProject.js` (worker): accept zip bytes, a list of `{ relativePath, bytes }` from a folder
  picker, or a single `project.db`; check names against zip-slip (the reader already does), find `project.db`, place the
  folder at `/projects/<Name>`, call `projects:open`.
- New bridge methods (added to `window.spadewick.webProject`, not to the desktop preload): `importFromFiles(fileList)`,
  `exportProject({ includeSnapshots })`, `dirtySinceExport()`.
- A change counter in the worker (incremented by `onProjectChange`, reset by export) for the warning in §5.4.

**Fixes**
- `src/main/zip.js` uses `openSync/readSync/writeSync/fstatSync` for streaming. With the MemFS shim these work, but the
  whole archive sits in memory twice during export (files + zip). Add `zipToBytes(entries)` / `unzipBytes(bytes)`
  helpers in a new `src/web/project/zipMem.js` that reuse `crc32` and the header code, to halve peak memory.
- `CompressionStream` is asynchronous; the core needs synchronous deflate, hence `fflate` in the `zlib` shim.

### Phase 4 — Files in and out: dialogs, downloads, folders

The core asks for files through `ctx.ui.showOpenDialog` / `showSaveDialog` and the renderer through
`window.spadewick.app.pickDirectory`. The web versions keep the same contract (they return paths), but the paths are in
MemFS:

- **Open dialog** → the worker asks the main thread to show a file picker (`<input type="file">`, with `accept` built
  from `filters`, `multiple` from `multiSelections`, `webkitdirectory` from `openDirectory`). The chosen files are read
  and copied into `/imports/<random>/…`, and their MemFS paths are returned as `filePaths`. Cancel → `{ canceled: true }`.
- **Save dialog** → returns `/downloads/<random>/<defaultPath name>` immediately (no OS dialog). When the handler
  finishes, the bridge sees new files under `/downloads/<random>/` and downloads them through the browser
  (`<a download>` with a Blob URL), then deletes them from MemFS.
- **Choose an output folder** (`app:pick-directory`, and `openDirectory` + `createDirectory` in save situations) →
  returns `/downloads/<random>/`. After the operation, a single file is downloaded as is; several files are zipped into
  one download (`<project>-<what>.zip`).
- `/imports/*` and `/tmp/*` are cleaned after every handler call that used them.

**User-activation fix.** Browsers only open a file picker during a user gesture (a click, about 5 seconds). A dialog
requested by the worker arrives a moment after the click; usually still in time, but not always (for example after a
slow analysis). The main thread therefore shows the picker directly when it can, and otherwise shows a small modal
*"Choose files…"* button, whose click opens the picker. Implement once in `src/web/ui/filePicker.js`.

**Every dialog call site and what it becomes**

| Call site | Desktop | Web |
|---|---|---|
| `core/projects.js:90` open project folder | folder dialog | *Import project* (zip, folder or `project.db`) |
| `core/projects.js:98` open `project.db` | file dialog | merged into *Import project* |
| `core/projects.js:136` reveal | Explorer | removed |
| `core/assets.js:112`, `:143` import / replace images | file dialog | file picker → `/imports` |
| `core/assets.js:196` export an asset to a folder | folder dialog | download the file |
| `core/fonts.js:56` import fonts | file dialog | file picker |
| `core/icons.js:180`, `:245` import / replace icons | file dialog | file picker |
| `core/icons.js:262` import icon folder | folder dialog | folder picker (`webkitdirectory`) |
| `core/profiles.js:61` import ICC profiles | file dialog | file picker |
| `core/svgImport.js:64` import SVG | file dialog | file picker |
| `core/svgImport.js:70` locate a linked image | file dialog | file picker (see fix below) |
| `core/dataio.js:138` import CSV/XLSX/JSON | file dialog | file picker |
| `core/dataio.js:356` export CSV/XLSX/JSON | save dialog | download |
| `core/templatelib.js:224` export template package | save dialog | download |
| `core/templatelib.js:242` open template package | file dialog | file picker |
| `core/presets.js:117` / `:139` import / export preset | file / save dialog | file picker / download |
| `core/components.js:166` / `:174` export / import component | save / file dialog | download / file picker |
| `core/rules.js:183` export rules page (.md) | save dialog | download |
| `core/rules.js:193` export all rules to a folder | folder dialog | download as zip |
| `core/rules.js:224` export rules as HTML | save dialog | download |
| `core/rules.js:351` / `:371` import rules files / folder | file / folder dialog | file / folder picker |
| `core/rules.js:136` open a link | browser | new tab (`noopener`) |
| `core/snapshots.js:123` export snapshot | save dialog | download |
| `core/snapshotCompare.js:139` export comparison | save dialog | download |
| `renderer/stores/actions.js:73` duplicate project | folder picker | *Export a copy as…* |
| `renderer/components/PreferencesDialog.svelte:24` projects folder | folder picker | setting removed |
| `renderer/components/ExportDialog.svelte:113` export output folder | folder picker | removed: exports are always downloaded |

**Fixes**
- `SvgImportDialog.svelte:139–142` derives a folder from a picked path (`r.path.replace(/[\\/][^\\/]*$/, '')`) to find
  sibling images. With MemFS paths this still works only if the user picked the images together. Change the web flow to
  allow choosing **several files at once** (SVG plus its linked images), or the SVG's folder, so links resolve inside the
  same `/imports/<random>/` folder.
- Toasts that show a saved path (`actions.js:77`, `RulesView.svelte:168`, `SnapshotCompare.svelte:116`,
  `AssetBrowser.svelte:91`, `TemplateLibraryDialog.svelte:187`) would show `/downloads/…`. The bridge rewrites results
  containing `/downloads/` paths to the downloaded file name, and the web strings say "Downloaded *name*".
- Drag and drop: add a page-wide drop zone (`src/web/ui/dropZone.js`). Dropping a `.spadewick.zip`/`project.db`/folder
  on the welcome screen imports a project; dropping images on the asset browser imports assets. (Electron's
  `File.path` is not used by the current code, so there is nothing to undo.)

### Phase 5 — Rendering: resvg, HarfBuzz, fonts, colour

**Changes**
- `@resvg/resvg-js` → `@resvg/resvg-wasm` through `src/web/shims/resvg.js`, which exports a `Resvg` class with the
  same constructor and `render().asPng()`. Initialise once with the `.wasm` file (`initWasm(fetch(url))`).
  - `font.fontFiles` (paths) is translated to `font.fontBuffers` (bytes read from MemFS); `loadSystemFonts: false`
    stays.
  - Performance: resvg-wasm parses every font buffer on every render. Cache the list per project and keep it to the
    fonts the SVG actually uses (`collectFontFiles` in `render.js` already does this). Measure with a 300-card export
    (§12).
- `src/main/safeRaster.js`: with `child_process.fork` unavailable it falls back to in-process rendering
  (`SPADEWICK_RASTER_IN_PROCESS` path, line 149). A resvg-wasm panic throws a JavaScript error instead of killing
  a process, so the existing level 0 → 1 → 2 retry logic still applies; check that the error type is classified as a
  crash (add the WASM `RuntimeError` / `unreachable` case — `// WEB:` edit). The 90 s timeout cannot interrupt
  synchronous WASM; if a render hangs, the UI offers *Restart engine*, which terminates the worker and reopens the
  project from MemFS bytes kept by the main thread (Phase 10).
- `src/main/text/hb.js`: `readFileSync(file)` works through MemFS once fonts are there (below). `import('harfbuzzjs')`
  works in a module worker; make sure Vite emits its `.wasm` (`?url` import or `optimizeDeps.exclude`).
- `src/main/colour/lcms.js`: `lcms-wasm` runs in the worker unchanged; the CGATS21 profile is fetched from
  `/resources/profiles/` into MemFS at start-up (3.5 MB, only when the production panel is first used).
- `wawoff2` (WOFF2 fonts): WASM, works in the worker; check its loader finds its `.wasm` under Vite.

**Fonts (46 MB, 170 files) — loaded on demand**
- `src/main/fontFiles.js` `bundledFontsDir()` (uses `process.resourcesPath`, line 60) returns `/resources/fonts` on the
  web (`// WEB:` edit, or alias resolution through the `process` shim).
- At start-up the worker fetches `resources/fonts/extra/manifest.json` and the default families
  (Liberation Sans/Serif/Mono, Noto Sans Arabic/Hebrew, ≈3 MB) into MemFS.
- **Fixes:** every code path that reads a bundled font synchronously must find it already in MemFS. Add
  `ensureFonts(families)` (async, in `src/web/fonts/loader.js`) and call it from the bridge **before** each request that
  renders: on project open (all families named in templates, text styles and rich text), before `templates:render`,
  exports, previews, production and the font dialog's previews. The bridge knows which channels render (a fixed list).
  A family that is not yet loaded when a synchronous read happens throws a clear `FONT_NOT_LOADED` error, the bridge
  loads it and retries the call once.
- Fonts are served with long cache headers (§11); the browser's HTTP cache is the only place they are kept.

### Phase 6 — Images: sharp → browser image operations

`sharp` is used in 12 files with a small set of operations. `src/web/shims/sharp.js` implements a chainable `sharp()`
with exactly these, on `OffscreenCanvas` and typed arrays in the worker:

| Operation | Used in | Web implementation |
|---|---|---|
| `sharp(buffer)`, `sharp(path)` | many | decode with `createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })`; path → MemFS bytes |
| `sharp({ create: { width, height, channels, background } })` | export, preview, production | filled canvas |
| `sharp(buf, { raw: { width, height, channels } })` | production engine/images | `ImageData` from RGB/RGBA bytes |
| `.metadata()` → `width, height` | export, raster, assets | from the decoded bitmap (format/size sniffed from header bytes without decoding where possible) |
| `.resize(w, h, { fit: fill/contain/inside, background, withoutEnlargement, kernel: 'nearest' })` | export, preflight, assets, production | canvas `drawImage`, `imageSmoothingQuality = 'high'`; `nearest` → smoothing off. For large downscales use stepwise halving to match Lanczos quality |
| `.extract({ left, top, width, height })` | raster | `getImageData` crop |
| `.extend({ …, extendWith: 'mirror' / 'copy' / 'background' })` | raster (bleed) | pixel loop on `ImageData` |
| `.flatten({ background })` | raster, export | composite over a solid colour |
| `.removeAlpha().raw().toBuffer({ resolveWithObject })` | raster, export | `getImageData` → RGB bytes + `{ info: { width, height, channels } }` |
| `.composite([{ input, left, top }])` | export sheets, preview | `drawImage` per input |
| `.png({ compressionLevel })` | many | `convertToBlob({ type: 'image/png' })` |
| `.jpeg({ quality, chromaSubsampling })` | assets, production images | `convertToBlob({ type: 'image/jpeg', quality })` (chroma subsampling cannot be chosen; see fix) |
| `.webp({ quality })` | assets | `convertToBlob({ type: 'image/webp' })` (Safari cannot encode WebP → fall back to PNG) |
| `.withMetadata({ density })` | production images | write a PNG `pHYs` chunk / JPEG JFIF density bytes after encoding |

**Fixes**
- **Colour exactness.** Canvas decoding must not colour-manage or premultiply (options above), or print colours shift.
  Canvas writes 8-bit sRGB only; 16-bit PNGs and embedded ICC profiles in imported images are reduced to 8-bit sRGB.
  The production pipeline already converts colours with lcms on raw pixels, so its output is not affected.
- **Production JPEG 4:4:4.** `production/images.js:21` asks for `chromaSubsampling: '4:4:4'`, which canvas cannot do.
  Use PNG for the RGB "images" output on the web, or add a small JPEG encoder (`jpeg-js`, pure JS) for this one case.
  CMYK JPEGs are already written by the project's own `production/jpeg.js` and are unaffected.
- **Size limits.** Canvas maximum area differs per browser (Chrome ≈ 268 M pixels, Safari ≈ 16.7 M). A PNG sheet of 70
  cards at 300 DPI exceeds Safari's limit. Check the size before drawing and either split the sheet or show an error
  with the limit (export dialog).
- Memory: close `ImageBitmap`s after use (`bitmap.close()`); long exports otherwise exhaust GPU memory.
- A parity test suite (§12) compares every operation's output with reference images produced by real `sharp` on the
  desktop, with a small tolerance. If parity is not good enough, swap the shim's internals for `wasm-vips` (needs
  cross-origin isolation headers, which Cloudflare Pages supports; ≈5 MB extra download).

### Phase 7 — Exports and outputs

All exports write into `/downloads/<random>/` (Phase 4) and are downloaded when finished.

- **Tabletop Simulator** (`core/export.js` `exportTTS`, `ttsLinks.js`)
  - The JSON + sheets are downloaded as one zip.
  - Image link modes (`IMAGE_LINK_MODES = ['local', 'names', 'cloud']`): **`local`** builds `file:///` paths to the
    output folder, which the browser cannot know. On the web, `local` is hidden; the default becomes `names` (the user
    puts the images next to the JSON / in TTS's folder), and `cloud` (the user uploads to Steam Cloud and pastes links,
    `ttsCloudFiles`/`ttsCloudLinks`) works as on the desktop, with the JSON re-downloaded after links are pasted.
  - **Fix:** `ttsLinks.js` defaults `platform = process.platform`; with `'web'` it must not throw. The settings default
    `tts_image_links: 'local'` becomes `'names'` in the settings shim.
- **Print-and-play PDF, PNG sheets** — unchanged logic, downloaded; several PNG sheets are zipped.
- **Production PDF, production images, proofs, preflight** (`production/*`, `preflight/*`) — unchanged logic; pdf-lib
  runs in the worker. Cancel (`production:cancel`) keeps working because the engine checks a flag between cards.
- **Export preview** (`core/exportPreview.js`) uses `mkdtempSync(tmpdir())` → `/tmp` in MemFS; make sure the temp
  folder is removed even on errors (it is, `rmSync` in `finally`; verify).
- **Rules export** (Markdown page, all pages, HTML) — downloads; "all pages" becomes a zip.
- **Snapshots export / comparison export** — downloads.
- **Asset export** — downloads the original file.
- **Data export** (CSV/XLSX/JSON) — downloads.
- The **ExportDialog** loses the output-folder field and the "open folder when finished" option; the button reads
  *Export and download*.

### Phase 8 — Installation-wide libraries

On the desktop some data lives outside projects, in `library_dir` and the settings: the **template library**
(`templateLibrary.js`, `core/templatelib.js`), **presets** (`core/presets.js`), the **component library**
(`core/components.js`), and the **card ID author code** (`cardIds.js setAuthorStore`).

On the web there is no place on the computer to keep them, so they **travel inside the project archive**
(decided, §14 Q2):
- During the session they live in MemFS under `/library/`, seeded with the starters that ship with the app
  (`templateStarters.js`, `presets/shipped.js`, `componentStarters.js`) — unchanged code.
- **Export project** adds the user's own items (not the starters) under `spadewick-library/` in the zip
  (`templates/`, `presets/`, `components/`, same file layout as `library_dir` on the desktop).
- **Import project** merges `spadewick-library/` into `/library/`:
  - an item that is not in the session is added;
  - an item with the same id and the same content is skipped;
  - an item with the same id and different content: the more recently modified one is kept, and the other is kept as a
    copy named "<name> (from <project>)", so nothing is lost silently;
  - a short summary toast says what was added.
- Opening a second project in the same session keeps the library from the first (it is the session's library), so the
  next export carries both.
- A library can also be used with no project open: *Export library…* / *Import library…* in the library dialogs
  (one zip of `spadewick-library/`). The existing per-item export/import (template packages, `.spadecomponent.json`,
  preset `.json`) keeps working.
- The card ID author code is remembered in `localStorage` (§5.3).
- **Fix:** `templateLibrary.js` and `core/templatelib.js` record the library item a project template came from
  ("origin status"). Item ids must be stable across export/import for this to keep working — the archive keeps the
  original ids; only renamed copies (conflict case above) get new ones, and their origin links point to the copy.

### Phase 9 — User interface

**Changes**
- **Menu bar.** Electron's native menu (`src/main/index.js buildMenu`) is replaced by an HTML menu bar
  (`src/web/ui/MenuBar.svelte`) above the app, with the same items and the same `menu:*` events the renderer already
  listens for (`App.svelte:53–88`), so `App.svelte` does not change. Items:
  - **File:** New Project, **Import Project…**, **Export Project** (`Ctrl+S`), **Export a Copy As…**, Close Project,
    Export ▸ (TTS, PDF, PNG), Preferences. Removed: Open Project File (.db) (merged into Import), Recent Projects,
    Duplicate Project, Reveal in Explorer, Quit.
  - **Edit**, **View**, **Project:** as on the desktop. View loses *Toggle Developer Tools* and *Reload*
    (the browser has them; *Reload* would delete the project).
  - **Help:** Guide, About, Check Database Integrity. Removed: Open Logs Folder.
- **Keyboard shortcuts.** The menu accelerators become `keydown` handlers in the menu bar. Browsers reserve some keys:
  `Ctrl+N`, `Ctrl+T`, `Ctrl+W` cannot be intercepted. **New Project** moves to `Alt+N` (and stays in the menu);
  `Ctrl+O` (Import), `Ctrl+S`, `Ctrl+H`, `Ctrl+B`, `Ctrl+1`, `Ctrl+0`, `Ctrl+Plus/Minus`, `Ctrl+,` are intercepted with
  `preventDefault()`. Zoom shortcuts are only intercepted while the template canvas has focus, so page zoom still works
  elsewhere.
- **Welcome screen** (`Welcome.svelte`): no recent projects list; two big actions *New project* / *Import project* plus
  the drop zone, and the privacy note (§5.4). The `.path` display is removed.
- **Sidebar** (`Sidebar.svelte:157`): the project-name tooltip shows the name, not a MemFS path.
- **Preferences** (`PreferencesDialog.svelte`): remove *Projects folder* and *Autosave interval*; keep theme, preview
  size, undo limit, export DPI, smart guides, TTS link mode (without `local`); add *Forget my preferences* (§5.3).
- **Status bar** (`StatusBar.svelte` / `App.svelte autosave`): export status instead of autosave status (§5.4).
- **About** dialog: version, "runs entirely in your browser", licences link (`THIRD-PARTY-NOTICES.md` served as a page).
- **Loading screen** while the WASM modules and default fonts load (first visit ≈ 8–10 MB).
- **Unsupported browser** message when a required API is missing (§2).

**Text changes** (in `src/web/strings.web.js`, overriding keys of `src/shared/strings.js`; 58 strings mention folders,
paths, Explorer, Windows or the portable build). Notably:
- `offlineAndPortableAllProjects` → "Private: your project stays in this browser tab and is never uploaded."
- `revealInExplorer` → removed.
- Help topics `portable`, `project`, `where` (command line) and the command-line help section → rewritten or removed;
  the *Help* tab (`src/shared/help.js`) gets a "Saving your work" topic explaining import/export.
- Every "saved to *folder*" message → "Downloaded *file*".

### Phase 10 — Errors, logging, robustness
- `src/main/log.js` → aliased to `src/web/shims/log.js`: `logError` writes to `console.error` and keeps the last 200
  entries in memory; *Help → Copy error report* copies them (no file).
- The `withErrorLogging` wrapper in `ipc/index.js` keeps working through the shim.
- **Worker crash / out of memory:** the main thread keeps the bytes of the last *imported or exported* archive. If the
  worker dies, the UI says so and offers *Restart from last export* (changes since then are lost — the dialog says this).
- **Tab memory:** show the project's size in MemFS in the status bar tooltip; warn at 500 MB.

### Phase 11 — Virtual table sharing
- WebRTC (`lib/rtcPeer.js`, `shared/tableNet.js`) is already browser code and works unchanged.
- The default STUN server (`shareSettings.js`, `stun:stun.l.google.com:19302`) is the only third-party connection the app
  makes, and only while connecting a shared table. The share dialog states this (it already explains STUN).
- Saved tables (`core/tables.js`) are stored inside the project (MemFS) and travel with the project archive.

### Phase 12 — Tests

**Keep (Node, unchanged):** the pure unit tests in `tests/unit/` (formulas, card IDs, CSV, text layout helpers, docEdit,
grid, JPEG writer…), which do not touch native modules.

**Additions**
- `tests/web/shims/*.test.js` (Node): MemFS (every `fs` function used), `path`, `crypto` hashes (against Node's
  `crypto`), `zlib` (round trip with Node's `zlib`), the better-sqlite3 shim (run the desktop's `db.js` migrations and
  the `setsFieldsCards`/`history` integration tests against it — SQLite WASM runs in Node too).
- `tests/web/browser/*.test.js` (Vitest browser mode with Playwright's Chromium): the sharp shim parity suite
  (reference PNGs produced once by desktop `sharp` and committed under `tests/fixtures/sharp-parity/`), resvg-wasm
  rendering of `tests/fixtures` cards compared with the desktop renders (pixel tolerance), production PDF smoke test.
- **Integration tests** in `tests/integration/` are moved to run in the browser-mode project with the web shims
  (most need only `fs`, the DB and rendering). Desktop-only ones are removed (Phase 0).
- **End-to-end:** `tests/e2e/harness.js` is replaced by a harness that serves `out-web/` and drives it with Playwright
  (no IPC-over-HTTP needed any more). Keep the existing e2e scenarios; add: import a zip, edit, export, re-import and
  compare; `beforeunload` warning; download of each export type; a project made by the desktop app imports correctly.
- **Round-trip compatibility test:** a fixture project exported by the desktop app → import on web → export → open in
  the desktop core (run the desktop `openProject` under Node in CI from the upstream remote) — guards §2 goal 2.

### Phase 13 — Build and deploy on Cloudflare Pages

**Additions**
- `public/_headers`:
  ```
  /*
    Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
    Referrer-Policy: no-referrer
    X-Content-Type-Options: nosniff
    Permissions-Policy: camera=(), microphone=(), geolocation=()
  /assets/*
    Cache-Control: public, max-age=31536000, immutable
  /resources/*
    Cache-Control: public, max-age=31536000, immutable
  ```
  (`connect-src 'self'` blocks any accidental upload to another site; WebRTC is not governed by CSP. If `wasm-vips` is
  adopted, add `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.)
- No `functions/` folder: no server code at all.

**Private site: only the owner can open it (decided, §14 Q4)**
- Hosted on the free `<project>.pages.dev` address, protected by **Cloudflare Access** (Cloudflare Zero Trust, free plan,
  up to 50 users). Visitors see a Cloudflare sign-in page; only the owner's email address is allowed, signing in with a
  one-time code sent to that address. Everyone else is refused before any file of the app is served.
- Setup (Cloudflare dashboard, once):
  1. Create the Zero Trust organisation (Zero Trust → choose a team name, select the Free plan; Cloudflare may ask for a
     payment method even on the free plan).
  2. Workers & Pages → the project → Settings → General → **Enable access policy**. This creates an Access application
     for the preview deployments (`*.<project>.pages.dev`).
  3. Select **Manage** on that policy → Access → Applications → the application → **Configure**. Under *Public hostname*,
     delete the `*` wildcard in *Subdomain* so it covers the production address `<project>.pages.dev`; rename the
     application if asked; save.
  4. Back in the project's Settings → General, select **Enable access policy** again, so previews are protected too.
     Check that Access → Applications lists two applications: `<project>.pages.dev` and `*.<project>.pages.dev`.
  5. In each application's policy: action *Allow*, include rule *Emails* = the owner's email address. Login method:
     *One-time PIN*. Session duration: 24 hours (or as preferred).
  6. Test in a private window: the app must show the Cloudflare sign-in, and a different email must be refused.
- Access sets a `CF_Authorization` cookie on the site after sign-in. It is Cloudflare's sign-in token, not app data, and
  is the only cookie involved (acceptance criterion 3 accounts for it).
- `public/_headers` does not change for Access (Access runs before the site is served). The CSP `connect-src 'self'`
  still allows the app's own requests, which carry the Access cookie automatically.
- No custom domain. If one is added later, it needs its own self-hosted Access application, otherwise visitors on
  that domain get a sign-in page that does not work.
- The GitHub repository stays private; Cloudflare's Git integration works with private repositories.
- `wrangler.toml` (optional, for command-line deploys): `pages_build_output_dir = "out-web"`.

**Cloudflare Pages settings** (Git integration with this repository)
- Production branch: `main`; build command `npm ci && npm run build`; output directory `out-web`;
  environment variable `NODE_VERSION=20`.
- Free plan limits and how the build fits:
  - 20,000 files per site — the build is ≈ 250 files (≈ 170 fonts + licences, bundles, WASM).
  - 25 MiB per file — largest file ≈ 4.6 MB (Merriweather); the WASM files are 1–3 MB each.
  - 500 deploys per month; unlimited static requests and bandwidth.
  - Drag-and-drop upload is limited to 1,000 files — not used (Git integration).
- Preview deployments for pull requests come free with Git integration (protected by Access, step 4 above).

**Size budget:** first load ≤ 10 MB compressed (app ≈ 2 MB, SQLite ≈ 0.9 MB, resvg ≈ 2.5 MB, HarfBuzz ≈ 0.6 MB, lcms
≈ 0.5 MB, default fonts ≈ 3 MB); other fonts and the ICC profile on demand.

### Phase 14 — Documentation and licences
- `THIRD-PARTY-NOTICES.md`: add SQLite (public domain), resvg-wasm (MPL-2.0), fflate (MIT), @noble/hashes (MIT),
  buffer (MIT), path-browserify (MIT) if used; remove Electron, sharp/libvips, better-sqlite3. The notices are served
  at `/THIRD-PARTY-NOTICES` and linked from *About*.
- Fonts: the OFL/Apache licences allow serving the font files publicly; keep each licence file next to its fonts in
  `resources/fonts/extra/` (they are copied to the site).
- `README.md`: what the web version is, the privacy model (§1, §5), run locally, deploy, how to merge upstream.
- `docs/svg-naming-guide.md` stays (`npm run docs`); `docs/command-line.md` is removed.

### Phase 15 — Merging desktop changes later
- One-time setup in a clone: `git remote add upstream https://github.com/Flashlighter-hub/spadewick`.
- Each merge: `git fetch upstream main && git merge upstream/main`, then:
  - modify/delete conflicts on removed desktop files → keep the deletion;
  - conflicts on `// WEB:` lines → re-apply the web change;
  - new `ctx.ui` dialog calls, new `fs`/`sharp` functions, new Node modules in the core → extend the shims (the shim
    tests fail with "not implemented: <name>" when the core uses something new);
  - new IPC channels → nothing to do (the unchanged preload and handlers carry them);
  - new strings mentioning folders/paths → add web overrides.
- CI step `check-shims`: greps the core for imports of Node built-ins and `sharp` methods not covered by the shims.

---

## 7. Consolidated list of removals
- Electron shell: `src/main/index.js`, `src/main/portable.js`, native menu, window code.
- Packaging: `electron-builder.yml`, `build/` (except favicon sources), `scripts/native.mjs`, `scripts/verify-package.mjs`,
  `scripts/spadewick.cmd`, the `dist`/`rebuild`/`native`/`postinstall` scripts.
- Command line: `src/cli/`, `docs/command-line.md`, CLI tests.
- Desktop CI jobs (Windows `windows` and `package`).
- `spikes/`.
- Features: recent projects, projects folder setting, autosave, duplicate project (→ export a copy), reveal in Explorer,
  open logs folder, open `.db` file as a separate command, lock file, `local` TTS image links, export output folder.
- Dependencies: electron, electron-builder, electron-vite, @electron/rebuild, electron-store, better-sqlite3, sharp,
  @resvg/resvg-js.

## 8. Consolidated list of edits to shared desktop files (all marked `// WEB:`)
| File | Edit |
|---|---|
| `src/main/db.js` (~577, 594) | skip the Electron native-module path and WAL on the web |
| `src/main/fontFiles.js` (~60) | bundled fonts at `/resources/fonts` on the web |
| `src/main/safeRaster.js` | treat a WASM runtime error as a crash for the retry levels |
| `src/main/ttsLinks.js` | accept `platform = 'web'` |
| `src/main/production/images.js:21` | 4:4:4 JPEG via `jpeg-js` or PNG on the web |
| `src/renderer/src/components/SvgImportDialog.svelte:139` | multi-file pick for linked images |
| `src/renderer/src/components/ExportDialog.svelte:113` | hide the output folder on the web |
| `src/renderer/src/components/PreferencesDialog.svelte:24` | hide projects folder and autosave on the web |
| `src/renderer/src/components/Welcome.svelte` | web start screen (or replace the component through an alias) |
| `src/renderer/src/App.svelte` | status bar text and `beforeunload` (or move both into `src/web/`) |

Everything else is reached through aliases and new files. Where a renderer component needs a different web version,
prefer aliasing the component to a `src/web/ui/` copy over editing it, if the edit would be large.

## 9. Behaviour changes users will notice
1. The project disappears when the tab is closed or reloaded, unless exported.
2. Projects are opened by importing a file or folder and kept by exporting a `.spadewick.zip`.
3. Every export is a browser download (several files arrive as one zip).
4. No recent projects, no projects folder, no logs folder, no command line.
5. TTS "local file" links are not available; use "file names" or Steam Cloud links.
6. Very large PNG sheets may need splitting on Safari.
7. Exports of hundreds of cards are slower than on the desktop (WASM vs native; target ≤ 2× the desktop time).
8. The user's own templates, presets and components are kept by exporting a project (they travel inside every
   project archive) or with *Export library…*.
9. New Project is `Alt+N` (browser reserves `Ctrl+N`).
10. The site asks the owner to sign in with a one-time email code (Cloudflare Access).

## 10. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Users lose work by closing the tab | `beforeunload` warning, status bar export state, `Ctrl+S` export, welcome-screen notice |
| Tab runs out of memory on big projects | size warning at 500 MB, refuse > 2 GB, image downscaling on import (already 2048 px WebP for assets), close bitmaps |
| Canvas image ops differ from sharp | parity test suite; fallback to `wasm-vips` |
| resvg-wasm slower / font re-parsing | limit fonts per render, measure in CI, consider one resvg `fontdb` per project when resvg-wasm exposes it |
| A synchronous WASM render hangs | *Restart engine* from the last export bytes; cards that hang are remembered (existing level memory) |
| File picker blocked (no user gesture) | fallback "Choose files…" modal button |
| Upstream merges become hard | §4 rules, `// WEB:` markers, shim coverage check in CI |
| Fonts not loaded before a synchronous read | `ensureFonts` before rendering channels; `FONT_NOT_LOADED` retry |

## 11. Acceptance criteria
1. `npm run build` produces `out-web/`; deploying it to Cloudflare Pages (free plan) serves a working app over HTTPS.
2. With the browser's network panel open, a full session (import, edit, export of each kind) makes **no requests**
   other than GETs of the site's own static files (and STUN only when sharing a table).
3. After closing and reopening the tab, no project data is present; DevTools → Application shows no IndexedDB or OPFS
   data, `localStorage` holds only `spadewick.settings` (allowlisted keys), `spadewick.rulesMode` and the
   table-sharing settings, and the only cookie is Cloudflare Access's `CF_Authorization`.
4. A project exported by the desktop app (zipped folder) imports and renders identically (pixel tolerance) to the
   desktop; a project exported by the web app opens in the desktop app after unzipping.
5. Every feature listed in §2 goal 1 works in current Chrome, Edge and Firefox; the e2e suite passes in Chromium.
6. Exports of the fixture project (TTS, PnP PDF, PNG sheet, production PDF) match desktop output within tolerance.
7. Lighthouse: no console errors on load; first load ≤ 10 MB compressed.
8. Opening the site in a private window without signing in shows the Cloudflare Access page and no part of the app;
   signing in with any email other than the owner's is refused.
9. Exporting a project and importing it in a fresh tab restores the user's own templates, presets and components.

## 12. Performance targets
- First load (cold cache, 50 Mbit/s): interactive in ≤ 5 s; repeat visits ≤ 2 s (HTTP cache).
- Card preview render: ≤ 300 ms for a typical card.
- Export 100 cards to a PnP PDF at 300 DPI: ≤ 2× the desktop time on the same machine.

## 13. Later (not in v1)
- Optional installable PWA / offline use (would cache the program, never the projects).
- Optional *Open folder in place* using the File System Access API in Chrome/Edge (would write to the user's disk, which
  v1 deliberately avoids).
- Touch/tablet layout.

## 14. Decisions (answered by the owner)
- **Q1. Keep interface preferences between visits?** Yes — in `localStorage`, allowlisted keys only (§5.3).
- **Q2. Carry the user's library inside project archives?** Yes — automatically, merged on import (§5.2, Phase 8).
- **Q3. Include snapshots in project exports?** Yes by default, with a checkbox to leave them out (§5.2).
- **Q4. Hosting?** Free `*.pages.dev` address, private to the owner through Cloudflare Access (Phase 13).

## 15. Suggested order of work
1. Phase 0, Phase 1 (worker + shims + unchanged preload) and Phase 2 (database): the app starts, a new project can be
   created and edited, previews may still be blank.
2. Phase 5 (resvg, fonts) and Phase 6 (sharp shim): previews and the template editor work.
3. Phase 3 and Phase 4: import/export of projects and every file dialog.
4. Phase 7 and Phase 8: all exports and the libraries.
5. Phase 9 and Phase 10: web menu, texts, warnings, robustness.
6. Phase 12 alongside each phase; Phase 13 deploy as soon as step 1 works (preview deployments per pull request);
   Phase 14 before the first public link.
