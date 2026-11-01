<script lang="ts">
  import { untrack } from 'svelte';
  import { limits, type Task, type TaskPatch } from '../lib/model';
  import Icon from './Icon.svelte';
  let { task, completed, ondelete, onclose, onsave, saveError = '', ondirty }: {
    task: Task; completed: boolean; ondelete: () => void; onclose: () => void;
    onsave: (patch: TaskPatch) => Promise<boolean>;
    saveError?: string; ondirty: (dirty: boolean) => void;
  } = $props();
  let title = $state(untrack(() => task.title));
  let notes = $state(untrack(() => task.notes));
  let blocked = $state(untrack(() => task.blocked));
  $effect(() => ondirty(title !== task.title || notes !== task.notes || blocked !== task.blocked));
  let dialog: HTMLDialogElement;
  let titleInput: HTMLTextAreaElement;
  $effect(() => { if (dialog && !dialog.open) { dialog.showModal(); titleInput.focus(); titleInput.select(); } });
  let saving = false;
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    saving = true;
    const submitted = { title: title.trim(), notes, blocked };
    try {
      // Edits made while saving stay open (and unsaved) rather than being discarded.
      const unchanged = () => title.trim() === submitted.title && notes === submitted.notes && blocked === submitted.blocked;
      if ((await onsave(submitted)) && unchanged()) dialog.close();
    } finally { saving = false; }
  }
</script>
<dialog bind:this={dialog} class="task-dialog" aria-label="Edit task" onclose={onclose}>
  <div class="editor-top"><span>Edit task</span><button class="icon-button" aria-label="Close task details" onclick={() => dialog.close()}><Icon name="close"/></button></div>
  <form onsubmit={save}>
    <label class="notes-label" for="task-title">Title</label>
    <textarea bind:this={titleInput} id="task-title" class="notes-input title-input" rows="2" maxlength={limits.taskTitle} bind:value={title}></textarea>
    <label class="notes-label" for="task-description">Description</label>
    <textarea id="task-description" class="notes-input" placeholder="Add a description…" rows="6" bind:value={notes}></textarea>
    <div class="blocker-control"><label class="blocker-toggle"><input type="checkbox" bind:checked={blocked} disabled={completed}/>Blocked</label></div>
    {#if saveError}<p class="column-error" role="alert">{saveError}</p>{/if}
    <div class="editor-actions">
      <button type="button" class="danger-button" onclick={ondelete}><Icon name="trash" size={16}/>Delete task</button>
      <button type="submit" class="create-task" disabled={!title.trim()}>Save</button>
    </div>
  </form>
</dialog>
