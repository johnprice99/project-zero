<script lang="ts">
  import { untrack } from 'svelte';
  import { limits, projectColor, projectColors, type Project } from '../lib/model';
  import Icon from './Icon.svelte';
  let { project, onsave, onclose, saveError = '', ondirty }: { project: Project | null; onsave: (name: string, color: string) => Promise<boolean>; onclose: () => void; saveError?: string; ondirty: (dirty: boolean) => void } = $props();
  let name = $state(untrack(() => project?.name ?? ''));
  let color = $state(untrack(() => project?.color ?? 'iris'));
  let error = $state('');
  let dialog: HTMLDialogElement;
  let input: HTMLInputElement;
  $effect(() => ondirty(name !== (project?.name ?? '') || color !== (project?.color ?? 'iris')));
  $effect(() => { if (dialog && !dialog.open) { dialog.showModal(); input.focus(); input.select(); } });
  let saving = false;
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (saving) return;
    saving = true;
    const submitted = { name, color };
    try {
      // Editing: changes made while saving keep the dialog open. Creating always closes,
      // so a second submit can't create the project twice.
      if (await onsave(submitted.name, submitted.color)) { if (!project || (name === submitted.name && color === submitted.color)) dialog.close(); }
      else error = `Use a unique project name (up to ${limits.projectName} characters).`;
    } finally { saving = false; }
  }
</script>
<dialog bind:this={dialog} class="project-dialog" aria-labelledby="project-dialog-title" onclose={onclose}>
  <div class="settings-heading"><h2 id="project-dialog-title">{project ? 'Edit project' : 'New project'}</h2><button class="icon-button" aria-label="Close project" onclick={() => dialog.close()}><Icon name="close"/></button></div>
  <form onsubmit={submit}><label class="notes-label" for="project-name">Name</label><input id="project-name" class="notes-input" bind:this={input} bind:value={name} maxlength={limits.projectName} placeholder="Project name"/><fieldset class="project-colours"><legend>Colour</legend>{#each projectColors as preset}<button type="button" class="colour-swatch" class:chosen={color === preset.id} style={`--swatch: ${projectColor(preset.id)}`} aria-label={preset.name} aria-pressed={color === preset.id} onclick={() => color = preset.id}>{#if color === preset.id}<Icon name="check" size={14}/>{/if}</button>{/each}<label class="custom-colour">Custom<input type="color" aria-label="Custom project colour" value={color.startsWith('#') ? color : '#7c3aed'} oninput={(e) => color = e.currentTarget.value}/></label></fieldset>{#if saveError || error}<p class="column-error" role="alert">{saveError || error}</p>{/if}<div class="dialog-actions"><button type="button" onclick={() => dialog.close()}>Cancel</button><button class="create-task" type="submit" disabled={!name.trim()}>{project ? 'Save project' : 'Create project'}</button></div></form>
</dialog>
