<script>
  /** Asks for the click a browser needs before it shows a file picker (WEB-PRD Phase 4, see files/picker.js). */
  import { tr } from '../../shared/i18n.js'
  import Modal from '../../renderer/src/components/Modal.svelte'
  import { openPicker, cancelPick } from '../files/picker.js'

  export let request
</script>

<Modal title={request.title || tr(request.folder ? 'web.pick.folderTitle' : 'web.pick.title')} width={440} on:close={() => cancelPick(request)}>
  <p>{tr(request.folder ? 'web.pick.folderText' : request.multiple ? 'web.pick.filesText' : 'web.pick.text')}</p>
  {#if request.hint === 'siblings'}<p class="dim">{tr('web.pick.siblings')}</p>{/if}
  <p class="dim">{tr('web.pick.privacy')}</p>
  <div class="actions">
    <button on:click={() => cancelPick(request)}>{tr('common.cancel')}</button>
    <button class="primary" on:click={() => openPicker(request)}>{tr(request.folder ? 'web.pick.chooseFolder' : 'web.pick.choose')}</button>
  </div>
</Modal>

<style>
  .dim { color: var(--color-text-dim); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>
