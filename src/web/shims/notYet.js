/**
 * The parts of the desktop app that arrive in later phases of WEB-PRD.md. Importing them works, so the whole core loads;
 * using them fails with a message that says which phase brings them.
 */
export class NotInWebYet extends Error {
  constructor(what, phase) {
    super(`${what} is not available in the web version yet (WEB-PRD ${phase}).`)
    this.name = 'NotInWebYet'
    this.code = 'NOT_IN_WEB_YET'
  }
}
