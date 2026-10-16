<script>
  /** Export the project (WEB-PRD §5.2): one zip, downloaded; it opens here again, or in the desktop app once unzipped. */
  import { tr } from '../../shared/i18n.js'
  import Modal from '../../renderer/src/components/Modal.svelte'
  import { projectState, webDialog, includeSnapshots, exportProject } from '../project/projectUi.js'

  let busy = false
  async function go() {
    busy = true
    const done = await exportProject({ includeSnapshots: $includeSnapshots })
    busy = false
    if (done) webDialog.set(null)
  }
  const sizeMb = b => Math.max(0.1, Math.round(b / 104857.6) / 10)
</script>

<Modal title={tr('web.export.title')} width={480} on:close={() => !busy && webDialog.set(null)}>
  <form on:submit|preventDefault={go}>
    <p>{tr('web.export.intro', { name: $projectState.name ?? '' })}</p>
    <label class="check"><input type="checkbox" bind:checked={$includeSnapshots} /> {tr('web.export.snapshots')}</label>
    {#if $projectState.libraryItems}<p class="dim">{tr('web.library.inExport', { n: $projectState.libraryItems })}</p>{/if}
    <p class="dim">{tr('web.export.size', { mb: sizeMb($projectState.bytes) })} {tr('web.export.shortcut')}</p>
    <div class="actions">
      <button type="button" on:click={() => webDialog.set(null)} disabled={busy}>{tr('common.cancel')}</button>
      <button type="submit" class="primary" disabled={busy}>{busy ? tr('web.export.working') : tr('web.export.go')}</button>
    </div>
  </form>
</Modal>

<style>
  .check { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
  .dim { color: var(--color-text-dim); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>
