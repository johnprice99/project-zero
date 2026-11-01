import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteProject,
  projectColors,
  addTask,
  reorderTask,
  clearToday,
  saveProject,
  protectedColumn,
  deleteTasks,
  setCollapsed,
  removeColumn,
  addColumn,
  renameColumn,
  lane,
  moveTask,
  toggleToday,
  patchTask,
} from '../src/lib/model.ts';
import { decodeBoard, encodeBoard } from '../src/lib/codec.ts';
import { sampleBoard } from './sample.ts';

test('Today ordering is independent of project ordering', () => {
  const original = sampleBoard();
  const first = lane(original, 'today', 'todo')[0];
  const last = lane(original, 'today', 'todo').at(-1)!;
  const next = moveTask(original, last.id, 'todo', 'today', undefined, first.id);
  assert.equal(lane(next, 'today', 'todo')[0].id, last.id);
  assert.deepEqual(
    next.tasks.map(t => t.order),
    original.tasks.map(t => t.order),
  );
  assert.deepEqual(
    next.tasks.map(t => t.projectId),
    original.tasks.map(t => t.projectId),
  );
});
test('moving a task changes the shared status without duplicating it', () => {
  const original = sampleBoard();
  const next = moveTask(original, 'sample-1', 'doing', 'today');
  assert.equal(next.tasks.length, original.tasks.length);
  assert(lane(next, 'all', 'doing', 'zero').some(t => t.id === 'sample-1'));
  assert(lane(next, 'today', 'doing').some(t => t.id === 'sample-1'));
});
test('moving between projects preserves Today membership and position when status is unchanged', () => {
  const board = sampleBoard();
  const next = moveTask(board, 'sample-1', 'todo', 'all', 'docs');
  assert.equal(next.tasks.find(t => t.id === 'sample-1')!.projectId, 'docs');
  assert.equal(next.tasks.find(t => t.id === 'sample-1')!.today, true);
  assert.equal(next.tasks.find(t => t.id === 'sample-1')!.todayOrder, board.tasks.find(t => t.id === 'sample-1')!.todayOrder);
  assert.equal(new Set(lane(next, 'all', 'todo', 'docs').map(t => t.order)).size, lane(next, 'all', 'todo', 'docs').length);
});
test('removing from Today leaves the task and project order intact', () => {
  const original = sampleBoard();
  const next = toggleToday(original, 'sample-1');
  assert.equal(next.tasks.find(t => t.id === 'sample-1')!.today, false);
  assert.equal(next.tasks.length, original.tasks.length);
  assert.deepEqual(
    next.tasks.map(t => t.order),
    original.tasks.map(t => t.order),
  );
});
test('quick capture creates one trimmed task in the requested lane and view', () => {
  const next = addTask(sampleBoard(), '  Test the board  ', 'web', 'today', 'doing');
  const task = next.tasks.at(-1)!;
  assert.equal(task.title, 'Test the board');
  assert.equal(task.projectId, 'web');
  assert.equal(task.status, 'doing');
  assert.equal(task.today, true);
  assert.equal(addTask(next, '  ', 'web', 'all'), next);
});
test('editing a task updates the same object represented in both views', () => {
  const original = sampleBoard();
  const next = patchTask(original, 'sample-1', { title: 'Revised title', notes: 'A useful next step' });
  assert.equal(lane(next, 'today', 'todo')[0].title, 'Revised title');
  assert.equal(lane(next, 'all', 'todo', 'zero')[0].notes, 'A useful next step');
  assert.equal(original.tasks.find(t => t.id === 'sample-1')!.title, 'Sketch the Today view');
});
test('dropping a card on itself has no effect', () => {
  const board = sampleBoard();
  assert.equal(moveTask(board, 'sample-1', 'todo', 'all', 'zero', 'sample-1'), board);
});

test('blocking is independent of status, Today membership, and priority', () => {
  const original = sampleBoard();
  const next = patchTask(original, 'sample-0', { blocked: true });
  const task = next.tasks.find(t => t.id === 'sample-0')!;
  assert.equal(task.status, 'doing');
  assert.equal(task.blocked, true);
  assert.equal(task.today, true);
  assert.equal(task.order, original.tasks[0].order);
  assert.equal(task.todayOrder, original.tasks[0].todayOrder);
  assert.equal(task.notes, original.tasks[0].notes);
});
test('completing a blocked task clears its blocker without changing its notes', () => {
  const board = sampleBoard();
  const next = moveTask(board, 'sample-6', 'done', 'all', 'web');
  const task = next.tasks.find(t => t.id === 'sample-6')!;
  assert.equal(task.blocked, false);
  assert.equal(task.notes, board.tasks[6].notes);
});

test('renaming a column preserves its tasks and completion behaviour', () => {
  const board = sampleBoard();
  const renamed = renameColumn(board, 'done', 'Finished');
  assert.equal(renamed.columns.find(c => c.id === 'done')!.name, 'Finished');
  assert.deepEqual(renamed.tasks, board.tasks);
  const completed = moveTask(renamed, 'sample-6', 'done', 'all');
  assert.equal(completed.tasks[6].blocked, false);
});
test('new columns accept tasks and appear before completed work', () => {
  const board = addColumn(sampleBoard(), 'Review');
  const column = board.columns[2];
  assert.equal(column.name, 'Review');
  assert.equal(board.columns[3].id, 'done');
  const next = moveTask(board, 'sample-0', column.id, 'today');
  assert.equal(lane(next, 'today', column.id)[0].id, 'sample-0');
  assert.equal(addColumn(board, 'review'), board);
  assert.equal(renameColumn(board, column.id, '  '), board);
});

test('deleting tasks removes only the selected cards without retaining a recovery list', () => {
  const original = sampleBoard();
  const ids = original.tasks.filter(t => t.status === original.completedColumnId).map(t => t.id);
  const next = deleteTasks(original, ids);
  assert.deepEqual(
    next.tasks,
    original.tasks.filter(t => !ids.includes(t.id)),
  );
  assert.equal('deletedTasks' in next, false);
  assert.equal(original.tasks.length, 10);
});
test('removing an occupied custom column moves its tasks without loss', () => {
  let original = addColumn(sampleBoard(), 'Review');
  const reviewId = original.columns.find(c => c.name === 'Review')!.id;
  original = moveTask(original, 'sample-6', reviewId, 'all');
  const next = removeColumn(original, reviewId, 'todo');
  assert.equal(next.columns.length, 3);
  assert.equal(next.tasks.length, original.tasks.length);
  assert.equal(
    next.tasks.some(t => t.status === reviewId),
    false,
  );
  assert.equal(next.tasks.find(t => t.id === 'sample-6')!.blocked, true);
  assert.equal(new Set(lane(next, 'all', 'todo', 'zero').map(t => t.order)).size, lane(next, 'all', 'todo', 'zero').length);
});
test('all three core columns are protected even after renaming', () => {
  const board = renameColumn(addColumn(sampleBoard(), 'Review'), 'doing', 'In progress');
  for (const id of ['todo', 'doing', 'done']) {
    assert.equal(protectedColumn(board, id), true);
    assert.equal(removeColumn(board, id, board.columns.find(c => c.id !== id)!.id), board);
  }
});
test('clearing Today changes only membership, including tasks across projects', () => {
  const board = sampleBoard();
  const next = clearToday(board);
  assert.equal(
    next.tasks.some(t => t.today),
    false,
  );
  assert.equal(next.tasks.length, board.tasks.length);
  assert.deepEqual(
    next.tasks.map(({ today, ...rest }) => rest),
    board.tasks.map(({ today, ...rest }) => rest),
  );
});
test('project edits preserve task references and custom colours', () => {
  const board = sampleBoard();
  const next = saveProject(board, 'web', 'Personal website', '#123abc');
  assert.deepEqual(next.tasks, board.tasks);
  assert.equal(next.projects.find(p => p.id === 'web')!.color, '#123abc');
  assert.equal(saveProject(board, 'web', 'Project Zero', 'sage'), board);
  assert.equal(saveProject(board, 'web', 'Website', 'invalid-colour'), board);
  assert.equal(saveProject(board, null, 'New project', 'sand').projects.length, board.projects.length + 1);
});
test('collapse preferences are deduplicated and ignore unknown projects', () => {
  const next = setCollapsed(sampleBoard(), ['zero', 'web', 'zero', 'unknown']);
  assert.deepEqual(next.collapsedProjects, ['zero', 'web']);
});

test('keyboard priority changes in Today preserve project-board order', () => {
  const original = sampleBoard();
  const next = reorderTask(original, 'sample-7', 'top', 'today');
  assert.equal(lane(next, 'today', 'todo')[0].id, 'sample-7');
  assert.deepEqual(
    next.tasks.map(t => t.order),
    original.tasks.map(t => t.order),
  );
  const down = reorderTask(next, 'sample-7', 'down', 'today');
  assert.equal(lane(down, 'today', 'todo').at(-1)!.id, 'sample-7');
});

test('deleting a project removes all its tasks while preserving other projects', () => {
  const original = setCollapsed(sampleBoard(), ['zero', 'web']);
  const next = deleteProject(original, 'zero');
  assert.equal(
    next.projects.some(p => p.id === 'zero'),
    false,
  );
  assert.equal(
    next.tasks.some(t => t.projectId === 'zero'),
    false,
  );
  assert.deepEqual(next.collapsedProjects, ['web']);
  assert.deepEqual(
    next.tasks,
    original.tasks.filter(t => t.projectId !== 'zero'),
  );
  assert.equal(deleteProject(original, 'missing'), original);
  assert.deepEqual(decodeBoard(JSON.parse(JSON.stringify(encodeBoard(next)))), next);
});
test('deleting the last project leaves a valid empty board that can create projects again', () => {
  let board = sampleBoard();
  for (const project of board.projects) board = deleteProject(board, project.id);
  assert.equal(board.tasks.length, 0);
  assert.equal(board.projects.length, 0);
  const restored = decodeBoard(JSON.parse(JSON.stringify(encodeBoard(board))));
  assert.deepEqual(restored, board);
  const next = saveProject(restored, null, 'Fresh project', 'sky');
  assert.equal(next.projects.length, 1);
  assert.equal(addTask(next, 'First task', next.projects[0].id, 'all').tasks.length, 1);
});
test('every preset project colour survives saving and loading', () => {
  for (const preset of projectColors) {
    const board = saveProject(sampleBoard(), 'web', 'Website', preset.id);
    assert.equal(
      decodeBoard(JSON.parse(JSON.stringify(encodeBoard(board)))).projects.find(p => p.id === 'web')!.color,
      preset.id,
    );
  }
});

test('column renaming trims once, rejects collisions, and does not rewrite unchanged names', () => {
  const board = sampleBoard();
  assert.equal(renameColumn(board, 'todo', ' To do '), board);
  assert.equal(renameColumn(board, 'todo', ' done '), board);
  assert.equal(renameColumn(board, 'todo', '  Next  ').columns[0].name, 'Next');
});
test('task titles are validated consistently during creation and editing', () => {
  const board = sampleBoard();
  assert.equal(addTask(board, 'a'.repeat(301), 'zero', 'all'), board);
  assert.equal(patchTask(board, 'sample-0', { title: 'a'.repeat(301) }), board);
  assert.equal(patchTask(board, 'missing', { title: 'Valid' }), board);
  assert.equal(patchTask(board, 'sample-0', { title: '  Trimmed title  ' }).tasks[0].title, 'Trimmed title');
});

test('mixed drag and keyboard operations preserve task data and unique priority positions', () => {
  let board = addColumn(sampleBoard(), 'Review');
  const original = new Map(board.tasks.map(task => [task.id, { title: task.title, notes: task.notes }]));
  let seed = 42;
  const choose = <T>(items: readonly T[]): T => {
    assert(items.length);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return items[seed % items.length];
  };
  for (let step = 0; step < 300; step++) {
    const task = choose(board.tasks);
    const view = choose(['all', 'today'] as const);
    if (step % 3 === 0) board = toggleToday(board, task.id);
    else if (step % 3 === 1) board = reorderTask(board, task.id, choose(['top', 'up', 'down', 'bottom']), view);
    else {
      const column = choose(board.columns).id;
      const project = choose(board.projects).id;
      const candidates = lane(board, view, column, view === 'all' ? project : undefined);
      const before = candidates.length ? choose(candidates).id : undefined;
      board = moveTask(board, task.id, column, view, project, before);
    }
    assert.equal(board.tasks.length, original.size);
    for (const task of board.tasks) {
      assert.deepEqual({ title: task.title, notes: task.notes }, original.get(task.id));
      assert(!(task.status === board.completedColumnId && task.blocked));
    }
    for (const column of board.columns) {
      const today = lane(board, 'today', column.id);
      assert.equal(new Set(today.map(task => task.todayOrder)).size, today.length);
      for (const project of board.projects) {
        const tasks = lane(board, 'all', column.id, project.id);
        assert.equal(new Set(tasks.map(task => task.order)).size, tasks.length);
      }
    }
    assert.deepEqual(decodeBoard(JSON.parse(JSON.stringify(encodeBoard(board)))), board);
  }
});
