/** `os` for the core worker (WEB-PRD Phase 1): temporary folders live in the in-memory file system. */
export const tmpdir = () => '/tmp'
export const EOL = '\n'
export const platform = () => 'web'
export default { tmpdir, EOL, platform }
