/**
 * When something goes wrong (WEB-PRD Phase 10), page side.
 *
 *   crashed            a store: the error the core worker stopped with, or null. The crash dialog shows while it is set.
 *   restartFromLast()  start a new core worker and bring the last imported or exported project back into it
 *   copyErrorReport()  Help → Copy Error Report: what went wrong recently, for sending with a description
 */
import { writable, get } from 'svelte/store'
import { tr } from '../../shared/i18n.js'
import { invoke, restart, pageErrors } from '../bridge/worker.js'
import { lastArchive, projectState, messageOf } from '../project/projectUi.js'
import { toast } from '../../renderer/src/stores/ui.js'
import { download } from './download.js'
import { VERSION } from '../config.js'

export const crashed = writable(null)

/** A new core, and the project as it was last imported or exported (null when there is none to bring back). */
export async function restartFromLast() {
  const kept = get(lastArchive)
  await restart()
  crashed.set(null)
  if (!kept) return null
  const placed = await invoke('web:project-import', kept.payload)
  const { openProject } = await import('../../renderer/src/stores/actions.js')
  await openProject(placed.path)
  return placed
}

/** The text of the error report: the version, the browser, the project's size, and the errors kept in the core and the page. */
export async function errorReport() {
  let core = []
  try { core = await invoke('web:error-report') } catch (err) { core = [`(the core could not be asked: ${messageOf(err)})`] }
  const s = get(projectState)
  return [
    `Spadewick web ${VERSION}`,
    `Browser: ${navigator.userAgent}`,
    `Time: ${new Date().toISOString()}`,
    `Project open: ${s.open ? `yes, ${((s.bytes ?? 0) / 1048576).toFixed(1)} MB in memory` : 'no'}`,
    '',
    `Errors in the core (${core.length}):`,
    ...(core.length ? core : ['(none)']),
    '',
    `Errors in the page (${pageErrors.length}):`,
    ...(pageErrors.length ? pageErrors : ['(none)'])
  ].join('\n')
}

export async function copyErrorReport() {
  const text = await errorReport()
  try {
    await navigator.clipboard.writeText(text)
    toast(tr('web.errors.copied'), 'info', 6000)
  } catch {
    // no clipboard (the browser refused): the person gets the report as a file instead
    download('spadewick-error-report.txt', new TextEncoder().encode(text), 'text/plain')
    toast(tr('web.errors.downloaded'), 'info', 6000)
  }
}
