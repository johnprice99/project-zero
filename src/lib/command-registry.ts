import { isEmptyBoard, protectedColumn, type Board, type View } from './model.ts';
import type { Command } from './commands.ts';
import type { Theme } from './theme';
export interface CommandActions {
  newTask(): void;
  newProject(): void;
  editProject(id: string): void;
  deleteProject(id: string): void;
  project(id: string): void;
  all(): void;
  todayView(): void;
  settings(): void;
  theme(theme: Theme): void;
  collapse(ids: string[]): void;
  editTask(id: string): void;
  moveColumn(task: string, column: string): void;
  moveProject(task: string, project: string): void;
  priority(task: string, direction: 'top' | 'up' | 'down' | 'bottom'): void;
  toggleToday(id: string): void;
  toggleBlocked(id: string): void;
  deleteTask(id: string): void;
  clearDone(): void;
  clearAllDone(): void;
  startOver(): void;
  about(): void;
  checkForUpdates(): void;
  website(): void;
  reportProblem(): void;
  clearToday(): void;
  addColumn(): void;
  renameColumn(id: string): void;
  removeColumn(id: string, destination: string): void;
}
const appearances: [Theme, string][] = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];
export function buildCommands(
  board: Board,
  view: View,
  projectId: string | null,
  a: CommandActions,
  context: { theme?: Theme } = {},
): Command[] {
  const { theme } = context;
  const active = board.tasks.filter(t => t.status !== board.completedColumnId);
  const projectName = (id: string) => board.projects.find(p => p.id === id)?.name ?? '';
  const taskItems = (tasks: typeof board.tasks, key: string, action: (id: string) => void): Command[] =>
    tasks.map(t => ({ id: `${key}-${t.id}`, label: t.title, detail: projectName(t.projectId), run: () => action(t.id) }));
  const roots: Command[] = [
    { id: 'new-task', label: 'New task', group: 'Create', run: a.newTask },
    { id: 'new-project', label: 'New project', group: 'Create', run: a.newProject },
    { id: 'all-work', label: 'Go to All work', group: 'Navigate', run: a.all },
    { id: 'today', label: 'Go to Today', group: 'Navigate', run: a.todayView },
    {
      id: 'projects',
      label: 'Go to project…',
      group: 'Navigate',
      placeholder: 'Go to project…',
      children: board.projects.map(p => ({ id: `project-${p.id}`, label: p.name, run: () => a.project(p.id) })),
    },
    { id: 'edit-task', label: 'Edit task…', group: 'Tasks', children: taskItems(active, 'edit', a.editTask) },
    {
      id: 'move-column',
      label: 'Move task to column…',
      group: 'Tasks',
      children: board.tasks.map(t => ({
        id: `move-${t.id}`,
        label: t.title,
        detail: projectName(t.projectId),
        placeholder: `Move “${t.title}” to…`,
        children: board.columns
          .filter(c => c.id !== t.status)
          .map(c => ({ id: `move-${t.id}-${c.id}`, label: c.name, run: () => a.moveColumn(t.id, c.id) })),
      })),
    },
    {
      id: 'move-project',
      label: 'Move task to project…',
      group: 'Tasks',
      children: board.tasks.map(t => ({
        id: `reproject-${t.id}`,
        label: t.title,
        detail: projectName(t.projectId),
        placeholder: `Move “${t.title}” to project…`,
        children: board.projects
          .filter(p => p.id !== t.projectId)
          .map(p => ({ id: `reproject-${t.id}-${p.id}`, label: p.name, run: () => a.moveProject(t.id, p.id) })),
      })),
    },
    {
      id: 'priority',
      label: 'Change task order…',
      group: 'Tasks',
      children: active.map(t => ({
        id: `priority-${t.id}`,
        label: t.title,
        detail: projectName(t.projectId),
        placeholder: `Move “${t.title}”…`,
        children: (['top', 'up', 'down', 'bottom'] as const).map(direction => ({
          id: `priority-${t.id}-${direction}`,
          label: `Move ${direction === 'top' || direction === 'bottom' ? 'to ' : ''}${direction}`,
          run: () => a.priority(t.id, direction),
        })),
      })),
    },
    {
      id: 'add-today',
      label: "Add to today's work…",
      group: 'Tasks',
      children: taskItems(
        active.filter(t => !t.today),
        'add-today',
        a.toggleToday,
      ),
    },
    {
      id: 'remove-today',
      label: "Remove from today's work…",
      group: 'Tasks',
      children: taskItems(
        board.tasks.filter(t => t.today),
        'remove-today',
        a.toggleToday,
      ),
    },
    {
      id: 'block',
      label: 'Mark task blocked…',
      group: 'Tasks',
      children: taskItems(
        active.filter(t => !t.blocked),
        'block',
        a.toggleBlocked,
      ),
    },
    {
      id: 'unblock',
      label: 'Unblock task…',
      group: 'Tasks',
      children: taskItems(
        active.filter(t => t.blocked),
        'unblock',
        a.toggleBlocked,
      ),
    },
    { id: 'delete', label: 'Delete task…', group: 'Tasks', children: taskItems(board.tasks, 'delete', a.deleteTask) },
    {
      id: 'edit-project',
      label: 'Edit project name or colour…',
      group: 'Projects',
      children: board.projects.map(p => ({ id: `edit-project-${p.id}`, label: p.name, run: () => a.editProject(p.id) })),
    },
    {
      id: 'delete-project',
      label: 'Delete project and all its tasks…',
      group: 'Projects',
      children: board.projects.map(p => ({ id: `delete-project-${p.id}`, label: p.name, run: () => a.deleteProject(p.id) })),
    },
    {
      id: 'collapse-all',
      label: 'Collapse all projects',
      group: 'Projects',
      run: () => a.collapse(board.projects.map(p => p.id)),
    },
    { id: 'expand-all', label: 'Expand all projects', group: 'Projects', run: () => a.collapse([]) },
    {
      id: 'collapse-project',
      label: 'Collapse or expand project…',
      group: 'Projects',
      children: board.projects.map(p => ({
        id: `collapse-${p.id}`,
        label: `${board.collapsedProjects.includes(p.id) ? 'Expand' : 'Collapse'} ${p.name}`,
        run: () =>
          a.collapse(
            board.collapsedProjects.includes(p.id)
              ? board.collapsedProjects.filter(id => id !== p.id)
              : [...board.collapsedProjects, p.id],
          ),
      })),
    },
    { id: 'add-column', label: 'Add column…', group: 'Board', run: a.addColumn },
    {
      id: 'rename-column',
      label: 'Rename column…',
      group: 'Board',
      children: board.columns.map(c => ({ id: `rename-${c.id}`, label: c.name, run: () => a.renameColumn(c.id) })),
    },
    {
      id: 'remove-column',
      label: 'Remove column…',
      group: 'Board',
      children: board.columns
        .filter(c => !protectedColumn(board, c.id))
        .map(c => ({
          id: `remove-column-${c.id}`,
          label: c.name,
          placeholder: `Move tasks from “${c.name}” to…`,
          children: board.columns
            .filter(d => d.id !== c.id)
            .map(d => ({
              id: `remove-column-${c.id}-${d.id}`,
              label: `Move tasks to ${d.name} and remove`,
              run: () => a.removeColumn(c.id, d.id),
            })),
        })),
    },
    { id: 'settings', label: 'Open Settings', group: 'Preferences', run: a.settings },
    ...appearances.map(([id, name]): Command => ({
      id: `theme-${id}`,
      label: `Appearance: ${name}`,
      group: 'Preferences',
      hint: theme === id ? '✓' : undefined,
      run: () => a.theme(id),
    })),
    { id: 'about', label: 'About Project Zero', group: 'Help', run: a.about },
    { id: 'check-updates', label: 'Check for Updates…', group: 'Help', run: a.checkForUpdates },
    { id: 'website', label: 'Project Zero Website', group: 'Help', run: a.website },
    { id: 'report-problem', label: 'Report a Problem', group: 'Help', run: a.reportProblem },
  ];
  if (board.tasks.some(t => t.today))
    roots.push({ id: 'clear-today', label: "Clear today's work", group: 'Cleanup', run: a.clearToday });
  // Completed tasks are deleted outright (after confirmation); there is no archive.
  const completed = board.tasks.filter(t => t.status === board.completedColumnId);
  const inView = completed.filter(t => (!projectId || t.projectId === projectId) && (view !== 'today' || t.today));
  if (completed.length)
    roots.push({ id: 'clear-all-done', label: 'Clear all completed tasks', group: 'Cleanup', run: a.clearAllDone });
  // Only offered when it would clear fewer than “Clear all” does.
  if (inView.length && inView.length < completed.length)
    roots.push({ id: 'clear-done', label: 'Clear completed tasks in this view', group: 'Cleanup', run: a.clearDone });
  if (!isEmptyBoard(board))
    roots.push({ id: 'start-over', label: 'Start over with an empty board…', group: 'Cleanup', run: a.startOver });
  // A one-project board has no destination for “Move task to project”.
  // Remove empty branches recursively so neither browsing nor search offers dead ends.
  function available(items: Command[]): Command[] {
    return items.flatMap(command => {
      const children = command.children ? available(command.children) : undefined;
      return command.run || children?.length ? [{ ...command, children }] : [];
    });
  }
  return available(roots);
}
