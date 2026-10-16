<script>
  /**
   * The core worker stopped (WEB-PRD Phase 10): what the tab held is gone. The page kept the project as it was last
   * imported or exported, so a new core can start from it; changes since then are lost, and the dialog says so.
   */
  import { tr } from '../../shared/i18n.js'
  import { crashed, restartFromLast, copyErrorReport } from './recovery.js'
  import { lastArchive, projectState, messageOf } from '../project/projectUi.js'
  import { download } from './download.js'

  export let error

  let busy = false
  let problem = ''
  const kept = $lastArchive
  const when = kept ? new Date(kept.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

  async function again() {
    busy = true
    problem = ''
    try { await restartFromLast() } catch (err) { problem = messageOf(err) } finally { busy = false }
  }
  function keepFile() {
    const p = kept.payload
    if (p.kind === 'zip' || p.kind === 'db') download(p.name ?? `${kept.name}.spadewick.zip`, p.bytes, p.kind === 'db' ? 'application/octet-stream' : 'application/zip')
  }
</script>

<div class="backdrop">
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="crash-title" aria-describedby="crash-text">
    <h2 id="crash-title">{tr('web.crash.title')}</h2>
    <p id="crash-text">{tr('web.crash.text', { message: error?.message ?? '' })}</p>
    {#if kept}
      <p>{tr(kept.kind === 'export' ? 'web.crash.fromExport' : 'web.crash.fromImport', { name: kept.name ?? '', when })}</p>
    {:else}
      <p>{tr('web.crash.nothingKept')}</p>
    {/if}
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
    <div class="actions">
      <button on:click={copyErrorReport}>{tr('web.crash.report')}</button>
      {#if kept && kept.payload.kind !== 'files'}<button on:click={keepFile}>{tr('web.crash.download')}</button>{/if}
      {#if kept}
        <button class="primary" disabled={busy} on:click={again}>{busy ? tr('web.crash.restarting') : tr('web.crash.restart')}</button>
      {:else}
        <button class="primary" on:click={() => { crashed.set(null); projectState.update(s => ({ ...s, dirty: false })); location.reload() }}>{tr('web.crash.reload')}</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 9500; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, .55); padding: 16px; }
  .dialog { max-width: 520px; background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--radius, 8px); padding: 20px 22px; box-shadow: 0 12px 40px rgba(0, 0, 0, .45); }
  h2 { margin: 0 0 10px; font-size: 17px; }
  p { margin: 0 0 10px; line-height: 1.5; }
  .problem { color: var(--color-danger-text); }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 14px; }
</style>
