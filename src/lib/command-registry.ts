import type { Board, View } from './model.ts';
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
  clearDone(): void;
  clearAllDone(): void;
  about(): void;
  checkForUpdates(): void;
  website(): void;
  reportProblem(): void;
  clearToday(): void;
}
const appearances: [Theme, string][] = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];
// The palette is for what you'd look up by name. Anything aimed at one task card (editing,
// moving, reordering, Today, blocked, deleting) is done on the card itself, as in Typr.
export function buildCommands(
  board: Board,
  view: View,
  projectId: string | null,
  a: CommandActions,
  context: { theme?: Theme } = {},
): Command[] {
  const { theme } = context;
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
    {
      id: 'edit-project',
      label: 'Rename project…',
      group: 'Projects',
      children: board.projects.map(p => ({ id: `edit-project-${p.id}`, label: p.name, run: () => a.editProject(p.id) })),
    },
    {
      id: 'delete-project',
      label: 'Delete project…',
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
  // Remove empty branches (e.g. no projects to go to) so neither browsing nor search offers dead ends.
  function available(items: Command[]): Command[] {
    return items.flatMap(command => {
      const children = command.children ? available(command.children) : undefined;
      return command.run || children?.length ? [{ ...command, children }] : [];
    });
  }
  return available(roots);
}
