import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterCommands, orderByRecent, rememberRecent, score, type Command } from '../src/lib/commands.ts';
import { buildCommands, type CommandActions } from '../src/lib/command-registry.ts';
import { sampleBoard } from '../src/lib/sample.ts';
import { addColumn } from '../src/lib/model.ts';
function registry() {
  const calls: { action: string; args: unknown[] }[] = [];
  const actions = new Proxy({} as CommandActions, {
    get:
      (_, key) =>
      (...args: unknown[]) => {
        calls.push({ action: String(key), args });
      },
  });
  return { commands: buildCommands(sampleBoard(), 'all', null, actions, { theme: 'dark' }), calls, actions };
}
const child = (items: Command[], id: string) => items.find(c => c.id === id)!.children!;
test('an empty query keeps the usual order for predictable keyboard selection', () => {
  const { commands } = registry();
  assert.equal(filterCommands(commands, '')[0].id, 'new-task');
});
test('matching is fuzzy and prefers word starts and runs of letters', () => {
  assert.equal(score('xyz', 'New task'), null);
  assert(score('nt', 'New task')! > score('nt', 'Done items')!);
  const { commands } = registry();
  assert.equal(filterCommands(commands, 'gtod')[0].id, 'today');
  assert.equal(filterCommands(commands, 'settings')[0].id, 'settings');
});
test('choosing a task and then a destination dispatches the move', () => {
  const { commands, calls } = registry();
  const task = filterCommands(child(commands, 'move-column'), 'homepage')[0];
  assert.equal(task.id, 'move-sample-4');
  assert.match(task.placeholder!, /Move “Build the homepage layout” to/);
  filterCommands(task.children!, 'done')[0].run!();
  assert.deepEqual(calls, [{ action: 'moveColumn', args: ['sample-4', 'done'] }]);
});
test('appearance choices are listed by name with a tick on the current one', () => {
  const { commands, calls } = registry();
  const dark = filterCommands(commands, 'appearance dark')[0];
  assert.equal(dark.label, 'Appearance: Dark');
  assert.equal(dark.hint, '✓');
  assert.equal(commands.find(c => c.id === 'theme-light')!.hint, undefined);
  dark.run!();
  assert.deepEqual(calls[0], { action: 'theme', args: ['dark'] });
});
test('task names are matched within a list', () => {
  const { commands, calls } = registry();
  filterCommands(child(commands, 'edit-task'), 'Sketch the Today view')[0].run!();
  assert.deepEqual(calls[0], { action: 'editTask', args: ['sample-1'] });
});
test('recently used commands come first, most recent first, up to eight', () => {
  const { commands } = registry();
  let recent: string[] = [];
  for (const id of ['settings', 'today', 'new-project']) recent = rememberRecent(recent, id);
  recent = rememberRecent(recent, 'today');
  assert.deepEqual(
    orderByRecent(commands, recent)
      .slice(0, 4)
      .map(c => c.id),
    ['today', 'new-project', 'settings', 'new-task'],
  );
  for (let i = 0; i < 10; i++) recent = rememberRecent(recent, `c${i}`);
  assert.equal(recent.length, 8);
});
test('core column removal and editing Done tasks are unavailable in the palette', () => {
  const { commands, actions } = registry();
  assert.equal(
    commands.some(c => c.id === 'remove-column'),
    false,
  );
  assert.equal(
    commands.find(c => c.id === 'edit-task')!.children!.some(c => c.id === 'edit-sample-3'),
    false,
  );
  const custom = buildCommands(addColumn(sampleBoard(), 'Review'), 'all', null, actions).find(c => c.id === 'remove-column')!;
  assert.deepEqual(
    custom.children!.map(c => c.label),
    ['Review'],
  );
});
test('destructive commands dispatch to confirmation actions', () => {
  const { commands, calls } = registry();
  const deletion = commands.find(c => c.id === 'delete')!.children![0];
  deletion.run!();
  commands.find(c => c.id === 'clear-today')!.run!();
  assert.deepEqual(
    calls.map(c => c.action),
    ['deleteTask', 'clearToday'],
  );
});

test('a one-project board has no unusable task-to-project command branches', () => {
  const { actions } = registry();
  const board = sampleBoard();
  board.projects = board.projects.slice(0, 1);
  board.tasks = board.tasks.filter(task => task.projectId === board.projects[0].id);
  const commands = buildCommands(board, 'all', null, actions);
  assert.equal(
    commands.some(command => command.id === 'move-project'),
    false,
  );
  function check(items: Command[]) {
    for (const command of items) {
      assert(command.run || command.children?.length, `Dead end: ${command.id}`);
      if (command.children) check(command.children);
    }
  }
  check(commands);
});

test('clear all completed tasks is always offered, and the view-only version only when it clears less', () => {
  const { actions, calls, commands } = registry();
  const ids = (items: Command[]) => items.map(c => c.id).filter(id => id.startsWith('clear-'));
  // Sample completed tasks are in Project Zero and Documents & planning.
  assert.deepEqual(ids(commands), ['clear-today', 'clear-all-done']);
  assert.deepEqual(ids(buildCommands(sampleBoard(), 'all', 'zero', actions)), ['clear-today', 'clear-all-done', 'clear-done']);
  assert.deepEqual(ids(buildCommands(sampleBoard(), 'all', 'web', actions)), ['clear-today', 'clear-all-done']);
  const none = sampleBoard();
  none.tasks = none.tasks.filter(t => t.status !== 'done');
  assert.deepEqual(ids(buildCommands(none, 'all', null, actions)), ['clear-today']);
  filterCommands(commands, 'clear all completed')[0].run!();
  assert.deepEqual(calls.at(-1), { action: 'clearAllDone', args: [] });
});

test('help commands are listed', () => {
  const { commands } = registry();
  assert.deepEqual(
    commands.filter(c => c.group === 'Help').map(c => c.label),
    ['About Project Zero', 'Check for Updates…', 'Project Zero Website', 'Report a Problem'],
  );
});
