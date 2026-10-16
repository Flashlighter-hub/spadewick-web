/**
 * `child_process` for the core worker (WEB-PRD Phase 1). There are no processes in a browser: `fork` fails, and
 * safeRaster.js draws in the same thread instead (it already does when its helper cannot be started; Phase 5).
 */
export function fork() {
  throw new Error('Helper processes are not available in the web version')
}
export default { fork }
