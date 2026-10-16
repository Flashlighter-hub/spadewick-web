<script>
  /**
   * Preferences in the web version (WEB-PRD Phase 9, §5.3), in place of src/renderer/src/components/PreferencesDialog.svelte.
   * Gone: the projects folder and the autosave interval (a tab has neither). Added: forgetting what this browser
   * remembers. The preferences are kept in this browser only, and contain nothing from a project.
   */
  import { tr } from '../../../shared/i18n.js'
  import { createEventDispatcher, onMount } from 'svelte'
  import Modal from '../../../renderer/src/components/Modal.svelte'
  import { resetLayout, setLayout, PREVIEW_WIDTH } from '../../../renderer/src/stores/layout.js'
  import { previewSize, toast } from '../../../renderer/src/stores/ui.js'
  import { forgetSettings } from '../../bridge/worker.js'

  export let applyTheme = () => {}
  const dispatch = createEventDispatcher()
  let s = null

  onMount(async () => { s = await window.spadewick.settings.getAll() })

  async function set(key, value) {
    await window.spadewick.settings.set(key, value)
    s = { ...s, [key]: value }
    if (key === 'theme') applyTheme(value)
    if (key === 'preview_size') { previewSize.set(value); setLayout('preview', PREVIEW_WIDTH[value] ?? PREVIEW_WIDTH.medium) }
  }
  const num = (key, min) => e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= min) set(key, n) }

  function forget() {
    forgetSettings()
    toast(tr('web.preferences.forgotten'), 'info', 6000)
  }
</script>

<Modal title="{tr('preferencesDialog.preferences')}" width={520} on:close>
  {#if s}
    <label class="row">{tr('preferencesDialog.theme')}
      <select value={s.theme} on:change={e => set('theme', e.target.value)}>
        <option value="system">{tr('preferencesDialog.system')}</option><option value="light">{tr('preferencesDialog.light')}</option><option value="dark">{tr('preferencesDialog.dark')}</option>
      </select>
    </label>
    <label class="row">{tr('preferencesDialog.cardPreviewSize')}
      <select value={s.preview_size} on:change={e => set('preview_size', e.target.value)}>
        <option value="small">{tr('common.small')}</option><option value="medium">{tr('common.medium')}</option><option value="large">{tr('common.large')}</option>
      </select>
    </label>
    <label class="row">{tr('preferencesDialog.undoLimit')} <input type="number" min="10" value={s.undo_limit} on:change={num('undo_limit', 10)} /><span class="dim">{tr('preferencesDialog.appliesAfterRestart')}</span></label>
    <label class="row">{tr('preferencesDialog.defaultExportDpi')}
      <select value={s.default_export_dpi} on:change={e => set('default_export_dpi', Number(e.target.value))}>
        <option value={150}>150</option><option value={300}>300</option><option value={600}>600</option>
      </select>
    </label>
    <div class="row">{tr('preferencesDialog.panelLayout')} <span class="dim grow">{tr('preferencesDialog.panelLayoutHelp')}</span><button on:click={() => { resetLayout(); toast(tr('preferencesDialog.layoutReset'), 'info', 2000) }}>{tr('preferencesDialog.resetLayout')}</button></div>
    <div class="row forget">
      <span class="grow wrap">{tr('web.preferences.remembered')}</span>
      <button on:click={forget}>{tr('web.preferences.forget')}</button>
    </div>
  {/if}
  <svelte:fragment slot="footer"><button on:click={() => dispatch('close')}>{tr('common.close')}</button></svelte:fragment>
</Modal>

<style>
  .row { display: flex; align-items: center; gap: 8px; }
  .row select, .row input[type='number'] { margin-left: auto; }
  .grow { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wrap { white-space: normal; font-size: 12px; color: var(--color-text-dim); }
  .forget { margin-top: 8px; padding-top: 10px; border-top: 1px solid var(--color-border); }
  .dim { color: var(--color-text-dim); font-size: 11px; }
</style>
