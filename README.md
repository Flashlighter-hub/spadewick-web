# Spadewick Web

The Spadewick card-game design tool, running entirely in a browser tab. It is the web version of the desktop app
[Spadewick](https://github.com/Flashlighter-hub/spadewick). The plan for the move is [WEB-PRD.md](WEB-PRD.md).

**Status: early work.** Phases 0 to 2 of the plan are done:
- the desktop app's code runs in the browser: its interface in the page, its background logic in a background thread;
- projects can be created and edited (sets, fields, cards, undo, snapshots), with the database held in memory.

Not yet: drawing cards and fonts (Phase 5), images (Phase 6), importing and exporting projects and files (Phases 3
and 4), and the exports (Phase 7). Until Phase 3, a project lives only as long as the tab.

## How it keeps your work private

- **Nothing reaches a server.** The site is static files. Your project is never uploaded.
- **Nothing about your project is stored on your computer.** It lives in the tab's memory and is gone when you close
  the tab. To keep it, you export it as a file (from Phase 3 on).
- **Interface preferences are remembered** between visits in the browser: theme, panel sizes, export options. They
  contain nothing from your projects. The list is `REMEMBERED_SETTINGS` in `src/web/config.js`.

## Run it locally

You need [Node.js](https://nodejs.org) 20 or newer (22 works) and git. Nothing is compiled; there are no native modules.

```
git clone https://github.com/Flashlighter-hub/spadewick-web.git
cd spadewick-web
npm install
npm run dev
```

Then open the address it prints (http://localhost:5173). Use a current Chrome, Edge or Firefox.

| Command | What it does |
|---------|--------------|
| `npm run dev` | Development server with live reload |
| `npm test` | Unit tests, the tests of the browser versions, and the desktop tests that already pass on them (see `tests/README.md`) |
| `npm run test:progress` | Every desktop test that needs the browser versions, to see how many pass as the phases land |
| `npm run build` | Builds the site into `out-web/` |
| `npm run preview` | Serves the built site locally |
| `npm run docs` | Rewrites `docs/svg-naming-guide.md` from the program's own text |

## How it is built

- **The interface:** the desktop interface (`src/renderer/`) runs unchanged in the page.
- **The background logic:** the desktop main-process code (`src/main/`) runs in a Web Worker
  (`src/web/worker/core.worker.js`).
- **The bridge between them:** the desktop's own preload script (`src/preload/index.js`) runs unchanged too. It gets
  a stand-in for Electron (`src/web/bridge/`), so its calls go to the worker.
- **Node and native modules:** what the desktop code imports from Node and from native packages is replaced by
  browser versions when the site is built (`src/web/shims/`, rules in `src/web/build/webModules.mjs`). Files are kept
  in an in-memory file system; the project database is SQLite compiled to WebAssembly, held in memory.

The rules that keep desktop updates mergeable are in WEB-PRD §4.

## Taking in changes from the desktop app

```
git remote add upstream https://github.com/Flashlighter-hub/spadewick   # once
git fetch upstream main
git merge upstream/main
```

If a file this repository deleted was changed upstream, keep the deletion. Lines marked `WEB:` are web-only edits to
desktop files: re-apply them if they conflict. WEB-PRD Phase 15 has the full checklist.

## Fonts and their licences

The 55 extra font families in `resources/fonts/extra/` are under the SIL Open Font License or Apache 2.0, each with its
licence file. `THIRD-PARTY-NOTICES.md` lists them, and is brought up to date for the web version in Phase 14.
