import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { webModules, webAliases } from './src/web/build/webModules.mjs'

/**
 * The tests of the web version (WEB-PRD Phase 12), in four Vitest projects:
 *   unit              the desktop's unit tests that need nothing native, in Node as before
 *   web               tests/web/: the browser versions of Node's modules (src/web/shims/), and desktop code running on them
 *   desktop-on-web    every desktop test that needs something native on the desktop (database, drawing, images), run on
 *                     the web versions (in-memory files, SQLite, resvg and libwebp in WebAssembly, the JavaScript image
 *                     library), except the tests of what the web version does not have (WEB_LACKS)
 *   desktop-progress  the same, all of them
 *   e2e               tests/e2e/: the built site (out-web/) driven in Chromium (harness.js)
 * `npm test` runs the first three; `npm run test:progress` desktop-progress; `npm run test:e2e` the e2e suite.
 *
 * On 2026-10-16 (Phase 6) desktop-progress passes every test but the three in WEB_LACKS.
 */

/** Desktop tests of what the web version does not have: the command line, and a log file (it logs to the console). */
const WEB_LACKS = [
  'the command line reads',                                        // balanceViews.test.js
  'render --side back writes the back',                            // cardBacks.test.js
  'names the card, the template, the text elements and the fonts'  // renderContextLog.test.js
]
/** End-to-end scenarios of what the web version does not have (WEB-PRD Phase 12). */
const E2E_WEB_LACKS = [
  'writes a full file link to a file that exists'    // ttsLinks.e2e: links to files on the computer (a download has none, Phase 7)
]
const withoutLacks = new RegExp(`^(?!.*(?:${WEB_LACKS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`)

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

const TEST_CHILD_PROCESS = fileURLToPath(new URL('./tests/web/child_process.js', import.meta.url))

const desktopOnWeb = (name, extra = {}) => ({
  plugins: [webModules({ electron: ELECTRON_MOCK, childProcess: TEST_CHILD_PROCESS })],
  resolve: { alias: [...webAliases.filter(a => !a.find.test('child_process')), { find: /^(node:)?child_process$/, replacement: TEST_CHILD_PROCESS }] },
  test: { ...shared, name, include: DESKTOP_ALL, setupFiles: ['tests/web/setup.js', 'tests/web/setup-desktop.js'], ...extra }
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
      desktopOnWeb('desktop-on-web', { testNamePattern: withoutLacks }),
      desktopOnWeb('desktop-progress'),
      {
        // the scenarios' own helpers: tests/e2e/seed.js in place of tests/helpers/project.js, the web version's sharp
        // (on the disk), and Node's native SQLite for better-sqlite3: packages this repository does not have
        resolve: {
          alias: [
            { find: /^\.\.\/helpers\/project\.js$/, replacement: fileURLToPath(new URL('./tests/e2e/seed.js', import.meta.url)) },
            { find: /^sharp$/, replacement: fileURLToPath(new URL('./src/web/shims/sharp.js', import.meta.url)) },
            { find: /^better-sqlite3$/, replacement: fileURLToPath(new URL('./tests/e2e/nativeSqlite.js', import.meta.url)) }
          ]
        },
        test: {
          ...shared, name: 'e2e', setupFiles: ['tests/e2e/setup.js'], include: ['tests/e2e/**/*.e2e.test.js'], globalSetup: ['tests/e2e/global-setup.mjs'],
          // one file at a time, as the desktop ran them: the scenarios drag on the canvas and time what they see
          testTimeout: 90000, hookTimeout: 90000, fileParallelism: false, poolOptions: { forks: { singleFork: true } },
          testNamePattern: new RegExp(`^(?!.*(?:${E2E_WEB_LACKS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`)
        }
      }
    ]
  }
})
