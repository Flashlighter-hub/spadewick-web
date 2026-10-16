/**
 * Start-up checks of the page (WEB-PRD §2 supported browsers, Phase 10): what the browser must have, and a plain message
 * when Spadewick cannot run. The message is built without Svelte, because it is shown when the app itself cannot start.
 */
import { webStrings } from '../strings.web.js'

export function missingFeatures() {
  const need = {
    'Web Workers': typeof Worker === 'function',
    WebAssembly: typeof WebAssembly === 'object',
    OffscreenCanvas: typeof OffscreenCanvas === 'function',
    createImageBitmap: typeof createImageBitmap === 'function',
    'crypto.randomUUID': typeof crypto?.randomUUID === 'function',
    structuredClone: typeof structuredClone === 'function'
  }
  return Object.entries(need).filter(([, ok]) => !ok).map(([name]) => name)
}

const fill = (text, params) => text.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '')

export function showProblem(titleKey, textKey, params, offerReload) {
  const s = webStrings.web
  const box = document.createElement('div')
  box.setAttribute('role', 'alert')
  box.className = 'web-problem'
  const h = document.createElement('h1')
  h.textContent = s[titleKey]
  const p = document.createElement('p')
  p.textContent = fill(s[textKey], params)
  box.append(h, p)
  if (offerReload) {
    const b = document.createElement('button')
    b.textContent = s.fatalReload
    b.onclick = () => location.reload()
    box.append(b)
  }
  document.body.append(box)
}
