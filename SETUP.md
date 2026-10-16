# Spadewick Web setup guide

## 1. Requirements

| Needed | Version | Notes |
|--------|---------|-------|
| [Node.js](https://nodejs.org) | 20 or newer (22 works) | npm comes with it; `.nvmrc` names 20 |
| git | any recent | |
| A browser | current Chrome, Edge or Firefox | Safari 17+ is best effort |

No compiler, no native modules, no Electron.

## 2. Install and run

```
git clone https://github.com/Flashlighter-hub/spadewick-web.git
cd spadewick-web
npm install
npm run dev
```

Open http://localhost:5173.

## 3. Tests

```
npm test
```

See `tests/README.md` for what runs now and what comes back in later phases.

## 4. Build the site

```
npm run build      # writes out-web/
npm run preview    # serves out-web/ on http://localhost:4173
```

Deploying `out-web/` to Cloudflare Pages, privately with Cloudflare Access, is WEB-PRD Phase 13.

## 5. Repository map

| Path | What is there |
|------|---------------|
| `src/web/` | the web version's own code: page entry, worker, bridge, shims, build rules |
| `src/main/` | the desktop main-process code (services, rendering, text engine, exports), run in the worker |
| `src/preload/` | the desktop preload script, run unchanged in the page |
| `src/renderer/` | the Svelte interface, unchanged |
| `src/shared/` | strings and code shared by both sides |
| `resources/` | fonts and the colour profile, served as files |
| `public/` | files served as they are (icon) |
| `tests/` | `unit/` (desktop), `web/` (web version); `integration/` and `e2e/` come back in Phase 12 |
