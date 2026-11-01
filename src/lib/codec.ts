import { defaultColumns, isProjectColor, type Board, type CheckItem, type Column, type Project, type Task } from './model.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isText(value: unknown, max = Infinity): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
function unique(values: string[]): boolean { return new Set(values).size === values.length; }
function isProject(value: unknown): value is Project {
  return isRecord(value) && isText(value.id) && isText(value.name, 80) && isProjectColor(value.color);
}
function isColumn(value: unknown): value is Column {
  return isRecord(value) && isText(value.id) && isText(value.name, 60);
}
function isCheckItem(value: unknown): value is CheckItem {
  return isRecord(value) && isText(value.id) && typeof value.title === 'string' && typeof value.done === 'boolean';
}

// Early prototypes allowed core columns to be removed. Restore them without introducing
// a duplicate label (e.g. a custom column may already be called “Doing”).
function restoreCoreColumns(saved: Column[]): Column[] {
  const columns = saved.map(column => ({ ...column, name: column.name.trim() }));
  const names = new Set(columns.map(column => column.name.toLowerCase()));
  for (const core of defaultColumns) {
    if (columns.some(column => column.id === core.id)) continue;
    let name = core.name;
    let suffix = 1;
    while (names.has(name.toLowerCase())) {
      name = `${core.name} (restored${suffix === 1 ? '' : ` ${suffix}`})`;
      suffix += 1;
    }
    names.add(name.toLowerCase());
    const column = { ...core, name };
    if (core.id === 'todo') columns.unshift(column);
    else if (core.id === 'doing') {
      const done = columns.findIndex(column => column.id === 'done');
      columns.splice(done < 0 ? columns.length : done, 0, column);
    } else columns.push(column);
  }
  return columns;
}

// Decode unknown data at the storage boundary. Never replace an unreadable board with samples.
export function decodeBoard(value: unknown): Board {
  if (!isRecord(value)) throw new Error('Invalid saved board.');
  const version = value.version;
  if (typeof version !== 'number' || ![1, 2, 3, 4, 5, 6].includes(version)) throw new Error('Unsupported saved board.');
  if (!Array.isArray(value.projects) || !value.projects.every(isProject)) throw new Error('Invalid saved projects.');
  const projects = value.projects;
  if (!unique(projects.map(project => project.id)) || !unique(projects.map(project => project.name.trim().toLowerCase()))) throw new Error('Duplicate saved projects.');
  const savedColumns = version >= 3 ? value.columns : defaultColumns;
  if (!Array.isArray(savedColumns) || !savedColumns.length || !savedColumns.every(isColumn)
    || !unique(savedColumns.map(column => column.id))
    || !unique(savedColumns.map(column => column.name.trim().toLowerCase()))) throw new Error('Invalid saved columns.');
  const columns = restoreCoreColumns(savedColumns);
  const columnIds = new Set(columns.map(column => column.id));
  const projectIds = new Set(projects.map(project => project.id));
  const completedColumnId = version >= 4 ? value.completedColumnId : 'done';
  if (typeof completedColumnId !== 'string' || !columnIds.has(completedColumnId)) throw new Error('Invalid completed column.');
  const collapsedProjects = version >= 4 ? value.collapsedProjects : [];
  if (!Array.isArray(collapsedProjects) || !collapsedProjects.every((id): id is string => typeof id === 'string' && projectIds.has(id))
    || !unique(collapsedProjects)) throw new Error('Invalid saved preferences.');
  if (!Array.isArray(value.tasks)) throw new Error('Invalid saved tasks.');

  const tasks: Task[] = value.tasks.map(value => {
    if (!isRecord(value) || !isText(value.id) || !isText(value.title, 300)
      || typeof value.projectId !== 'string' || !projectIds.has(value.projectId)
      || typeof value.status !== 'string' || !(columnIds.has(value.status) || (version === 1 && value.status === 'blocked'))
      || typeof value.today !== 'boolean' || !Number.isFinite(value.order) || !Number.isFinite(value.todayOrder)
      || typeof value.notes !== 'string' || !Array.isArray(value.checklist) || !value.checklist.every(isCheckItem)
      || (value.blockerReason !== undefined && typeof value.blockerReason !== 'string')
      || (version !== 1 && (typeof value.blocked !== 'boolean' || (value.status === completedColumnId && value.blocked)))) {
      throw new Error('Invalid saved tasks.');
    }
    const reason = typeof value.blockerReason === 'string' ? value.blockerReason.trim() : '';
    const notes = reason && !value.notes.includes(reason) ? [value.notes.trim(), reason].filter(Boolean).join('\n\n') : value.notes;
    return {
      id: value.id, title: value.title, projectId: value.projectId,
      status: version === 1 && value.status === 'blocked' ? 'doing' : value.status,
      blocked: version === 1 ? value.status === 'blocked' : value.blocked as boolean,
      today: value.today, order: value.order as number, todayOrder: value.todayOrder as number,
      notes, checklist: value.checklist.map(item => ({ ...item })),
    };
  });
  if (!unique(tasks.map(task => task.id))) throw new Error('Duplicate saved task identifiers.');

  if (version === 1) {
    // Merge the former Blocked lane after Doing, preserving each lane's relative order.
    const legacyOrder = (a: Task, b: Task) => Number(a.blocked) - Number(b.blocked);
    for (const project of projects) {
      tasks.filter(task => task.projectId === project.id && task.status === 'doing')
        .sort((a, b) => legacyOrder(a, b) || a.order - b.order).forEach((task, index) => task.order = index);
    }
    tasks.filter(task => task.today && task.status === 'doing')
      .sort((a, b) => legacyOrder(a, b) || a.todayOrder - b.todayOrder).forEach((task, index) => task.todayOrder = index);
  }
  return { version: 6, projects: projects.map(project => ({ ...project })), completedColumnId, collapsedProjects: [...collapsedProjects], columns, tasks };
}
