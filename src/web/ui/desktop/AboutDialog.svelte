<script>
  /**
   * About, in the web version (WEB-PRD Phase 9), in place of src/renderer/src/components/AboutDialog.svelte: the
   * version, where it runs, and the licences of what it is made with.
   */
  import { tr } from '../../../shared/i18n.js'
  import { createEventDispatcher } from 'svelte'
  import Modal from '../../../renderer/src/components/Modal.svelte'
  import { VERSION } from '../../config.js'
  const dispatch = createEventDispatcher()
</script>

<Modal title="{tr('aboutDialog.aboutSpadewick')}" width={420} on:close>
  <p><strong>{tr('common.spadewick')}</strong> {tr('aboutDialog.localFirstGameAgnosticCard')}</p>
  <p class="dim">{tr('web.about.version', { version: VERSION })}</p>
  <p>{tr('aboutDialog.offlineAndPortableAllProjects')}</p>
  <p><a href="/licenses.html" target="_blank" rel="noopener">{tr('web.about.licences')}</a></p>
  <svelte:fragment slot="footer"><button on:click={() => dispatch('close')}>{tr('common.close')}</button></svelte:fragment>
</Modal>

<style>.dim { color: var(--color-text-dim); }</style>
