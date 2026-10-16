/**
 * The page's entry point (WEB-PRD Phase 1). The order of the imports is the order things must happen in:
 *   1. the browser has what the app needs (else a message, and nothing else starts)
 *   2. the web text is laid over the desktop text
 *   3. the desktop preload script, unchanged, defines window.spadewick on top of the core worker
 *   4. the desktop interface (src/renderer) starts as it does in the desktop app
 */
import { missingFeatures, showProblem } from './ui/startup.js'

const missing = missingFeatures()
if (missing.length) {
  document.getElementById('web-loading')?.remove()
  showProblem('unsupportedTitle', 'unsupportedText', { missing: missing.join(', ') }, false)
} else {
  const { setCatalog, tr } = await import('../shared/i18n.js')
  const { strings } = await import('../shared/strings.js')
  const { webStrings, mergeStrings } = await import('./strings.web.js')
  setCatalog(mergeStrings(strings, webStrings))

  await import('../preload/index.js')
  await import('./ui/web.css')
  const projectUi = await import('./project/projectUi.js')
  projectUi.install()
  ;(await import('./ui/shortcuts.js')).install()
  ;(await import('./files/picker.js')).install()
  ;(await import('./files/dropZone.js')).install()
  const { on, whenReady } = await import('./bridge/worker.js')
  // the loading screen stays until the core is ready, or says why it could not start
  const loading = document.getElementById('web-loading')
  whenReady.then(() => loading?.remove(), () => loading?.remove())
  const { toast } = await import('../renderer/src/stores/ui.js')

  on('web:notice', ({ key, what }) => {
    if (key === 'notYet') toast(tr(what === 'open' ? 'web.notYetOpen' : what === 'save' ? 'web.notYetSave' : 'web.notYet'), 'info', 5000)
    else toast(what, 'error', 8000)
  })
  // the core could not start: a page that says so; it stopped later: the crash dialog offers to start again (Phase 10)
  let started = false
  whenReady.then(() => { started = true }, () => {})
  const { crashed } = await import('./ui/recovery.js')
  on('web:fatal', error => (started ? crashed.set(error) : showProblem('fatalTitle', 'fatalText', { message: error.message }, true)))

  const { appTitle } = await import('./ui/menu.js')
  document.title = appTitle()

  await import('../renderer/src/main.js')

  const { default: WebShell } = await import('./ui/WebShell.svelte')
  new WebShell({ target: document.getElementById('web-shell') })
}
