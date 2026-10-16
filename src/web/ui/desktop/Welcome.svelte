<script>
  /**
   * The welcome screen of the web version (WEB-PRD Phase 9), in place of src/renderer/src/components/Welcome.svelte
   * (swapped at build time, webModules.mjs FILES). A tab has no recent projects and no folders: it offers a new
   * project, importing one (or dropping it on the page), and says where the work is kept.
   */
  import { tr } from '../../../shared/i18n.js'
  import { newProject, openProject } from '../../../renderer/src/stores/actions.js'
  import { openDialog } from '../../../renderer/src/stores/ui.js'
</script>

<div class="welcome">
  <div class="logo">{tr('common.spadewick')}</div>
  <p class="tagline">{tr('welcome.localFirstCardGameDesign')}</p>

  <div class="actions">
    <button class="primary-btn" on:click={newProject}>{tr('welcome.newProject')}</button>
    <button on:click={() => openProject(null)}>{tr('welcome.openProject')}</button>
    <button on:click={() => openDialog.set('table-join')}>{tr('tableShare.joinFromWelcome')}</button>
  </div>
  <p class="hint">{tr('web.welcome.drop')}</p>

  <div class="privacy">
    <h2>{tr('web.welcome.privacyTitle')}</h2>
    <p>{tr('web.welcome.privacy')}</p>
  </div>
</div>

<style>
  .welcome {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 40px;
    background: radial-gradient(700px 360px at 50% 38%, color-mix(in srgb, var(--color-accent) 20%, transparent), transparent 70%);
  }
  .logo { font-size: 52px; font-weight: 800; letter-spacing: -2px; color: var(--color-text); padding-bottom: 14px; position: relative; }
  .logo::after {
    content: ''; position: absolute; left: 50%; bottom: 0; width: 64px; height: 5px; margin-left: -32px;
    border-radius: 3px; background: var(--gradient-accent); box-shadow: var(--glow);
  }
  .tagline { color: var(--color-text-dim); font-size: 15px; margin-top: -4px; }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 8px; }
  .actions button { padding: 8px 22px; font-size: 14px; border-radius: var(--radius); }
  .hint { color: var(--color-text-dim); font-size: 13px; margin: 0; }
  .privacy { max-width: 460px; margin-top: 16px; padding: 12px 16px; border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-surface); }
  .privacy h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--color-text-dim); margin: 0 0 6px; }
  .privacy p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--color-text); }
</style>
