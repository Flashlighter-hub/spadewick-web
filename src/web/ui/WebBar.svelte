<script>
  import { onDestroy } from 'svelte'
  import { tr } from '../../shared/i18n.js'
  import { projectState, webDialog } from '../project/projectUi.js'
  import MenuBar from './MenuBar.svelte'

  // the time since the last export, kept current
  let now = Date.now()
  const timer = setInterval(() => (now = Date.now()), 20_000)
  onDestroy(() => clearInterval(timer))

  function since(t) {
    const min = Math.round((now - t) / 60000)
    return min < 1 ? tr('web.bar.justNow') : tr('web.bar.minutesAgo', { n: min })
  }

  $: s = $projectState
  $: status = !s.open ? tr('web.bar.noProject')
    : !s.dirty ? (s.exportedAt ? tr('web.bar.exported', { when: since(s.exportedAt) }) : tr('web.bar.asImported'))
    : s.exportedAt ? tr('web.bar.changedSince', { when: since(s.exportedAt) })
    : s.importedAt ? tr('web.bar.changedSinceImport')
    : tr('web.bar.notExported')
</script>

<header class="web-bar" aria-label={tr('web.bar.label')}>
  <span class="brand" aria-hidden="true">♠</span>
  <MenuBar state={s} />
  <span class="status" class:warn={s.open && s.dirty} role="status" aria-live="polite" title={s.open && s.dirty ? tr('web.bar.dirtyHint') : ''}>{status}</span>
  <!-- exporting is how work is kept: it stays one click away, with its state beside it -->
  <button class="export" on:click={() => webDialog.set('export')} disabled={!s.open} title={tr('web.bar.exportHint')}>{tr('web.bar.export')}</button>
</header>

<style>
  .web-bar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 50;
    height: var(--web-bar-height); box-sizing: border-box;
    display: flex; align-items: center; gap: 12px; padding: 0 12px;
    background: var(--color-surface); color: var(--color-text);
    border-bottom: 1px solid var(--color-border);
    font: 13px/1 var(--font-ui, system-ui, sans-serif);
  }
  .brand { font-size: 16px; color: var(--color-accent-text); }
  .export {
    background: transparent; border: 1px solid var(--color-border); color: inherit;
    padding: 3px 12px; border-radius: 6px; cursor: pointer; font: inherit;
  }
  .export:hover:not(:disabled) { background: var(--color-surface-hover); }
  .export:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
  .export:disabled { opacity: .45; cursor: default; }
  .status { margin-left: auto; color: var(--color-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status.warn { color: var(--color-warning-text); }
</style>
