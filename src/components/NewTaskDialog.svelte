<script lang="ts">
  import { untrack } from 'svelte';
  import type { Project } from '../lib/model';
  import Icon from './Icon.svelte';
  let { projects, initialProject, today, onadd, onclose, saveError = '', ondirty }: { projects: Project[]; initialProject: string; today: boolean; onadd: (title: string, projectId: string) => boolean; onclose: () => void; saveError?: string; ondirty: (dirty: boolean) => void } = $props();
  let dialog: HTMLDialogElement;
  let input: HTMLInputElement;
  let title = $state('');
  let projectId = $state(untrack(() => initialProject));
  $effect(() => ondirty(Boolean(title.trim())));
  $effect(() => { if (dialog && !dialog.open) { dialog.showModal(); input.focus(); } });
  function submit(e: SubmitEvent) { e.preventDefault(); if (onadd(title, projectId)) dialog.close(); }
</script>
<dialog bind:this={dialog} class="new-task-dialog" aria-labelledby="new-task-heading" onclose={onclose}>
  <div class="settings-heading"><h2 id="new-task-heading">New task</h2><button class="icon-button" aria-label="Close new task" onclick={() => dialog.close()}><Icon name="close"/></button></div>
  <form onsubmit={submit}><label class="notes-label" for="new-task-title">Title</label><input id="new-task-title" class="notes-input" bind:this={input} placeholder="What needs to be done?" maxlength="300" bind:value={title}/><label class="notes-label" for="new-task-project">Project</label><select id="new-task-project" class="form-select" bind:value={projectId}>{#each projects as project}<option value={project.id}>{project.name}</option>{/each}</select>{#if today}<p class="settings-help">Added to today's work.</p>{/if}{#if saveError}<p class="column-error" role="alert">{saveError}</p>{/if}<div class="dialog-actions"><button type="button" onclick={() => dialog.close()}>Cancel</button><button class="create-task" type="submit" disabled={!title.trim()}>Create task</button></div></form>
</dialog>
