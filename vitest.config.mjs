import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { webModules, webAliases } from './src/web/build/webModules.mjs'

/**
 * The tests of the web version (WEB-PRD Phase 12), in four Vitest projects:
 *   unit              the desktop's unit tests that need nothing native, in Node as before
 *   web               tests/web/: the browser versions of Node's modules (src/web/shims/), and desktop code running on them
 *   desktop-on-web    the desktop's own tests that pass completely on the web versions (in-memory files, SQLite WebAssembly)
 *   desktop-progress  every desktop test that needs the web versions, to follow how many pass as the phases land
 * `npm test` runs the first three; `npm run test:progress` the last.
 *
 * On 2026-10-16 (Phase 5) desktop-progress passes 594 of 809 tests. Each failing one waits for images (Phase 6), or
 * needs what the web version does not have: the command line (cardBacks, one test of balanceViews) or a log file (renderContextLog; the web version logs to the console, Phase 10).
 * tests/e2e/ is not run: its harness drives the desktop main process, and is replaced in Phase 12.
 */
const DESKTOP_ON_WEB = [
  'tests/unit/cardSizes.test.js',
  'tests/unit/exportHelpers.test.js',
  'tests/unit/legacyPalette.test.js',
  'tests/unit/production.test.js',
  'tests/unit/richLayout.test.js',
  'tests/unit/textControls.test.js',
  'tests/unit/textEngine.test.js',
  'tests/integration/bundledFonts.test.js',
  'tests/integration/cardSizeModel.test.js',
  'tests/integration/displayName.test.js',
  'tests/integration/findReplace.test.js',
  'tests/integration/projectChanges.test.js',
  'tests/integration/projects.test.js',
  'tests/integration/setsFieldsCards.test.js',
  'tests/integration/tables.test.js',
  'tests/integration/templateCanvasLock.test.js',
  'tests/integration/textCheck.test.js',
  'tests/integration/textEngine.test.js'
]

/** Every desktop test that needs the database, drawing or images (anything native on the desktop). */
const DESKTOP_ALL = [
  'tests/unit/cardSizes.test.js',
  'tests/unit/exportHelpers.test.js',
  'tests/unit/jpeg.test.js',
  'tests/unit/legacyPalette.test.js',
  'tests/unit/production.test.js',
  'tests/unit/richLayout.test.js',
  'tests/unit/textControls.test.js',
  'tests/unit/textEngine.test.js',
  'tests/integration/**/*.test.js'
]

const shared = { pool: 'forks', testTimeout: 30000, hookTimeout: 30000, environment: 'node' }

const ELECTRON_MOCK = fileURLToPath(new URL('./tests/helpers/electron-mock.js', import.meta.url))

const desktopOnWeb = (name, include) => ({
  plugins: [webModules({ electron: ELECTRON_MOCK })],
  resolve: { alias: webAliases },
  test: { ...shared, name, include, setupFiles: ['tests/web/setup.js', 'tests/web/setup-desktop.js'] }
})

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { electron: ELECTRON_MOCK } },
        test: { ...shared, name: 'unit', include: ['tests/unit/**/*.test.js'], exclude: DESKTOP_ALL }
      },
      {
        plugins: [webModules()],
        resolve: { alias: webAliases },
        test: { ...shared, name: 'web', include: ['tests/web/**/*.test.js'], setupFiles: ['tests/web/setup.js'] }
      },
      desktopOnWeb('desktop-on-web', DESKTOP_ON_WEB),
      desktopOnWeb('desktop-progress', DESKTOP_ALL)
    ]
  }
})
