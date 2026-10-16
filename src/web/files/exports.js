/**
 * Exports download (WEB-PRD Phase 7), worker side.
 *
 * On the desktop an export writes into a folder the person chose, or into the project's exports/ folder. A tab has no
 * folder to write into: unless the person chose one (the folder picker answers a download folder), each export writes
 * into a download folder of its own, and what it wrote reaches the person as a download when the call ends: one file
 * as it is (a PDF), several as one zip named after the project and the kind of export ("My Game - Tabletop Simulator.zip").
 *
 * The newest export folder is kept until the next export (or until the project goes): the Steam Cloud step of a
 * Tabletop Simulator export reads its saved object again and writes `<name>_cloud.json` beside it, which is then
 * downloaded on its own.
 */
import { rmSync } from 'fs'
import { wrapHandler, handlerOf } from '../shims/electron.js'

/** The export channels, and what their zip is called after the project's name. */
export const EXPORT_LABELS = {
  'export:tts': 'Tabletop Simulator',
  'export:pdf': 'Print and play',
  'export:png-sheet': 'PNG sheets',
  'production:run': 'Production',
  'production:run-images': 'Card images'
}

const inDownloads = dir => typeof dir === 'string' && dir.startsWith('/downloads/')

export function registerWebExports(dialogs) {
  const projectName = async () => {
    try { return (await handlerOf('projects:get-meta')?.({ sender: null }))?.meta?.name || 'Spadewick' } catch { return 'Spadewick' }
  }
  for (const [channel, label] of Object.entries(EXPORT_LABELS)) {
    wrapHandler(channel, fn => async (event, opts = {}, ...rest) => {
      const o = { ...(opts ?? {}) }
      let made = null
      if (!inDownloads(o.outputDir)) {
        made = dialogs.exportFolder(`${await projectName()} - ${label}`)
        o.outputDir = made
      }
      // a link to a file on this computer means nothing in a download: the saved object names its pictures instead
      if (channel === 'export:tts' && (o.imageLinks ?? 'local') === 'local') o.imageLinks = 'names'
      try {
        return await fn(event, o, ...rest)
      } catch (err) {
        // a failed or stopped export leaves nothing to download
        if (made) rmSync(made, { recursive: true, force: true })
        throw err
      }
    })
  }
}
