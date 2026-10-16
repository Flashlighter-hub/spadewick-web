import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { webModules, webAliases } from './src/web/build/webModules.mjs'

/**
 * Two kinds of tests (WEB-PRD Phase 12):
 *   unit  the desktop app's own unit tests that need nothing native, in Node as before
 *   web   the browser versions of Node's modules (src/web/shims/), and desktop code running on top of them
 *
 * Not run yet, because they need what later phases bring (they come back as each phase lands):
 *   - unit tests that draw cards or open a database (resvg, sharp, better-sqlite3): Phases 2, 5, 6
 *   - tests/integration/: run against the web versions in Phase 12 (most need the database, Phase 2)
 *   - tests/e2e/: their harness drives the desktop main process; replaced by a harness for the web build in Phase 12
 */
const NEEDS_LATER_PHASES = [
  'tests/unit/cardSizes.test.js',       // database (Phase 2)
  'tests/unit/exportHelpers.test.js',   // database, drawing, images (Phases 2, 5, 6)
  'tests/unit/jpeg.test.js',            // images (Phase 6)
  'tests/unit/legacyPalette.test.js',   // database, drawing, images
  'tests/unit/production.test.js',      // database, drawing, images
  'tests/unit/richLayout.test.js',      // drawing (Phase 5)
  'tests/unit/textControls.test.js',    // drawing
  'tests/unit/textEngine.test.js'       // drawing
]

const shared = { pool: 'forks', testTimeout: 30000, hookTimeout: 30000, environment: 'node' }

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { electron: fileURLToPath(new URL('./tests/helpers/electron-mock.js', import.meta.url)) } },
        test: { ...shared, name: 'unit', include: ['tests/unit/**/*.test.js'], exclude: NEEDS_LATER_PHASES }
      },
      {
        plugins: [webModules()],
        resolve: { alias: webAliases },
        test: { ...shared, name: 'web', include: ['tests/web/**/*.test.js'] }
      }
    ]
  }
})
