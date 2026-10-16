<script>
  /**
   * Bring a project in from the computer (WEB-PRD §5.2): a .spadewick.zip exported here, a zip of a desktop project
   * folder, a project folder itself, or a project.db alone. Nothing is uploaded: the files are read in this tab.
   */
  import { tr } from '../../shared/i18n.js'
  import Modal from '../../renderer/src/components/Modal.svelte'
  import { bringIn, finishImport } from '../project/projectUi.js'

  let fileInput, folderInput
  let busy = false
  let error = ''
  let over = false

  async function take(list) {
    if (!list?.length || busy) return
    busy = true
    error = ''
    try {
      const placed = await bringIn(list)
      if (placed) finishImport(placed.path)
    } catch (err) {
      error = err.message
    } finally {
      busy = false
      if (fileInput) fileInput.value = ''
      if (folderInput) folderInput.value = ''
    }
  }

  function drop(e) {
    e.preventDefault()
    over = false
    take(e.dataTransfer?.files)
  }
</script>

<Modal title={tr('web.import.title')} width={520} on:close={() => !busy && finishImport(null)}>
  <div class="zone" class:over on:dragover|preventDefault={() => (over = true)} on:dragleave={() => (over = false)} on:drop={drop} role="group" aria-label={tr('web.import.title')}>
    <p>{tr('web.import.intro')}</p>
    <div class="choices">
      <button class="primary" on:click={() => fileInput.click()} disabled={busy}>{tr('web.import.chooseFile')}</button>
      <button on:click={() => folderInput.click()} disabled={busy}>{tr('web.import.chooseFolder')}</button>
    </div>
    <p class="dim">{tr('web.import.drop')}</p>
  </div>
  <input bind:this={fileInput} type="file" accept=".zip,.db,application/zip" hidden on:change={e => take(e.target.files)} />
  <input bind:this={folderInput} type="file" webkitdirectory hidden on:change={e => take(e.target.files)} />
  {#if busy}<p role="status">{tr('web.import.reading')}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <p class="dim small">{tr('web.import.privacy')} {tr('web.import.desktopHint')}</p>
  <div class="actions">
    <button on:click={() => finishImport(null)} disabled={busy}>{tr('common.cancel')}</button>
  </div>
</Modal>

<style>
  .zone { border: 2px dashed var(--color-border); border-radius: 10px; padding: 16px; text-align: center; }
  .zone.over { border-color: var(--color-accent); background: var(--color-selected); }
  .zone p { margin: 0 0 12px; }
  .choices { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 12px; }
  .dim { color: var(--color-text-dim); }
  .small { font-size: 12px; margin-top: 12px; }
  .error { color: var(--color-danger-text); }
  .actions { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
