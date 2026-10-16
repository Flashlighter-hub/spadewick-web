<script>
  /**
   * The menu bar of the web version (WEB-PRD Phase 9): the desktop's menu (menu.js), drawn in the page. A click opens a
   * menu; while one is open, pointing at another opens that one. Keys on the bar: Left and Right move, Down, Enter or
   * Space open, Escape closes. F10 or Alt alone does not reach it (the browser keeps them); Tab does.
   */
  import { tick } from 'svelte'
  import { MENU, sendMenu } from './menu.js'
  import MenuList from './MenuList.svelte'
  import { tr } from '../../shared/i18n.js'

  export let state = {}

  let open = -1
  let current = 0                  // the menu Tab reaches (the one last focused)
  let focusFirst = true
  let bar

  const tops = () => [...(bar?.querySelectorAll(':scope > li > button') ?? [])]

  async function show(i, focus = true) {
    open = i
    focusFirst = focus
    await tick()
  }
  function hide({ keepFocus = false } = {}) {
    const was = open
    open = -1
    if (!keepFocus && was >= 0) tops()[was]?.focus()
  }

  function topKey(e, i) {
    const n = MENU.length
    if (e.key === 'ArrowRight') { e.preventDefault(); const j = (i + 1) % n; if (open >= 0) show(j); else tops()[j]?.focus() }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); const j = (i - 1 + n) % n; if (open >= 0) show(j); else tops()[j]?.focus() }
    else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(i) }
    else if (e.key === 'Escape' && open >= 0) { e.preventDefault(); hide() }
  }

  function choose(item) {
    open = -1
    sendMenu(item)
  }

  function move(step) {
    const j = (open + step + MENU.length) % MENU.length
    show(j)
  }

  function outside(e) { if (open >= 0 && !bar?.contains(e.target)) open = -1 }
</script>

<svelte:window on:pointerdown={outside} />

<ul class="menubar" role="menubar" aria-label={tr('web.menu.label')} bind:this={bar}>
  {#each MENU as menu, i}
    <li role="none" class="top">
      <button role="menuitem" aria-haspopup="menu" aria-expanded={open === i} tabindex={i === current ? 0 : -1} on:focus={() => (current = i)}
        on:click={() => (open === i ? hide({ keepFocus: true }) : show(i, false))}
        on:pointerenter={() => { if (open >= 0 && open !== i) show(i, false) }}
        on:keydown={e => topKey(e, i)}>{menu.label()}</button>
      {#if open === i}
        <MenuList items={menu.submenu} {state} label={menu.label()} {focusFirst}
          on:choose={e => choose(e.detail)} on:close={e => hide(e.detail ?? {})} on:move={e => move(e.detail)} />
      {/if}
    </li>
  {/each}
</ul>

<style>
  .menubar { display: flex; gap: 2px; list-style: none; margin: 0; padding: 0; }
  .top { position: relative; }
  .top > button {
    background: transparent; border: 1px solid transparent; color: inherit;
    padding: 4px 10px; border-radius: 6px; cursor: default; font: inherit;
  }
  .top > button:hover, .top > button[aria-expanded='true'] { background: var(--color-surface-hover); }
  .top > button:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
</style>
