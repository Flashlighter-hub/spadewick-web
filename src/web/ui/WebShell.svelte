<script>
  /**
   * What the web version adds around the desktop interface (WEB-PRD Phase 3; the menu bar of Phase 9 grows from it):
   * a bar above the app with the project's commands and whether it has unexported changes, and the web dialogs
   * (import, export, and the click a browser needs before a file picker, Phase 4).
   */
  import WebBar from './WebBar.svelte'
  import ImportDialog from './ImportDialog.svelte'
  import ExportDialog from './ExportDialog.svelte'
  import PickDialog from './PickDialog.svelte'
  import { webDialog } from '../project/projectUi.js'
  import { pickRequest } from '../files/picker.js'
</script>

<WebBar />
{#if $webDialog === 'import'}<ImportDialog />{/if}
{#if $webDialog === 'export'}<ExportDialog />{/if}
{#if $pickRequest}<PickDialog request={$pickRequest} />{/if}
