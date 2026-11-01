<script lang="ts">
  import { onMount, tick } from 'svelte';
  import BoardView from './components/Board.svelte';
  import ProjectDialog from './components/ProjectDialog.svelte';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import TaskEditor from './components/TaskEditor.svelte';
  import Icon from './components/Icon.svelte';
  import Settings from './components/Settings.svelte';
  import { bindNativeMenus } from './lib/native';
  import NewTaskDialog from './components/NewTaskDialog.svelte';
  import TextPrompt from './components/TextPrompt.svelte';
  import { readSidebarWidth, writeSidebarWidth, clampSidebarWidth, sidebarRange } from './lib/preferences';
  import { buildCommands } from './lib/command-registry';
  import TaskPalette from './components/TaskPalette.svelte';
  import { emptyBoard, addTask, deleteProject, addColumn, renameColumn, removeColumn, deleteTasks, clearToday, saveProject, projectColor, reorderTask, setCollapsed, moveTask, patchTask, toggleToday, type TaskPatch, type Board, type Status, type View } from './lib/model';
  import { sampleBoard } from './lib/sample';
  import { readBoard, writeBoard, exportBoard } from './lib/storage';
  import { readTheme, applyTheme, type Theme } from './lib/theme';
  let board = $state<Board>(emptyBoard());
  let view = $state<View>('all');
  let projectId = $state<string | null>(null);
  let paletteOpen = $state(false);
  let taskCreationOpen = $state(false);
  let columnPrompt = $state<{ id: string | null } | null>(null);
  let confirmation = $state<{ title: string; message: string; action: string; run: () => void } | null>(null);
  let settingsOpen = $state(false);
  let selectedId = $state<string | null>(null);
  let theme = $state<Theme>(readTheme());
  let saveError = $state('');
  let nativeError = $state('');
  let draftDirty = $state(false);
  let storageBlocked = $state(false);
  let projectDialog = $state<{ id: string | null } | null>(null);
  let ready = $state(false);
  let sidebarWidth = $state(readSidebarWidth());
  let resizingSidebar = $state(false);
  let selected = $derived(board.tasks.find(t => t.id === selectedId));
  onMount(() => {
    applyTheme(theme);
    try { board = readBoard() ?? sampleBoard(); writeBoard(board); }
    catch (e) { saveError = `${e instanceof Error ? e.message : 'Local storage is unavailable.'} Editing is paused to protect your saved draft.`; storageBlocked = true; }
    ready = true;
    const preference = matchMedia('(prefers-color-scheme: dark)');
    const syncAppearance = () => applyTheme(theme);
    preference.addEventListener('change', syncAppearance);
    let disposed = false;
    let cleanupMenus = () => {};
    void bindNativeMenus(openPalette).then(cleanup => { if (disposed) cleanup(); else cleanupMenus = cleanup; }).catch(() => { nativeError = 'Mac menu shortcuts could not be connected. Try Cmd+Shift+P in this window.'; });
    return () => { disposed = true; cleanupMenus(); preference.removeEventListener('change', syncAppearance); };
  });
  $effect(() => { applyTheme(theme); });
  $effect(() => { const width = sidebarWidth; if (!resizingSidebar) { try { writeSidebarWidth(width); } catch { /* Width still applies for this session. */ } } });
  // Publish changes to the UI only after storage accepts them. Dialog drafts stay open on failure.
  function commit(next: Board): boolean {
    if (storageBlocked) return false;
    try {
      writeBoard(next);
      board = next;
      saveError = '';
      return true;
    } catch (error) {
      saveError = error instanceof Error ? error.message : 'Your changes could not be saved. Try again.';
      return false;
    }
  }
  function add(title: string, project: string) {
    if (storageBlocked) return false;
    const next = addTask(board, title, project, view);
    return next !== board && commit(next);
  }
  function saveColumnName(id: string, name: string): boolean {
    const column = board.columns.find(column => column.id === id);
    if (storageBlocked || !column) return false;
    if (column.name === name.trim()) return true;
    const next = renameColumn(board, id, name);
    return next !== board && commit(next);
  }
  function createColumn(name: string): boolean {
    const next = addColumn(board, name);
    return next !== board && commit(next);
  }
  function savePromptColumn(name: string): boolean {
    return columnPrompt?.id ? saveColumnName(columnPrompt.id, name) : createColumn(name);
  }
  function removeBoardColumn(id: string, destination: string): boolean {
    const next = removeColumn(board, id, destination);
    return next !== board && commit(next);
  }
  function saveTask(patch: TaskPatch): boolean {
    return selectedId !== null && commit(patchTask(board, selectedId, patch));
  }
  function saveProjectDetails(name: string, color: string): boolean {
    if (!projectDialog) return false;
    const creating = projectDialog.id === null;
    const next = saveProject(board, projectDialog.id, name, color);
    if (next === board || !commit(next)) return false;
    if (creating) openProject(next.projects.at(-1)!.id);
    return true;
  }
  function move(id: string, status: Status, project?: string, before?: string) { commit(moveTask(board, id, status, view, project, before)); }
  function switchView(next: View) { view = next; projectId = null; selectedId = null; }
  function openProject(id: string) { view = 'all'; projectId = id; selectedId = null; }
  function newTask() {
    if (storageBlocked || confirmation) return;
    closePanels();
    if (!board.projects.length) projectDialog = { id: null };
    else taskCreationOpen = true;
  }
  function openSettings() { if (confirmation) return; closePanels(); paletteOpen = false; settingsOpen = true; }
  function closePanels() { draftDirty = false; selectedId = null; settingsOpen = false; projectDialog = null; taskCreationOpen = false; columnPrompt = null; }
  function openPalette() {
    if (confirmation || paletteOpen) return;
    const open = () => { closePanels(); paletteOpen = true; };
    if (draftDirty) {
      confirmation = { title: 'Discard unsaved changes?', message: 'Your edits have not been saved. Discard them and open the command palette?', action: 'Discard changes', run: open };
    } else open();
  }
  async function runCommand(run: () => void) { paletteOpen = false; await tick(); run(); }
  function requestColumnRemoval(id: string, destination: string) {
    confirmation = { title: 'Remove column?', message: `Move tasks from “${board.columns.find(c => c.id === id)?.name}” to “${board.columns.find(c => c.id === destination)?.name}” and remove the column?`, action: 'Remove column', run: () => commit(removeColumn(board, id, destination)) };
  }
  let allCommands = $derived(buildCommands(board, view, projectId, {
    newTask, newProject: () => projectDialog = { id: null }, editProject: (id) => projectDialog = { id }, deleteProject: askDeleteProject,
    project: openProject, all: () => switchView('all'), todayView: () => switchView('today'), settings: openSettings,
    theme: (value) => theme = value,
    collapse: (ids) => { commit(setCollapsed(board, ids)); switchView('all'); },
    editTask: (id) => selectedId = id,
    moveColumn: (id, column) => commit(moveTask(board, id, column, 'all')),
    moveProject: (id, project) => { const task = board.tasks.find(t => t.id === id); if (task) commit(moveTask(board, id, task.status, 'all', project)); },
    priority: (id, direction) => commit(reorderTask(board, id, direction, view)),
    toggleToday: (id) => commit(toggleToday(board, id)),
    toggleBlocked: (id) => { const task = board.tasks.find(t => t.id === id); if (task) commit(patchTask(board, id, { blocked: !task.blocked })); },
    deleteTask: (id) => askDelete([id]),
    clearDone, clearToday: askClearToday,
    addColumn: () => columnPrompt = { id: null }, renameColumn: (id) => columnPrompt = { id },
    removeColumn: requestColumnRemoval, export: () => exportBoard(board),
  }));
  let commands = $derived(storageBlocked ? allCommands.filter(command => command.group === 'Navigate' || command.group === 'Preferences') : allCommands);
  function askDeleteProject(id: string) {
    const project = board.projects.find(p => p.id === id);
    if (!project || storageBlocked) return;
    const count = board.tasks.filter(t => t.projectId === id).length;
    confirmation = { title: 'Delete project?', message: `Permanently delete “${project.name}” and all ${count} of its tasks? This cannot be undone.`, action: 'Delete project', run: () => { if (!commit(deleteProject(board, id))) return; switchView('all'); projectDialog = null; } };
  }
  function startSidebarResize(e: PointerEvent) {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    resizingSidebar = true;
  }
  function resizeSidebar(e: PointerEvent) { if (resizingSidebar) sidebarWidth = clampSidebarWidth(e.clientX); }
  function finishSidebarResize() { resizingSidebar = false; }
  function sidebarKey(e: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    sidebarWidth = e.key === 'Home' ? sidebarRange.min : e.key === 'End' ? sidebarRange.max : clampSidebarWidth(sidebarWidth + (e.key === 'ArrowLeft' ? -8 : 8));
  }
  function askDelete(ids: string[]) {
    if (storageBlocked || !ids.length) return;
    confirmation = { title: ids.length === 1 ? 'Delete task?' : 'Clear completed tasks?', message: ids.length === 1 ? `Permanently delete “${board.tasks.find(t => t.id === ids[0])?.title}”? This cannot be undone.` : `Permanently delete these ${ids.length} completed tasks from this view? This cannot be undone.`, action: ids.length === 1 ? 'Delete task' : 'Clear completed tasks', run: () => { if (!commit(deleteTasks(board, ids))) return; if (ids.includes(selectedId ?? '')) selectedId = null; } };
  }
  function clearDone() { askDelete(board.tasks.filter(t => t.status === board.completedColumnId && (!projectId || t.projectId === projectId) && (view !== 'today' || t.today)).map(t => t.id)); }
  function askClearToday() {
    const count = board.tasks.filter(t => t.today).length;
    if (!count || storageBlocked) return;
    paletteOpen = false;
    confirmation = { title: "Clear today's work?", message: `Remove all ${count} tasks from today's selection? Their projects, columns, and priority order will stay the same.`, action: "Clear today's work", run: () => commit(clearToday(board)) };
  }
  function keyboard(e: KeyboardEvent) {
    if (confirmation || !(e.metaKey || e.ctrlKey) || e.altKey) return;
    if (e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); openPalette(); return; }
  }
</script>
<svelte:window onkeydown={keyboard}/>
<div class="app-shell" style={`--sidebar-width: ${sidebarWidth}px`}>
  <aside class="sidebar" id="project-sidebar">
    <div class="brand"><span class="brand-mark">P<span>0</span></span><strong>Project Zero</strong></div>
    <nav class="view-nav" aria-label="Views">
      <button aria-label="All work" class:active={view === 'all' && !projectId} aria-current={view === 'all' && !projectId ? 'page' : undefined} onclick={() => switchView('all')}><Icon name="board" size={16}/><span>All work</span></button>
      <button aria-label="Today" class:active={view === 'today'} aria-current={view === 'today' ? 'page' : undefined} onclick={() => switchView('today')}><Icon name="sun" size={16}/><span>Today</span></button>
    </nav>
    <div class="projects-header"><span>Projects</span></div>
    <nav class="project-nav" aria-label="Projects">
      {#each board.projects as project}<button class="project-link" class:active={projectId === project.id} aria-current={projectId === project.id ? 'page' : undefined} onclick={() => openProject(project.id)}><span class="project-dot" style={`background: ${projectColor(project.color)}`}></span><span class="project-name">{project.name}</span></button>{/each}
    </nav>
  </aside>
  <!-- A focusable ARIA window splitter supports pointer resizing and arrow/Home/End keys. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="sidebar-resizer" role="separator" aria-label="Sidebar width" aria-orientation="vertical" aria-controls="project-sidebar" aria-valuemin={sidebarRange.min} aria-valuemax={sidebarRange.max} aria-valuenow={sidebarWidth} tabindex="0" onpointerdown={startSidebarResize} onpointermove={resizeSidebar} onpointerup={finishSidebarResize} onpointercancel={finishSidebarResize} onlostpointercapture={finishSidebarResize} onkeydown={sidebarKey}></div>
  <main>
    <header class="page-heading"><h1>{projectId ? board.projects.find(p => p.id === projectId)?.name : view === 'all' ? 'All work' : 'Today'}</h1>{#if projectId}<div class="board-actions"><button onclick={() => projectDialog = { id: projectId }}>Rename</button><button class="danger-button" onclick={() => askDeleteProject(projectId!)}>Delete project</button></div>{/if}</header>
    {#if saveError}<div class="save-error" role="alert">{saveError}</div>{/if}
    {#if nativeError}<div class="save-error" role="alert">{nativeError}</div>{/if}
    {#if ready && !storageBlocked}<BoardView {board} {view} {projectId} onopen={(id) => { if (board.tasks.find(t => t.id === id)?.status !== board.completedColumnId) selectedId = id; }} ontoday={(id) => commit(toggleToday(board, id))} ondelete={(id) => askDelete([id])} oncollapse={(ids) => commit(setCollapsed(board, ids))} onmove={move}/>{/if}

    <span class="prototype-note">{storageBlocked ? 'Saved board unavailable' : 'Prototype · saved on this device'}</span>
  </main>
</div>
{#if settingsOpen}
  <Settings {board} {saveError} {theme} ondirty={(dirty) => draftDirty = dirty} onremove={removeBoardColumn} onrename={saveColumnName}
    onadd={createColumn} ontheme={(value) => theme = value} onclose={() => { settingsOpen = false; draftDirty = false; }}/>
{/if}
{#if selected}
  {#key selected.id}
    <TaskEditor task={selected} completed={selected.status === board.completedColumnId} {saveError}
      ondirty={(dirty) => draftDirty = dirty} ondelete={() => askDelete([selected!.id])}
      onsave={saveTask} onclose={() => { selectedId = null; draftDirty = false; }}/>
  {/key}
{/if}
{#if paletteOpen}
  <TaskPalette {commands} onrun={(run) => { void runCommand(run); }} onclose={() => paletteOpen = false}/>
{/if}
{#if taskCreationOpen && board.projects.length}
  <NewTaskDialog projects={board.projects} initialProject={projectId ?? board.projects[0].id}
    today={view === 'today'} {saveError} ondirty={(dirty) => draftDirty = dirty} onadd={add}
    onclose={() => { taskCreationOpen = false; draftDirty = false; }}/>
{/if}
{#if columnPrompt}
  <TextPrompt title={columnPrompt.id ? 'Rename column' : 'Add column'}
    initial={board.columns.find(column => column.id === columnPrompt?.id)?.name ?? ''}
    {saveError} ondirty={(dirty) => draftDirty = dirty} onsave={savePromptColumn}
    onclose={() => { columnPrompt = null; draftDirty = false; }}/>
{/if}
{#if projectDialog}
  <ProjectDialog project={board.projects.find(project => project.id === projectDialog?.id) ?? null}
    {saveError} ondirty={(dirty) => draftDirty = dirty} onsave={saveProjectDetails}
    onclose={() => { projectDialog = null; draftDirty = false; }}/>
{/if}
{#if confirmation}
  <ConfirmDialog title={confirmation.title} message={confirmation.message} action={confirmation.action}
    onconfirm={() => { confirmation?.run(); confirmation = null; }} onclose={() => confirmation = null}/>
{/if}
