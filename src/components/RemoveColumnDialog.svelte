<script lang="ts">
  import { untrack } from 'svelte';
  import type { Board } from '../lib/model';
  import Icon from './Icon.svelte';
  let { board, columnId, onremove, onclose, saveError = '' }: { board: Board; columnId: string; onremove: (id: string, destination: string) => boolean; onclose: () => void; saveError?: string } = $props();
  let destination = $state(untrack(() => board.columns.find(c => c.id !== columnId)!.id));
  let dialog: HTMLDialogElement;
  let select: HTMLSelectElement;
  $effect(() => { if (dialog && !dialog.open) { dialog.showModal(); select.focus(); } });
</script>
<dialog bind:this={dialog} class="project-dialog" aria-labelledby="remove-column-title" onclose={onclose}>
  <div class="settings-heading"><h2 id="remove-column-title">Remove column</h2><button class="icon-button" aria-label="Close column removal" onclick={() => dialog.close()}><Icon name="close"/></button></div>
  <p class="settings-help">Choose where to move the tasks in “{board.columns.find(c => c.id === columnId)?.name}”.</p>
  <label class="notes-label" for="column-destination">Move tasks to</label><select bind:this={select} id="column-destination" class="form-select" bind:value={destination}>{#each board.columns.filter(c => c.id !== columnId) as column}<option value={column.id}>{column.name}</option>{/each}</select>
  {#if saveError}<p class="column-error" role="alert">{saveError}</p>{/if}
  <div class="dialog-actions"><button onclick={() => dialog.close()}>Cancel</button><button class="danger-button" onclick={() => { if (onremove(columnId, destination)) dialog.close(); }}>Remove column</button></div>
</dialog>
