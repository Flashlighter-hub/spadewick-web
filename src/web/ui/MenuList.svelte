<script>
  /**
   * One open menu of the menu bar (WEB-PRD Phase 9), and its submenus (drawn by itself). The keys of a menu: Up and
   * Down move, Home and End go to the ends, Right opens a submenu (or, at the top level, the next menu of the bar),
   * Left closes a submenu (or opens the previous menu of the bar), Enter or Space chooses, Escape closes.
   */
  import { onMount, tick, createEventDispatcher } from 'svelte'
  import { isEnabled } from './menu.js'
  import { keysLabel, ariaKeys } from './keys.js'

  export let items = []
  export let state = {}            // the project state: what needs a project is disabled without one
  export let label = ''
  export let level = 0
  export let focusFirst = true

  const dispatch = createEventDispatcher()
  let list
  let openSub = -1                 // index of the item whose submenu is open
  let subFocus = true

  const buttons = () => [...(list?.querySelectorAll(':scope > li > button:not([disabled])') ?? [])]

  onMount(async () => { await tick(); if (focusFirst) buttons()[0]?.focus() })

  async function openSubmenu(i, focus) {
    openSub = i
    subFocus = focus
    await tick()
  }

  function choose(item, i) {
    if (item.submenu) { openSubmenu(i, true); return }
    dispatch('choose', item)
  }

  function key(e) {
    const all = buttons(), at = all.indexOf(document.activeElement)
    if (at < 0) return               // the key is for a submenu: it handles it
    const item = items[Number(document.activeElement.dataset.index)]
    if (e.key === 'ArrowDown') { e.preventDefault(); all[(at + 1) % all.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); all[(at - 1 + all.length) % all.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); all[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); all[all.length - 1]?.focus() }
    else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (item?.submenu) openSubmenu(Number(document.activeElement.dataset.index), true)
      else dispatch('move', 1)
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); if (level > 0) dispatch('back'); else dispatch('move', -1) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (level > 0) dispatch('back'); else dispatch('close') }
    else if (e.key === 'Tab') dispatch('close', { keepFocus: true })
    else return
    e.stopPropagation()
  }

  /** A submenu closed with Left or Escape: back to its item. */
  function backFrom(i) {
    openSub = -1
    list?.querySelector(`:scope > li > button[data-index="${i}"]`)?.focus()
  }
</script>

<!-- the list handles the arrow keys, Home, End, Enter and Escape for the items inside it -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<ul class="menu" class:sub={level > 0} role="menu" aria-label={label} bind:this={list} on:keydown={key}>
  {#each items as item, i}
    {#if item.type === 'separator'}
      <li role="separator" class="sep"></li>
    {:else}
      {@const on = isEnabled(item, state)}
      <li role="none" class="entry">
        <button role="menuitem" data-index={i} disabled={!on}
          aria-haspopup={item.submenu ? 'menu' : undefined} aria-expanded={item.submenu ? openSub === i : undefined}
          aria-keyshortcuts={item.accelerator ? ariaKeys(item.accelerator) : undefined}
          on:click={() => choose(item, i)}
          on:pointerenter={() => { if (item.submenu && on) openSubmenu(i, false); else if (openSub !== -1) openSub = -1 }}>
          <span class="text">{item.label()}</span>
          {#if item.accelerator}<span class="keys" aria-hidden="true">{keysLabel(item.accelerator)}</span>{/if}
          {#if item.submenu}<span class="more" aria-hidden="true">▸</span>{/if}
        </button>
        {#if item.submenu && openSub === i}
          <svelte:self items={item.submenu} {state} label={item.label()} level={level + 1} focusFirst={subFocus}
            on:choose on:close on:move on:back={() => backFrom(i)} />
        {/if}
      </li>
    {/if}
  {/each}
</ul>

<style>
  .menu {
    position: absolute; z-index: 60; top: 100%; left: 0; margin: 2px 0 0; min-width: 240px; list-style: none; padding: 4px;
    background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--radius, 6px);
    box-shadow: 0 6px 24px rgba(0, 0, 0, .35);
  }
  .menu.sub { top: -5px; left: 100%; margin: 0 0 0 2px; }
  .entry { position: relative; }
  .sep { height: 1px; margin: 4px 6px; background: var(--color-border); }
  button {
    width: 100%; display: flex; align-items: center; gap: 16px; text-align: left; background: none; border: none; border-radius: 4px;
    padding: 6px 10px; color: inherit; font: inherit; cursor: default;
  }
  button:hover:not(:disabled), button:focus-visible, button[aria-expanded='true'] { background: var(--color-accent); color: var(--color-on-accent); outline: none; }
  button:disabled { opacity: .45; }
  .text { flex: 1; white-space: nowrap; }
  .keys { color: inherit; opacity: .7; font-size: 12px; white-space: nowrap; }
  .more { opacity: .7; }
</style>
