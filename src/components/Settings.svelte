<script lang="ts">
  import { protectedColumn, type Board } from '../lib/model';
  import type { Theme } from '../lib/theme';
  import RemoveColumnDialog from './RemoveColumnDialog.svelte';
  import Icon from './Icon.svelte';

  let { theme, board, onremove, onrename, onadd, ontheme, onclose, saveError = '', ondirty }: {
    theme: Theme;
    board: Board;
    onremove: (id: string, destination: string) => boolean;
    onrename: (id: string, name: string) => boolean;
    onadd: (name: string) => boolean;
    ontheme: (theme: Theme) => void;
    onclose: () => void;
    saveError?: string;
    ondirty: (dirty: boolean) => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let newColumn = $state('');
  let columnError = $state('');
  let removing = $state<string | null>(null);
  const nameError = 'Use a unique column name (up to 60 characters).';

  function add(event: SubmitEvent) {
    event.preventDefault();
    if (onadd(newColumn)) { newColumn = ''; columnError = ''; }
    else columnError = nameError;
  }
  function rename(id: string, input: HTMLInputElement) {
    const name = input.value.trim();
    if (onrename(id, name)) { input.value = name; columnError = ''; }
    else {
      columnError = nameError;
      input.value = board.columns.find(column => column.id === id)?.name ?? '';
    }
  }
  function finishName(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      (event.currentTarget as HTMLInputElement).blur();
    }
  }
  $effect(() => ondirty(Boolean(newColumn.trim())));
  $effect(() => { if (dialog && !dialog.open) dialog.showModal(); });
</script>

<dialog bind:this={dialog} class="settings-dialog" aria-labelledby="settings-title" onclose={onclose}>
  <div class="settings-heading">
    <h2 id="settings-title">Settings</h2>
    <button class="icon-button" aria-label="Close settings" onclick={() => dialog.close()}><Icon name="close"/></button>
  </div>
  <label class="settings-row" for="appearance">
    <span>Appearance</span>
    <select id="appearance" value={theme} onchange={(event) => ontheme(event.currentTarget.value as Theme)}>
      <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
    </select>
  </label>
  <h3 class="columns-heading">Board columns</h3>
  <div class="column-settings">
    {#each board.columns as column (column.id)}
      <div class="column-setting">
        <input aria-label={`Rename ${column.name} column`} maxlength="60" value={column.name}
          oninput={() => columnError = ''} onkeydown={finishName} onblur={(event) => rename(column.id, event.currentTarget)}/>
        {#if column.id === board.completedColumnId}<small>Completed work</small>{/if}
        <button class="icon-button remove-column" disabled={protectedColumn(board, column.id)}
          title={protectedColumn(board, column.id) ? 'Core column — cannot be removed' : 'Remove column'}
          aria-label={`Remove ${column.name} column`} onclick={() => removing = column.id}><Icon name="trash" size={15}/></button>
      </div>
    {/each}
  </div>
  <form class="column-add" onsubmit={add}>
    <input aria-label="New column name" placeholder="New column name…" maxlength="60" bind:value={newColumn}/>
    <button type="submit" disabled={!newColumn.trim()}>Add column</button>
  </form>
  <p class="settings-help">Columns apply across projects and Today. New columns appear before completed work.</p>
  {#if saveError || columnError}<p class="column-error" role="alert">{saveError || columnError}</p>{/if}
</dialog>

{#if removing}
  <RemoveColumnDialog {board} {saveError} columnId={removing} {onremove} onclose={() => removing = null}/>
{/if}
