<script lang="ts">
  import { projectColor, type Task, type Project } from '../lib/model';
  import Icon from './Icon.svelte';
  let { task, completed, project, showProject, onopen, ontoday, ondelete, ondrag, ondragend }:
    { task: Task; completed: boolean; project: Project; showProject: boolean; onopen: () => void; ontoday: () => void; ondelete: () => void; ondrag: (event: DragEvent) => void; ondragend: () => void } = $props();
</script>
<article class="task-card" class:completed class:blocked-card={task.blocked} draggable="true" ondragstart={ondrag} {ondragend} aria-label={task.blocked ? `${task.title} (blocked)` : task.title}>
  <div class="card-header">
    <h3 class="card-title">{task.title}</h3>
    {#if completed}<button class="icon-button danger-button" aria-label={`Delete ${task.title}`} title="Delete task" onclick={ondelete}><Icon name="trash" size={15}/></button>{:else}<button class="icon-button" aria-label={`Edit ${task.title}`} title="Edit task" onclick={onopen}><Icon name="edit" size={15}/></button>{/if}
  </div>
  {#if showProject}<span class="project-label card-project"><span class="project-dot" style={`background: ${projectColor(project.color)}`}></span>{project.name}</span>{/if}
  {#if task.notes}<p class="card-description">{task.notes}</p>{/if}
  <!-- A finished card keeps its Today button while it's in Today, so it can be taken off. -->
  {#if !completed || task.today}<div class="card-footer"><button class="today-toggle" class:selected={task.today} aria-pressed={task.today} aria-label={task.today ? "Remove from today's work" : "Add to today's work"} onclick={ontoday}><Icon name="sun" size={15}/><span>{task.today ? "Remove from today's work" : "Add to today's work"}</span></button></div>{/if}
</article>
