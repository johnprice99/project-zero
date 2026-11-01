<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import BoardView from './components/Board.svelte';
  import ProjectDialog from './components/ProjectDialog.svelte';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import TaskEditor from './components/TaskEditor.svelte';
  import Icon from './components/Icon.svelte';
  import Settings from './components/Settings.svelte';
  import { bindAbout, bindExitFlush, bindNativeMenus, checkForUpdates, isDesktop, openLink, type Startup } from './lib/native';
  import AboutPanel from './components/AboutPanel.svelte';
  import type { BoardStore } from './lib/storage';
  import NewTaskDialog from './components/NewTaskDialog.svelte';
  import { readSidebarWidth, writeSidebarWidth, clampSidebarWidth, sidebarRange, readRecentCommands, writeRecentCommands } from './lib/preferences';
  import { rememberRecent, type PalettePrompt } from './lib/commands';
  import { buildCommands } from './lib/command-registry';
  import TaskPalette from './components/TaskPalette.svelte';
  import { limits, addTask, deleteProject, addColumn, renameColumn, removeColumn, deleteTasks, clearToday, saveProject, projectColor, reorderTask, setCollapsed, moveTask, patchTask, toggleToday, type TaskPatch, type Board, type Status, type View } from './lib/model';
  import { readableError } from './lib/codec';
  import { ConflictError, type BackupInfo } from './lib/storage';
  import { readTheme, applyTheme, type Theme } from './lib/theme';

  // One dialog at a time; a confirmation can appear above it.
  type Panel =
    | { kind: 'palette'; prompt?: PalettePrompt } | { kind: 'about' } | { kind: 'settings' } | { kind: 'new-task' }
    | { kind: 'task'; id: string } | { kind: 'project'; id: string | null };
  // main.ts loads the board before mounting, so the first frame already shows it.
  let { store, startup }: { store: BoardStore; startup: Startup } = $props();
  let board = $state<Board>(untrack(() => startup.board));
  let view = $state<View>('all');
  let projectId = $state<string | null>(null);
  let panel = $state<Panel | null>(null);
  let confirmation = $state<{ title: string; message: string; action: string; run: () => void } | null>(null);
  let theme = $state<Theme>(readTheme());
  let saveError = $state('');
  let nativeError = $state('');
  let draftDirty = $state(false);
  let storageBlocked = $state(false);
  let reloading: Promise<void> | null = null;
  let backups = $state<BackupInfo[]>([]);
  let recentCommands = $state(readRecentCommands());
  let paletteOpenedAt = 0;
  let sidebarWidth = $state(readSidebarWidth());
  let resizingSidebar = $state(false);
  let paletteOpen = $derived(panel?.kind === 'palette');
  let settingsOpen = $derived(panel?.kind === 'settings');
  let taskCreationOpen = $derived(panel?.kind === 'new-task');
  let projectDialog = $derived(panel?.kind === 'project' ? panel : null);
  let selectedId = $derived(panel?.kind === 'task' ? panel.id : null);
  let selected = $derived(board.tasks.find(t => t.id === selectedId));

  function openPanel(next: Panel | null) { panel = next; draftDirty = false; }
  // Ignores a late close event from a dialog that has already been replaced.
  function closePanel(kind: Panel['kind']) { if (panel?.kind === kind) openPanel(null); }
  function closeTask() { closePanel('task'); }

  function blockStorage(error: unknown) {
    saveError = `${readableError(error, 'Local storage is unavailable.')} Editing is paused to protect your saved board.`;
    storageBlocked = true;
  }
  untrack(() => { if (startup.error) blockStorage(startup.error); });
  onMount(() => {
    applyTheme(theme);
    const preference = matchMedia('(prefers-color-scheme: dark)');
    const syncAppearance = () => applyTheme(theme);
    preference.addEventListener('change', syncAppearance);
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const keep = (cleanup: () => void) => { if (disposed) cleanup(); else cleanups.push(cleanup); };
    void bindNativeMenus(openPalette).then(keep).catch(() => { nativeError = 'Mac menu shortcuts could not be connected. Try Cmd+Shift+P in this window.'; });
    void bindAbout(openAbout).then(keep).catch(error => console.error('About Project Zero is unavailable from the menu.', error));
    void bindExitFlush(() => store.flush()).then(keep).catch(error => console.error('Saving before quit is unavailable.', error));
    return () => { disposed = true; cleanups.forEach(cleanup => cleanup()); preference.removeEventListener('change', syncAppearance); };
  });
  $effect(() => { applyTheme(theme); });
  $effect(() => { const width = sidebarWidth; if (!resizingSidebar) { try { writeSidebarWidth(width); } catch { /* Width still applies for this session. */ } } });

  // Changes appear immediately and are saved in order. A failed save returns the board
  // to its last saved state; dialogs stay open with their draft so it can be retried.
  // Deletions use afterSave, so a failed delete leaves the task (and an open editor) in place.
  async function commit(change: (current: Board) => Board, options: { afterSave?: boolean } = {}): Promise<boolean> {
    if (storageBlocked || reloading) return false;
    const before = board;
    const next = change(board);
    if (next === board) return false;
    if (!options.afterSave) board = next;
    try {
      await store.save(next);
      if (options.afterSave) board = change(board);
      saveError = '';
      return true;
    } catch (error) {
      if (!options.afterSave) board = store.saved() ?? before;
      saveError = readableError(error, 'Your changes could not be saved. Try again.');
      // One conflict rejects every queued save; reload once for all of them.
      if (error instanceof ConflictError) await (reloading ??= reloadAfterConflict().finally(() => (reloading = null)));
      return false;
    }
  }
  async function reloadAfterConflict() {
    try {
      const loaded = await store.load();
      if (loaded.board) board = loaded.board;
      saveError = 'This board was changed in another window. The latest saved version has been loaded; your last change was not saved.';
    } catch (error) { blockStorage(error); }
  }
  function add(title: string, project: string) {
    return commit(b => addTask(b, title, project, view));
  }
  async function saveColumnName(id: string, name: string): Promise<boolean> {
    const column = board.columns.find(column => column.id === id);
    if (storageBlocked || !column) return false;
    if (column.name === name.trim()) return true;
    return commit(b => renameColumn(b, id, name));
  }
  function createColumn(name: string) {
    return commit(b => addColumn(b, name));
  }
  const columnNameError = `Use a unique column name (up to ${limits.columnName} characters).`;
  function promptForColumn(id: string | null) {
    const column = board.columns.find(c => c.id === id);
    const change = (b: Board, name: string) => (column ? renameColumn(b, column.id, name) : addColumn(b, name));
    openPrompt({
      placeholder: column ? `Rename “${column.name}”` : 'New column name',
      value: column?.name,
      submit: async name => {
        if (column && column.name === name.trim()) return null;
        if (change(board, name) === board) return columnNameError;
        return (await commit(b => change(b, name))) ? null : saveError || 'Your changes could not be saved. Try again.';
      },
    });
  }
  function removeBoardColumn(id: string, destination: string) {
    return commit(b => removeColumn(b, id, destination));
  }
  function saveTask(patch: TaskPatch) {
    const id = selectedId;
    return id === null ? Promise.resolve(false) : commit(b => patchTask(b, id, patch));
  }
  async function saveProjectDetails(name: string, color: string): Promise<boolean> {
    if (!projectDialog) return false;
    const id = projectDialog.id;
    const before = board.projects.length;
    if (!(await commit(b => saveProject(b, id, name, color)))) return false;
    if (id === null && board.projects.length > before) openProject(board.projects.at(-1)!.id);
    return true;
  }
  function move(id: string, status: Status, project?: string, before?: string) { void commit(b => moveTask(b, id, status, view, project, before)); }
  function switchView(next: View) { view = next; projectId = null; closeTask(); }
  function openProject(id: string) { view = 'all'; projectId = id; closeTask(); }
  function newTask() {
    if (storageBlocked || confirmation) return;
    openPanel(board.projects.length ? { kind: 'new-task' } : { kind: 'project', id: null });
  }
  function openSettings() { if (confirmation) return; openPanel({ kind: 'settings' }); }
  function openPrompt(prompt: PalettePrompt) { openPanel({ kind: 'palette', prompt }); }
  function openPalette() {
    // The menu shortcut and the window key handler can both fire for one key press.
    if (confirmation || (paletteOpen && Date.now() - paletteOpenedAt < 300)) return;
    paletteOpenedAt = Date.now();
    void store.listBackups().then(list => backups = list, () => backups = []);
    replaceForm(() => openPanel({ kind: 'palette' }), 'open the command palette');
  }
  // Asks before an unsaved form is replaced.
  function replaceForm(open: () => void, purpose: string) {
    if (draftDirty) {
      confirmation = { title: 'Discard unsaved changes?', message: `Your edits have not been saved. Discard them and ${purpose}?`, action: 'Discard changes', run: open };
    } else open();
  }
  function openAbout() {
    if (confirmation || panel?.kind === 'about') return;
    replaceForm(() => openPanel({ kind: 'about' }), 'show About Project Zero');
  }
  async function runCommand(run: () => unknown) {
    closePanel('palette');
    await tick();
    try { await run(); } catch (error) { saveError = readableError(error, 'That command could not be completed.'); }
  }
  function chooseCommand(id: string) { recentCommands = rememberRecent(recentCommands, id); writeRecentCommands(recentCommands); }
  function requestColumnRemoval(id: string, destination: string) {
    confirmation = { title: 'Remove column?', message: `Move tasks from “${board.columns.find(c => c.id === id)?.name}” to “${board.columns.find(c => c.id === destination)?.name}” and remove the column?`, action: 'Remove column', run: () => void commit(b => removeColumn(b, id, destination)) };
  }
  async function exportTasks() {
    await store.flush();
    const saved = store.saved();
    if (!saved) return;
    try { await store.exportFile(saved); }
    catch (error) { saveError = readableError(error, 'The tasks could not be exported.'); }
  }
  async function askRestore(read: () => Promise<Board | null>, source: string) {
    let restored: Board | null;
    try { restored = await read(); }
    catch (error) { saveError = readableError(error, 'That file could not be read.'); return; }
    if (!restored) return;
    const next = restored;
    confirmation = {
      title: 'Replace the board?',
      message: `Replace the current board with ${source} (${next.projects.length} projects, ${next.tasks.length} tasks)? A backup of the current board is kept.`,
      action: 'Replace board',
      run: () => void restore(next),
    };
  }
  // Shown straight away, like any change, so edits made while it saves build on the restored board.
  async function restore(next: Board) {
    const [before, wasBlocked] = [board, storageBlocked];
    board = next;
    storageBlocked = false;
    switchView('all');
    try {
      await store.replace(next);
      saveError = '';
    } catch (error) {
      board = store.saved() ?? before;
      storageBlocked = wasBlocked;
      saveError = readableError(error, 'The board could not be restored.');
    }
  }
  let allCommands = $derived(buildCommands(board, view, projectId, {
    newTask, newProject: () => openPanel({ kind: 'project', id: null }), editProject: (id) => openPanel({ kind: 'project', id }), deleteProject: askDeleteProject,
    project: openProject, all: () => switchView('all'), todayView: () => switchView('today'), settings: openSettings,
    theme: (value) => theme = value,
    collapse: (ids) => { void commit(b => setCollapsed(b, ids)); switchView('all'); },
    editTask: (id) => openPanel({ kind: 'task', id }),
    moveColumn: (id, column) => void commit(b => moveTask(b, id, column, 'all')),
    moveProject: (id, project) => void commit(b => { const task = b.tasks.find(t => t.id === id); return task ? moveTask(b, id, task.status, 'all', project) : b; }),
    priority: (id, direction) => void commit(b => reorderTask(b, id, direction, view)),
    toggleToday: (id) => void commit(b => toggleToday(b, id)),
    toggleBlocked: (id) => void commit(b => { const task = b.tasks.find(t => t.id === id); return task ? patchTask(b, id, { blocked: !task.blocked }) : b; }),
    deleteTask: (id) => askDelete([id]),
    clearDone, clearAllDone: askClearAllCompleted, clearToday: askClearToday,
    about: openAbout, checkForUpdates: () => void checkForUpdates().catch(error => saveError = readableError(error, 'Couldn’t check for updates.')),
    website: () => void openLink('website'), reportProblem: () => void openLink('issues'),
    addColumn: () => promptForColumn(null), renameColumn: promptForColumn,
    removeColumn: requestColumnRemoval, export: () => void exportTasks(),
    restoreFile: () => void askRestore(() => store.importFile(), 'this file'),
    restoreBackup: (id) => void askRestore(() => store.readBackup(id), 'this backup'),
  }, { theme, backups, desktop: isDesktop }));
  let commands = $derived(storageBlocked ? allCommands.filter(command => command.group === 'Navigate' || command.group === 'Preferences' || command.group === 'Help' || command.id.startsWith('restore-')) : allCommands);
  function askDeleteProject(id: string) {
    const project = board.projects.find(p => p.id === id);
    if (!project || storageBlocked) return;
    const count = board.tasks.filter(t => t.projectId === id).length;
    confirmation = { title: 'Delete project?', message: `Permanently delete “${project.name}” and all ${count} of its tasks? This cannot be undone.`, action: 'Delete project', run: async () => { if (!(await commit(b => deleteProject(b, id), { afterSave: true }))) return; switchView('all'); closePanel('project'); } };
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
    confirmation = { title: ids.length === 1 ? 'Delete task?' : 'Clear completed tasks?', message: ids.length === 1 ? `Permanently delete “${board.tasks.find(t => t.id === ids[0])?.title}”? This cannot be undone.` : `Permanently delete these ${ids.length} completed tasks from this view? This cannot be undone.`, action: ids.length === 1 ? 'Delete task' : 'Clear completed tasks', run: async () => { if (!(await commit(b => deleteTasks(b, ids), { afterSave: true }))) return; if (ids.includes(selectedId ?? '')) closeTask(); } };
  }
  function clearDone() { askDelete(board.tasks.filter(t => t.status === board.completedColumnId && (!projectId || t.projectId === projectId) && (view !== 'today' || t.today)).map(t => t.id)); }
  function askClearAllCompleted() {
    const ids = board.tasks.filter(t => t.status === board.completedColumnId).map(t => t.id);
    if (storageBlocked || !ids.length) return;
    const tasks = ids.length === 1 ? 'the 1 completed task' : `all ${ids.length} completed tasks`;
    confirmation = { title: 'Clear all completed tasks?', message: `Permanently delete ${tasks} across every project? This cannot be undone.`, action: 'Clear completed tasks', run: () => void commit(b => deleteTasks(b, ids), { afterSave: true }) };
  }
  function askClearToday() {
    const count = board.tasks.filter(t => t.today).length;
    if (!count || storageBlocked) return;
    closePanel('palette');
    confirmation = { title: "Clear today's work?", message: `Remove all ${count} tasks from today's selection? Their projects, columns, and priority order will stay the same.`, action: "Clear today's work", run: () => void commit(clearToday) };
  }
  function openTask(id: string) { if (board.tasks.find(t => t.id === id)?.status !== board.completedColumnId) openPanel({ kind: 'task', id }); }
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
    <header class="page-heading"><h1>{projectId ? board.projects.find(p => p.id === projectId)?.name : view === 'all' ? 'All work' : 'Today'}</h1>{#if projectId}<div class="board-actions"><button onclick={() => openPanel({ kind: 'project', id: projectId })}>Rename</button><button class="danger-button" onclick={() => askDeleteProject(projectId!)}>Delete project</button></div>{/if}</header>
    {#if saveError}<div class="save-error" role="alert">{saveError}</div>{/if}
    {#if nativeError}<div class="save-error" role="alert">{nativeError}</div>{/if}
    {#if !storageBlocked}<BoardView {board} {view} {projectId} onopen={openTask} ontoday={(id) => void commit(b => toggleToday(b, id))} ondelete={(id) => askDelete([id])} oncollapse={(ids) => void commit(b => setCollapsed(b, ids))} onmove={move}/>{/if}

  </main>
</div>
{#if panel?.kind === 'about'}
  <AboutPanel onclose={() => closePanel('about')}/>
{/if}
{#if settingsOpen}
  <Settings {board} {saveError} {theme} ondirty={(dirty) => draftDirty = dirty} onremove={removeBoardColumn} onrename={saveColumnName}
    onadd={createColumn} ontheme={(value) => theme = value} onclose={() => closePanel('settings')}/>
{/if}
{#if selected}
  {#key selected.id}
    <TaskEditor task={selected} completed={selected.status === board.completedColumnId} {saveError}
      ondirty={(dirty) => draftDirty = dirty} ondelete={() => askDelete([selected!.id])}
      onsave={saveTask} onclose={() => closePanel('task')}/>
  {/key}
{/if}
{#if panel?.kind === 'palette'}
  {#key panel}
    <TaskPalette {commands} prompt={panel.prompt} recent={recentCommands} onchoose={chooseCommand}
      onrun={(run) => { void runCommand(run); }} onclose={() => closePanel('palette')}/>
  {/key}
{/if}
{#if taskCreationOpen && board.projects.length}
  <NewTaskDialog projects={board.projects} initialProject={projectId ?? board.projects[0].id}
    today={view === 'today'} {saveError} ondirty={(dirty) => draftDirty = dirty} onadd={add}
    onclose={() => closePanel('new-task')}/>
{/if}
{#if projectDialog}
  <ProjectDialog project={board.projects.find(project => project.id === projectDialog?.id) ?? null}
    {saveError} ondirty={(dirty) => draftDirty = dirty} onsave={saveProjectDetails}
    onclose={() => closePanel('project')}/>
{/if}
{#if confirmation}
  <ConfirmDialog title={confirmation.title} message={confirmation.message} action={confirmation.action}
    onconfirm={() => { confirmation?.run(); confirmation = null; }} onclose={() => confirmation = null}/>
{/if}
