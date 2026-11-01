export type Status = string;
export interface Column {
  id: string;
  name: string;
}
export const limits = { taskTitle: 300, projectName: 80, columnName: 60 } as const;
// Core columns are protected from removal even after renaming.
export const coreColumnIds = ['todo', 'doing', 'done'] as const;
export const defaultColumns: Column[] = [
  { id: 'todo', name: 'To do' },
  { id: 'doing', name: 'Doing' },
  { id: 'done', name: 'Done' },
];
export type View = 'all' | 'today';
export const projectColors = [
  { id: 'iris', name: 'Purple' },
  { id: 'sage', name: 'Green' },
  { id: 'sand', name: 'Yellow' },
  { id: 'slate', name: 'Graphite' },
  { id: 'rose', name: 'Magenta' },
  { id: 'coral', name: 'Orange' },
  { id: 'sky', name: 'Blue' },
  { id: 'teal', name: 'Cyan' },
];
export function isProjectColor(color: unknown): color is string {
  return typeof color === 'string' && (projectColors.some(c => c.id === color) || /^#[0-9a-f]{6}$/i.test(color));
}
export interface Project {
  id: string;
  name: string;
  color: string;
}
export interface Task {
  id: string;
  title: string;
  projectId: string;
  status: Status;
  blocked: boolean;
  today: boolean;
  order: number;
  todayOrder: number;
  notes: string;
}
export type TaskPatch = Partial<Pick<Task, 'title' | 'notes' | 'blocked'>>;
export interface Board {
  completedColumnId: string;
  collapsedProjects: string[];
  columns: Column[];
  projects: Project[];
  tasks: Task[];
}
export function emptyBoard(): Board {
  return {
    completedColumnId: 'done',
    collapsedProjects: [],
    columns: defaultColumns.map(column => ({ ...column })),
    projects: [],
    tasks: [],
  };
}
// True when there is nothing for Start over to clear: no projects and the default columns.
export function isEmptyBoard(board: Board): boolean {
  const defaults = emptyBoard();
  return (
    !board.projects.length &&
    !board.tasks.length &&
    board.completedColumnId === defaults.completedColumnId &&
    JSON.stringify(board.columns) === JSON.stringify(defaults.columns)
  );
}
export function lane(board: Board, view: View, status: Status, projectId?: string): Task[] {
  return board.tasks
    .filter(t => t.status === status && (view !== 'today' || t.today) && (!projectId || t.projectId === projectId))
    .sort((a, b) => (view === 'today' ? a.todayOrder - b.todayOrder : a.order - b.order) || a.id.localeCompare(b.id));
}
export function addTask(
  board: Board,
  title: string,
  projectId: string,
  view: View,
  status: Status = board.columns.find(c => c.id !== board.completedColumnId)!.id,
): Board {
  if (
    !title.trim() ||
    title.trim().length > limits.taskTitle ||
    !board.columns.some(c => c.id === status) ||
    !board.projects.some(p => p.id === projectId)
  )
    return board;
  const task: Task = {
    id: crypto.randomUUID(),
    title: title.trim(),
    projectId,
    status,
    today: view === 'today',
    order: Math.max(-1, ...lane(board, 'all', status, projectId).map(t => t.order)) + 1,
    todayOrder: Math.max(-1, ...lane(board, 'today', status).map(t => t.todayOrder)) + 1,
    blocked: false,
    notes: '',
  };
  return { ...board, tasks: [...board.tasks, task] };
}
export function patchTask(board: Board, id: string, patch: TaskPatch): Board {
  if (!board.tasks.some(task => task.id === id)) return board;
  if (patch.title !== undefined) {
    if (!patch.title.trim() || patch.title.trim().length > limits.taskTitle) return board;
    patch = { ...patch, title: patch.title.trim() };
  }
  if (patch.blocked && board.tasks.find(t => t.id === id)?.status === board.completedColumnId) return board;
  return { ...board, tasks: board.tasks.map(t => (t.id === id ? { ...t, ...patch } : t)) };
}
export function toggleToday(board: Board, id: string): Board {
  const task = board.tasks.find(t => t.id === id);
  if (!task) return board;
  const last = Math.max(-1, ...lane(board, 'today', task.status).map(t => t.todayOrder));
  return { ...board, tasks: board.tasks.map(t => (t.id === id ? { ...t, today: !t.today, todayOrder: last + 1 } : t)) };
}
// Reordering Today never changes project-board order. A status change updates the shared task.
export function moveTask(board: Board, id: string, status: Status, view: View, projectId?: string, beforeId?: string): Board {
  const original = board.tasks.find(t => t.id === id);
  if (!original || !board.columns.some(c => c.id === status) || beforeId === id) return board;
  const destination = view === 'all' && projectId ? projectId : original.projectId;
  if (!board.projects.some(p => p.id === destination)) return board;
  const changedGroup = original.status !== status || original.projectId !== destination;
  let next: Board = {
    ...board,
    tasks: board.tasks.map(t =>
      t.id === id
        ? {
            ...t,
            status,
            projectId: destination,
            blocked: status === board.completedColumnId ? false : t.blocked,
            order: changedGroup ? Math.max(-1, ...lane(board, 'all', status, destination).map(t => t.order)) + 1 : t.order,
            todayOrder:
              original.status !== status
                ? Math.max(-1, ...lane(board, 'today', status).map(t => t.todayOrder)) + 1
                : t.todayOrder,
          }
        : t,
    ),
  };
  const list = lane(next, view, status, view === 'all' ? destination : undefined).filter(t => t.id !== id);
  const index = beforeId ? list.findIndex(t => t.id === beforeId) : -1;
  list.splice(
    index < 0 ? list.length : index,
    0,
    next.tasks.find(t => t.id === id)!,
  );
  const ranks = new Map(list.map((t, i) => [t.id, i]));
  const key = view === 'all' ? 'order' : 'todayOrder';
  next = { ...next, tasks: next.tasks.map(t => (ranks.has(t.id) ? { ...t, [key]: ranks.get(t.id)! } : t)) };
  return next;
}

// IDs remain stable when labels change, so renaming cannot move or lose tasks.
export function renameColumn(board: Board, id: string, name: string): Board {
  const title = name.trim();
  if (
    !title ||
    title.length > limits.columnName ||
    !board.columns.some(c => c.id === id) ||
    board.columns.some(c => c.id !== id && c.name.trim().toLowerCase() === title.toLowerCase())
  )
    return board;
  if (board.columns.find(column => column.id === id)?.name === title) return board;
  return { ...board, columns: board.columns.map(c => (c.id === id ? { ...c, name: title } : c)) };
}
export function addColumn(board: Board, name: string): Board {
  const title = name.trim();
  if (!title || title.length > limits.columnName || board.columns.some(c => c.name.trim().toLowerCase() === title.toLowerCase()))
    return board;
  const columns = [...board.columns];
  const done = columns.findIndex(c => c.id === board.completedColumnId);
  columns.splice(done < 0 ? columns.length : done, 0, { id: crypto.randomUUID(), name: title });
  return { ...board, columns };
}

export function deleteTasks(board: Board, ids: string[]): Board {
  const selected = new Set(ids);
  return { ...board, tasks: board.tasks.filter(t => !selected.has(t.id)) };
}
export function setCollapsed(board: Board, ids: string[]): Board {
  return { ...board, collapsedProjects: [...new Set(ids)].filter(id => board.projects.some(p => p.id === id)) };
}
export function removeColumn(board: Board, id: string, destination: string): Board {
  if (
    protectedColumn(board, id) ||
    board.columns.length <= 3 ||
    id === destination ||
    !board.columns.some(c => c.id === id) ||
    !board.columns.some(c => c.id === destination)
  )
    return board;
  let next = board;
  for (const task of lane(board, 'all', id)) next = moveTask(next, task.id, destination, 'all', task.projectId);
  return { ...next, columns: next.columns.filter(c => c.id !== id) };
}

export function clearToday(board: Board): Board {
  return { ...board, tasks: board.tasks.map(t => (t.today ? { ...t, today: false } : t)) };
}
export function protectedColumn(board: Board, id: string): boolean {
  return [...coreColumnIds, board.completedColumnId].includes(id);
}
export function projectColor(color: string): string {
  return projectColors.some(c => c.id === color) ? `var(--${color})` : color;
}
export function saveProject(board: Board, id: string | null, name: string, color: string): Board {
  const title = name.trim();
  if (
    !title ||
    title.length > limits.projectName ||
    !isProjectColor(color) ||
    board.projects.some(p => p.id !== id && p.name.trim().toLowerCase() === title.toLowerCase())
  )
    return board;
  if (id && !board.projects.some(p => p.id === id)) return board;
  return {
    ...board,
    projects: id
      ? board.projects.map(p => (p.id === id ? { ...p, name: title, color } : p))
      : [...board.projects, { id: crypto.randomUUID(), name: title, color }],
  };
}

export function reorderTask(board: Board, id: string, direction: 'top' | 'up' | 'down' | 'bottom', view: View): Board {
  const task = board.tasks.find(t => t.id === id);
  if (!task) return board;
  const scope = view === 'today' && task.today ? 'today' : 'all';
  const list = lane(board, scope, task.status, scope === 'all' ? task.projectId : undefined);
  const index = list.findIndex(t => t.id === id);
  if ((direction === 'top' || direction === 'up') && index === 0) return board;
  if ((direction === 'bottom' || direction === 'down') && index === list.length - 1) return board;
  const before =
    direction === 'top'
      ? list[0]?.id
      : direction === 'up'
        ? list[index - 1]?.id
        : direction === 'down'
          ? list[index + 2]?.id
          : undefined;
  return moveTask(board, id, task.status, scope, task.projectId, before);
}

export function deleteProject(board: Board, id: string): Board {
  if (!board.projects.some(p => p.id === id)) return board;
  return {
    ...board,
    projects: board.projects.filter(p => p.id !== id),
    tasks: board.tasks.filter(t => t.projectId !== id),
    collapsedProjects: board.collapsedProjects.filter(project => project !== id),
  };
}
