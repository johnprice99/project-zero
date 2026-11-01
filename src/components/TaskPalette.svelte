<script lang="ts">
  import { tick } from 'svelte';
  import { findCommands, type Command } from '../lib/commands';
  import Icon from './Icon.svelte';
  let { commands, onclose, onrun }: { commands: Command[]; onclose: () => void; onrun: (run: () => void) => void } = $props();
  let dialog: HTMLDialogElement;
  let input: HTMLInputElement;
  let list: HTMLDivElement;
  let query = $state('');
  let cursor = $state(0);
  let path = $state<{ label: string; commands: Command[] }[]>([]);
  let matches = $derived(findCommands(path.at(-1)?.commands ?? commands, query));
  let active = $derived(Math.min(cursor, Math.max(0, matches.length - 1)));
  $effect(() => { if (dialog && !dialog.open) { dialog.showModal(); input.focus(); } });
  $effect(() => { const selected = active; const count = matches.length; void tick().then(() => { if (count) list?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' }); }); });
  function back() { path = path.slice(0, -1); query = ''; cursor = 0; input.focus(); }
  function choose(command: Command) {
    if (command.children?.length) { path = [...path, { label: command.label.replace(/…$/, ''), commands: command.children }]; query = ''; cursor = 0; input.focus(); }
    else if (command.run) onrun(command.run);
  }
  function key(e: KeyboardEvent) {
    if (e.isComposing) return;
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowDown' && matches.length) cursor = (active + 1) % matches.length;
    if (e.key === 'ArrowUp' && matches.length) cursor = (active - 1 + matches.length) % matches.length;
    if (e.key === 'Enter' && matches[active]) choose(matches[active].command);
    if (e.key === 'Escape') { e.stopPropagation(); if (path.length) back(); else dialog.close(); }
    if (e.key === 'Backspace' && !query && path.length) { e.preventDefault(); back(); }
  }
</script>
<dialog bind:this={dialog} class="command-dialog" aria-label="Command palette" onclose={onclose}>
  <div class="command-search">{#if path.length}<button class="icon-button" aria-label="Back to commands" onclick={back}>←</button>{:else}<Icon name="search" size={18}/>{/if}<input bind:this={input} role="combobox" aria-label="Search commands" aria-expanded="true" aria-autocomplete="list" aria-controls="command-results" aria-activedescendant={matches.length ? `command-result-${active}` : undefined} placeholder={path.at(-1)?.label ?? 'What would you like to do?'} bind:value={query} oninput={() => cursor = 0} onkeydown={key}/><button class="icon-button" aria-label="Close command palette" onclick={() => dialog.close()}><Icon name="close" size={16}/></button></div>
  {#if path.length}<div class="command-breadcrumb">{path.map(p => p.label).join(' / ')}</div>{/if}
  <div class="command-results" id="command-results" role="listbox" aria-label="Commands" bind:this={list}>
    {#each matches as result, index (result.command.id)}
      {#if index === 0 || result.command.group !== matches[index - 1].command.group}<div class="command-group" role="presentation">{result.command.group ?? (path.at(-1)?.label || 'Actions')}</div>{/if}
      <button class="command-option" role="option" id={`command-result-${index}`} data-index={index} aria-selected={index === active} tabindex="-1" onmousedown={(e) => e.preventDefault()} onclick={() => choose(result.command)}><span class="command-option-text"><span>{result.command.label}</span>{#if result.path || result.command.detail}<small>{[result.path, result.command.detail].filter(Boolean).join(' · ')}</small>{/if}</span>{#if result.command.children?.length}<Icon name="chevron" size={14}/>{:else}<span class="command-enter">↵</span>{/if}</button>
    {/each}
    {#if !matches.length}<p class="command-empty">No matching commands.</p>{/if}
  </div>
  <div class="command-help"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> select</span><span><kbd>Esc</kbd> {path.length ? 'back' : 'close'}</span></div>
</dialog>
