/**
 * Replaces src/main/log.js in the web build (WEB-PRD Phase 10). There is no logs folder: errors go to the browser's console
 * and the last ones are kept in memory, for a "copy error report" command.
 */
const MAX = 200
const entries = []

export function setLogsDir() {}
export function getLogsDir() { return null }

export function logError(context, err) {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
  entries.push(`${new Date().toISOString()} [${context}] ${message}`)
  if (entries.length > MAX) entries.shift()
  try { console.error(`[${context}]`, err) } catch { /* logging must never break the app */ }
}

/** The kept entries, oldest first. */
export const recentErrors = () => entries.slice()
