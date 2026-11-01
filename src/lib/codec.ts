import { coreColumnIds, isProjectColor, limits, type Board, type Column, type Project, type Task } from './model.ts';

// The saved board document. Bump SCHEMA and add a migration step when the format changes.
export const SCHEMA = 1;
export interface StoredBoard extends Board {
  schema: typeof SCHEMA;
}
type Doc = Record<string, unknown>;
// migrations[n] upgrades a schema n + 1 document to schema n + 2.
const migrations: ((doc: Doc) => Doc)[] = [];

export class BoardFormatError extends Error {}
function fail(path: string, problem: string): never {
  throw new BoardFormatError(`${path} ${problem}`);
}

function isRecord(value: unknown): value is Doc {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, path: string, max = Infinity): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    fail(path, max === Infinity ? 'must be non-empty text.' : `must be non-empty text of up to ${max} characters.`);
  }
  return value;
}
function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'must be a list.');
  return value;
}
function record(value: unknown, path: string): Doc {
  if (!isRecord(value)) fail(path, 'must be an object.');
  return value;
}
function unique(values: string[], path: string, what: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) fail(path, `contains a duplicate ${what}: “${value}”.`);
    seen.add(value);
  }
}

function project(value: unknown, path: string): Project {
  const p = record(value, path);
  const color = p.color;
  if (!isProjectColor(color)) fail(`${path}.color`, 'must be a preset colour or #rrggbb.');
  return { id: text(p.id, `${path}.id`), name: text(p.name, `${path}.name`, limits.projectName), color };
}
function column(value: unknown, path: string): Column {
  const c = record(value, path);
  return { id: text(c.id, `${path}.id`), name: text(c.name, `${path}.name`, limits.columnName) };
}
function validate(doc: Doc): Board {
  const projects = list(doc.projects, 'projects').map((p, i) => project(p, `projects[${i}]`));
  unique(
    projects.map(p => p.id),
    'projects',
    'id',
  );
  unique(
    projects.map(p => p.name.trim().toLowerCase()),
    'projects',
    'name',
  );

  const columns = list(doc.columns, 'columns').map((c, i) => column(c, `columns[${i}]`));
  unique(
    columns.map(c => c.id),
    'columns',
    'id',
  );
  unique(
    columns.map(c => c.name.trim().toLowerCase()),
    'columns',
    'name',
  );
  for (const id of coreColumnIds) if (!columns.some(c => c.id === id)) fail('columns', `is missing the core “${id}” column.`);
  const columnIds = new Set(columns.map(c => c.id));
  const projectIds = new Set(projects.map(p => p.id));

  const completedColumnId = doc.completedColumnId;
  if (typeof completedColumnId !== 'string' || !columnIds.has(completedColumnId)) {
    fail('completedColumnId', 'must name one of the columns.');
  }
  const collapsedProjects = list(doc.collapsedProjects, 'collapsedProjects').map((id, i) => {
    if (typeof id !== 'string' || !projectIds.has(id)) fail(`collapsedProjects[${i}]`, 'must name one of the projects.');
    return id;
  });
  unique(collapsedProjects, 'collapsedProjects', 'project');

  const tasks = list(doc.tasks, 'tasks').map((value, i): Task => {
    const path = `tasks[${i}]`;
    const t = record(value, path);
    const id = text(t.id, `${path}.id`);
    const title = text(t.title, `${path}.title`, limits.taskTitle);
    if (typeof t.projectId !== 'string' || !projectIds.has(t.projectId))
      fail(`${path}.projectId`, 'must name one of the projects.');
    if (typeof t.status !== 'string' || !columnIds.has(t.status)) fail(`${path}.status`, 'must name one of the columns.');
    if (typeof t.blocked !== 'boolean') fail(`${path}.blocked`, 'must be true or false.');
    if (t.blocked && t.status === completedColumnId) fail(`${path}.blocked`, 'cannot be set on completed work.');
    if (typeof t.today !== 'boolean') fail(`${path}.today`, 'must be true or false.');
    if (typeof t.order !== 'number' || !Number.isFinite(t.order)) fail(`${path}.order`, 'must be a number.');
    if (typeof t.todayOrder !== 'number' || !Number.isFinite(t.todayOrder)) fail(`${path}.todayOrder`, 'must be a number.');
    if (typeof t.notes !== 'string') fail(`${path}.notes`, 'must be text.');
    return {
      id,
      title,
      projectId: t.projectId,
      status: t.status,
      blocked: t.blocked,
      today: t.today,
      order: t.order,
      todayOrder: t.todayOrder,
      notes: t.notes,
    };
  });
  unique(
    tasks.map(t => t.id),
    'tasks',
    'id',
  );

  return { completedColumnId, collapsedProjects, columns, projects, tasks };
}

export function encodeBoard(board: Board): StoredBoard {
  return { schema: SCHEMA, ...board };
}

// Decode a saved board document, applying any schema migrations.
export function decodeBoard(value: unknown): Board {
  let doc = record(value, 'Saved board');
  const schema = doc.schema;
  if (typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1) fail('schema', 'is missing or invalid.');
  if (schema > SCHEMA) fail('schema', `${schema} was saved by a newer version of Project Zero.`);
  for (let version = schema; version < SCHEMA; version++) doc = migrations[version - 1](doc);
  return validate(doc);
}

export function readableError(error: unknown, fallback: string): string {
  if (error instanceof BoardFormatError) return `The board file is not valid: ${error.message}`;
  if (error instanceof SyntaxError) return 'The board file is not valid JSON.';
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return fallback;
}
