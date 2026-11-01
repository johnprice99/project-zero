<script lang="ts">
  import { lane, projectColor, type Board, type Status, type View } from '../lib/model';
  import TaskCard from './TaskCard.svelte';
  import Icon from './Icon.svelte';
  let { board, view, projectId, onopen, ontoday, ondelete, oncollapse, onmove }:
    { board: Board; view: View; projectId: string | null; ondelete: (id: string) => void; oncollapse: (ids: string[]) => void; onopen: (id: string) => void; ontoday: (id: string) => void; onmove: (id: string, status: Status, project?: string, before?: string) => void } = $props();
  let collapsed = $derived(board.collapsedProjects);
  let dragging = $state<string | null>(null);
  let over = $state('');
  // Every project has its row, even with no tasks yet, so a card can be dragged into it.
  let projects = $derived(board.projects.filter(p => !projectId || p.id === projectId));
  let groups = $derived(view === 'today' ? [{ id: 'today', name: 'Today', color: 'iris' }] : projects);
  function tasks(status: Status, group: string) {
    return lane(board, view, status, view === 'all' ? group : undefined)
      .filter(t => !projectId || t.projectId === projectId);
  }
  function start(event: DragEvent, id: string) { dragging = id; if (event.dataTransfer) { event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move'; } }
  function end() { dragging = null; over = ''; }
  function drop(event: DragEvent, status: Status, group: string, before?: string) {
    event.preventDefault(); event.stopPropagation();
    const id = dragging;
    if (id) onmove(id, status, view === 'all' ? group : undefined, before);
    end();
  }
  function dragover(event: DragEvent, target: string) { if (!dragging) return; event.preventDefault(); event.stopPropagation(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; over = target; }
</script>
<div class="board-scroll">
  <div class="board" style={`--column-count: ${board.columns.length}`}>
    <div class="column-headings">
      {#each board.columns as column (column.id)}<div class="column-heading"><h2>{column.name}</h2></div>{/each}
    </div>
    {#each groups as group}
      <section class="swimlane" class:lane-collapsed={!projectId && collapsed.includes(group.id)} aria-label={view === 'all' ? group.name : 'Today board'}>
        {#if view === 'all' && !projectId}
          <button class="lane-heading" style={`--project-color: ${projectColor(group.color)}`} aria-expanded={!collapsed.includes(group.id)} onclick={() => oncollapse(collapsed.includes(group.id) ? collapsed.filter(id => id !== group.id) : [...collapsed, group.id])}>
            <span class:expanded={!collapsed.includes(group.id)} class="lane-chevron"><Icon name="chevron" size={12}/></span><span class="project-dot" style={`background: ${projectColor(group.color)}`}></span><h3>{group.name}</h3>
          </button>
        {/if}
        {#if projectId || !collapsed.includes(group.id)}
          <div class="lane-columns" class:today-columns={view === 'today'}>
            {#each board.columns as column (column.id)}
              {@const status = column.id}
              <!-- Status and priority are changed by dragging the card. -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="task-column" class:drop-active={over === `${group.id}-${status}`} ondragover={(e) => dragover(e, `${group.id}-${status}`)} ondrop={(e) => drop(e, status, group.id)}>
                {#each tasks(status, group.id) as task (task.id)}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="card-slot" class:drop-before={over === task.id && dragging !== task.id} class:being-dragged={dragging === task.id} ondragover={(e) => dragover(e, task.id)} ondrop={(e) => drop(e, status, group.id, task.id)}>
                    <TaskCard {task} completed={task.status === board.completedColumnId} ondelete={() => ondelete(task.id)} project={board.projects.find(p => p.id === task.projectId)!} showProject={view === 'today'} onopen={() => onopen(task.id)} ontoday={() => ontoday(task.id)} ondrag={(e) => start(e, task.id)} ondragend={end}/>
                  </div>
                {/each}

              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>
</div>
