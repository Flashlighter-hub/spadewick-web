<script>
  /**
   * The status bar of the web version (WEB-PRD Phase 9), in place of src/renderer/src/components/StatusBar.svelte. The
   * desktop shows when the project was last saved to its folder; a tab has no folder, so the bar says whether the
   * project has changes that are not exported yet (the same words as the bar on top).
   */
  import { tr } from '../../../shared/i18n.js'
  import { project, activeSet, cardCount } from '../../../renderer/src/stores/project.js'
  import { projectState } from '../../project/projectUi.js'

  $: s = $projectState
  $: state = !s.open ? '' : s.dirty ? tr('web.status.notExported') : tr('web.status.exported')
</script>

<div class="status-bar" role="region" aria-label="{tr('statusBar.statusBar')}">
  <span class="seg project-name">
    {#if $project}
      {$project.meta?.name ?? tr('statusBar.untitledProject')}
    {:else}{tr('statusBar.noProject')}{/if}
  </span>

  {#if $activeSet}
    <span class="sep">·</span>
    <span class="seg">{$activeSet.name}</span>
    <span class="sep">·</span>
    <span class="seg">{tr('statusBar.cards', { n: $cardCount })}</span>
  {/if}

  <span class="spacer" />

  <span class="seg save-status" class:warn={s.open && s.dirty}>{state}</span>
</div>

<style>
  .status-bar {
    height: var(--statusbar-height);
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    padding: 0 10px;
    font-size: 11px;
    color: var(--color-text-dim);
    flex-shrink: 0;
    gap: 4px;
  }
  .seg { white-space: nowrap; }
  .project-name { font-weight: 600; color: var(--color-text); }
  .sep { color: var(--color-border); }
  .spacer { flex: 1; }
  .save-status { font-style: italic; }
  .save-status.warn { color: var(--color-warning-text); }
</style>
