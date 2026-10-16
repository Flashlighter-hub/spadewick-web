/**
 * Text of the web version (WEB-PRD §4 rule 5). Merged over src/shared/strings.js when the page starts, so the shared
 * strings file stays as the desktop version has it: new keys go under `web`, and a desktop key given here replaces
 * the desktop text in the web version only.
 */
export const webStrings = {
  web: {
    notYetOpen: 'Opening files from your computer comes in a later step of the web version.',
    notYetSave: 'Downloading files comes in a later step of the web version.',
    notYet: 'This is not available in the web version yet.',
    fatalTitle: 'Spadewick could not start',
    fatalText: 'The part of Spadewick that runs in the background stopped: {message}',
    fatalReload: 'Reload the page',
    unsupportedTitle: 'This browser cannot run Spadewick',
    unsupportedText: 'Spadewick needs a current Chrome, Edge or Firefox. Missing here: {missing}.'
  }
}

const isPlain = v => v && typeof v === 'object' && !Array.isArray(v)

/** `base` with `over` laid on top, key by key (neither is changed). */
export function mergeStrings(base, over) {
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) out[k] = isPlain(v) && isPlain(base[k]) ? mergeStrings(base[k], v) : v
  return out
}
