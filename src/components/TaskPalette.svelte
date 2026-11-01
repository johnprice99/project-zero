<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { filterCommands, orderByRecent, type Command, type PalettePrompt } from '../lib/commands';
  let { commands, prompt = null, recent = [], onrun, onchoose, onclose }: {
    commands: Command[]; prompt?: PalettePrompt | null; recent?: string[];
    onrun: (run: () => unknown) => void; onchoose: (id: string) => void; onclose: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let input: HTMLInputElement;
  let list = $state<HTMLDivElement>();
  let query = $state(untrack(() => prompt?.value ?? ''));
  let cursor = $state(0);
  let nested = $state<{ placeholder: string; items: Command[] } | null>(null);
  let error = $state('');
  let submitting = false;
  let items = $derived(nested ? nested.items : orderByRecent(commands, recent));
  let shown = $derived(prompt ? [] : filterCommands(items, query));
  let active = $derived(Math.min(cursor, Math.max(0, shown.length - 1)));
  $effect(() => { if (dialog && !dialog.open) { dialog.showModal(); input.focus(); if (prompt) input.select(); } });
  $effect(() => { const selected = active; void shown.length; void tick().then(() => list?.children[selected]?.scrollIntoView({ block: 'nearest' })); });

  function choose(index: number) {
    const command = shown[index];
    if (!command) return;
    if (!nested) onchoose(command.id);
    if (command.children?.length) {
      nested = { placeholder: command.placeholder ?? command.label, items: command.children };
      query = '';
      cursor = 0;
    } else if (command.run) onrun(command.run);
  }
  async function submit() {
    const value = query.trim();
    if (!value) { dialog.close(); return; }
    if (submitting || !prompt) return;
    submitting = true;
    try {
      const problem = await prompt.submit(value);
      if (problem) error = problem;
      else dialog.close();
    } finally { submitting = false; }
  }
  function key(e: KeyboardEvent) {
    if (e.isComposing) return;
    const down = e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n');
    const up = e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p');
    if (!prompt && (down || up)) {
      e.preventDefault();
      if (shown.length) cursor = (active + (down ? 1 : -1) + shown.length) % shown.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (prompt) void submit(); else choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      dialog.close();
    }
  }
  // Like Typr, the palette closes when it loses focus or you click outside it.
  // The check for isConnected stops a palette that has already been replaced from closing its successor.
  function blur() { setTimeout(() => { if (dialog?.isConnected && dialog.open && document.activeElement !== input) dialog.close(); }); }
</script>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
<dialog bind:this={dialog} class="command-dialog" aria-label="Command palette" onclose={onclose} onmousedown={(e) => { if (e.target === dialog) dialog.close(); }}>
  <input bind:this={input} role="combobox" aria-label={prompt ? prompt.placeholder : 'Search commands'} aria-expanded={!prompt} aria-autocomplete="list" aria-controls="command-results" aria-activedescendant={shown.length ? `command-result-${active}` : undefined}
    placeholder={prompt?.placeholder ?? nested?.placeholder ?? 'Type a command…'} spellcheck="false" autocomplete="off" bind:value={query} oninput={() => { cursor = 0; error = ''; }} onkeydown={key} onblur={blur}/>
  {#if prompt}
    {#if error}<p class="command-message" role="alert">{error}</p>{/if}
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="command-results" id="command-results" role="listbox" tabindex="-1" aria-label="Commands" bind:this={list} onmousedown={(e) => e.preventDefault()}>
      {#each shown as command, index (command.id)}
        <div class="command-option" class:selected={index === active} role="option" tabindex="-1" id={`command-result-${index}`} aria-selected={index === active} onmousedown={(e) => { e.preventDefault(); choose(index); }}>
          <span class="command-label">{command.label}</span>
          {#if command.detail}<span class="command-detail">{command.detail}</span>{/if}
          {#if command.hint}<span class="command-hint">{command.hint}</span>{/if}
        </div>
      {/each}
    </div>
  {/if}
</dialog>
