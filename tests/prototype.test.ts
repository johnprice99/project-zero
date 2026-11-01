import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importPrototypeBoard } from '../src/lib/prototype.ts';
import type { Board } from '../src/lib/model.ts';
import { sampleBoard } from '../src/lib/sample.ts';

// Boards saved by the browser prototype carried a version number (1–6).
const v6 = (board: Board) => ({ ...board, version: 6 });
const decodeBoard = importPrototypeBoard;

test('legacy blocked cards migrate into Doing with an independent flag', () => {
  const current = sampleBoard();
  const legacy = { ...current, version: 1, tasks: current.tasks.map(({ blocked, ...t }) => ({ ...t, status: blocked ? 'blocked' : t.status })) };
  const before = JSON.stringify(legacy);
  const migrated = decodeBoard(legacy);
  assert.equal('version' in migrated, false);
  assert.equal(migrated.tasks.length, legacy.tasks.length);
  const blocked = migrated.tasks.find(t => t.id === 'sample-6')!;
  assert.equal(blocked.status, 'doing'); assert.equal(blocked.blocked, true);
  assert.equal(blocked.notes, legacy.tasks[6].notes);
  assert.equal(blocked.today, legacy.tasks[6].today);
  assert.equal(JSON.stringify(legacy), before);
});
test('invalid and future saved formats are rejected', () => {
  assert.throws(() => decodeBoard({ ...sampleBoard(), version: 99 }));
  assert.throws(() => decodeBoard({ ...v6(sampleBoard()), tasks: [{ title: 'incomplete' }] }));
  assert.throws(() => decodeBoard({ ...v6(sampleBoard()), tasks: [...sampleBoard().tasks, sampleBoard().tasks[0]] }));
});
test('current saved format roundtrips through JSON', () => {
  const board = sampleBoard();
  assert.deepEqual(decodeBoard(JSON.parse(JSON.stringify(v6(board)))), board);
});

test('version 2 drafts gain columns without changing task content or order', () => {
  const { columns, ...current } = sampleBoard();
  const legacy = { ...current, version: 2, tasks: current.tasks.map(t => ({ ...t, blockerReason: '' })) };
  const migrated = decodeBoard(legacy);
  assert.equal('version' in migrated, false);
  assert.deepEqual(migrated.columns.map(c => c.id), ['todo', 'doing', 'done']);
  assert.deepEqual(migrated.tasks, current.tasks);
});
test('custom columns and renamed completion column survive save and reload', () => {
  const board = sampleBoard();
  board.columns.splice(2, 0, { id: 'review', name: 'Review' });
  board.columns.find(c => c.id === 'done')!.name = 'Finished';
  board.tasks[0].status = 'review';
  assert.deepEqual(decodeBoard(JSON.parse(JSON.stringify(v6(board)))), board);
  assert.throws(() => decodeBoard({ ...v6(board), columns: board.columns.filter(c => c.id !== 'review') }));
});


test('version 3 gains saved project visibility', () => {
  const current = sampleBoard();
  const { completedColumnId, collapsedProjects, ...old } = current;
  const migrated = decodeBoard({ ...old, version: 3, tasks: old.tasks.map(t => ({ ...t, blockerReason: '' })) });
  assert.equal(migrated.completedColumnId, 'done');
  assert.deepEqual(migrated.collapsedProjects, []);
  assert.deepEqual(migrated.tasks, old.tasks);
});
test('saved collapse preferences roundtrip', () => {
  const board = sampleBoard();
  board.collapsedProjects = ['zero', 'web'];
  assert.deepEqual(decodeBoard(JSON.parse(JSON.stringify(v6(board)))), board);
});


test('custom project colours survive save and reload', () => {
  const board = sampleBoard();
  board.projects[0].color = '#bb22cc';
  assert.deepEqual(decodeBoard(JSON.parse(JSON.stringify(v6(board)))), board);
});
test('core columns removed by earlier versions are restored without losing cards', () => {
  const board = sampleBoard();
  board.columns = board.columns.filter(c => c.id !== 'doing');
  board.tasks = board.tasks.map(t => t.status === 'doing' ? { ...t, status: 'todo' } : t);
  const migrated = decodeBoard(v6(board));
  assert(migrated.columns.some(c => c.id === 'doing'));
  assert.deepEqual(migrated.tasks, board.tasks);
});


test('old blocker text is preserved once and the removed recovery list is discarded', () => {
  const board = sampleBoard();
  const tasks = board.tasks.map(t => ({ ...t, blockerReason: t.id === 'sample-0' ? 'Waiting for approval' : t.id === 'sample-6' ? t.notes : '' }));
  const deleted = { ...tasks.pop()!, blockerReason: 'An old blocker' };
  const legacy = { ...board, version: 4, tasks, deletedTasks: [deleted] };
  const migrated = decodeBoard(legacy);
  assert.equal(migrated.tasks[0].notes, tasks[0].notes + '\n\nWaiting for approval');
  assert.equal(migrated.tasks.find(t => t.id === 'sample-6')!.notes, board.tasks[6].notes);
  assert.equal('deletedTasks' in migrated, false);
  assert.equal(migrated.tasks.length, tasks.length);
  assert.equal('blockerReason' in migrated.tasks[0], false);
  assert.deepEqual(decodeBoard(JSON.parse(JSON.stringify(v6(migrated)))), migrated);
});

test('malformed task details fail validation with a useful error', () => {
  const board = sampleBoard();
  for (const patch of [{ title: '  ' }, { title: 'a'.repeat(301) }, { blockerReason: 42 }, { projectId: 'missing' }, { order: Infinity }]) {
    assert.throws(() => decodeBoard({ ...v6(board), tasks: [{ ...board.tasks[0], ...patch }] }), /Invalid saved tasks/);
  }
  assert.throws(() => decodeBoard({ ...v6(board), projects: [{ ...board.projects[0], id: '' }] }), /Invalid saved projects/);
});
test('restoring missing core columns cannot introduce duplicate names or break the next restart', () => {
  const board = sampleBoard();
  board.columns = [{ id: 'todo', name: 'To do' }, { id: 'review', name: 'Doing' }, { id: 'done', name: 'Done' }];
  board.tasks = board.tasks.map(task => task.status === 'doing' ? { ...task, status: 'review' } : task);
  const migrated = decodeBoard(v6(board));
  assert.equal(migrated.columns.find(column => column.id === 'doing')!.name, 'Doing (restored)');
  assert.deepEqual(migrated.tasks, board.tasks);
  assert.deepEqual(decodeBoard(JSON.parse(JSON.stringify(v6(migrated)))), migrated);
});
test('column-name duplicates are compared after trimming and ignoring case', () => {
  const board = sampleBoard();
  board.columns[1].name = ' to DO ';
  assert.throws(() => decodeBoard(v6(board)), /Invalid saved columns/);
});
