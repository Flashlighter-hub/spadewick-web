/**
 * Giving the person a file (WEB-PRD §1: files leave the tab only when the person asks). The browser saves it where it
 * saves downloads, or asks where, as the person has set it up.
 */
export function download(fileName, bytes, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
