/**
 * Replaces src/main/core/lock.js in the web build (WEB-PRD Phase 3). A project in the web version lives in one tab's memory,
 * so no other program can have it open: there is nothing to lock.
 */
export const LOCK_FILE = '.spadewick.lock'
export function holder() { return null }
export function acquire() {}
export function release() {}
