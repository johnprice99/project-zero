<script lang="ts">
  import { untrack } from 'svelte';
  import Icon from './Icon.svelte';
  let { title, initial, onsave, onclose, saveError = '', ondirty }: { title: string; initial: string; onsave: (name: string) => boolean; onclose: () => void; saveError?: string; ondirty: (dirty: boolean) => void } = $props();
  let name = $state(untrack(() => initial));
  let error = $state('');
  let dialog: HTMLDialogElement;
  let input: HTMLInputElement;
  $effect(() => ondirty(name !== initial));
  $effect(() => { if (dialog && !dialog.open) { dialog.showModal(); input.focus(); input.select(); } });
</script>
<dialog bind:this={dialog} class="project-dialog" aria-labelledby="text-prompt-title" onclose={onclose}>
  <div class="settings-heading"><h2 id="text-prompt-title">{title}</h2><button class="icon-button" aria-label="Close column dialog" onclick={() => dialog.close()}><Icon name="close"/></button></div>
  <form onsubmit={(e) => { e.preventDefault(); if (onsave(name)) dialog.close(); else error = 'Use a unique name (up to 60 characters).'; }}><label class="notes-label" for="column-name">Column name</label><input id="column-name" class="notes-input" bind:this={input} bind:value={name} maxlength="60"/>{#if saveError || error}<p role="alert" class="column-error">{saveError || error}</p>{/if}<div class="dialog-actions"><button type="button" onclick={() => dialog.close()}>Cancel</button><button type="submit" class="create-task" disabled={!name.trim()}>Save column</button></div></form>
</dialog>
