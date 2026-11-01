import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCommands, type Command } from '../src/lib/commands.ts';
import { buildCommands, type CommandActions } from '../src/lib/command-registry.ts';
import { sampleBoard } from '../src/lib/sample.ts';
import { addColumn } from '../src/lib/model.ts';
function registry() {
  const calls: { action: string; args: unknown[] }[] = [];
  const actions = new Proxy({} as CommandActions, { get: (_, key) => (...args: unknown[]) => { calls.push({ action: String(key), args }); } });
  return { commands: buildCommands(sampleBoard(), 'all', null, actions), calls, actions };
}
test('empty command query preserves root order for predictable keyboard selection', () => {
  const { commands } = registry();
  assert.equal(findCommands(commands, '')[0].command.id, 'new-task');
});
test('search finds a nested task destination and dispatches the correct action', () => {
  const { commands, calls } = registry();
  const result = findCommands(commands, 'move homepage done').find(r => r.command.run);
  assert(result);
  result.command.run!();
  assert.deepEqual(calls, [{ action: 'moveColumn', args: ['sample-4', 'done'] }]);
});
test('task names and appearance commands can be found directly', () => {
  const { commands, calls } = registry();
  findCommands(commands, 'dark')[0].command.run!();
  assert.deepEqual(calls[0], { action: 'theme', args: ['dark'] });
  const edit = findCommands(commands, 'Sketch the Today view').find(r => r.command.id === 'edit-sample-1');
  assert(edit); edit.command.run!();
  assert.deepEqual(calls[1], { action: 'editTask', args: ['sample-1'] });
});
test('core column removal and editing Done tasks are unavailable in the palette', () => {
  const { commands, actions } = registry();
  assert.equal(commands.some(c => c.id === 'remove-column'), false);
  assert.equal(commands.find(c => c.id === 'edit-task')!.children!.some(c => c.id === 'edit-sample-3'), false);
  const custom = buildCommands(addColumn(sampleBoard(), 'Review'), 'all', null, actions).find(c => c.id === 'remove-column')!;
  assert.deepEqual(custom.children!.map(c => c.label), ['Review']);
});
test('destructive commands dispatch to confirmation actions', () => {
  const { commands, calls } = registry();
  const deletion = commands.find(c => c.id === 'delete')!.children![0];
  deletion.run!();
  commands.find(c => c.id === 'clear-today')!.run!();
  assert.deepEqual(calls.map(c => c.action), ['deleteTask', 'clearToday']);
});

test('a one-project board has no unusable task-to-project command branches', () => {
  const { actions } = registry();
  const board = sampleBoard();
  board.projects = board.projects.slice(0, 1);
  board.tasks = board.tasks.filter(task => task.projectId === board.projects[0].id);
  const commands = buildCommands(board, 'all', null, actions);
  assert.equal(commands.some(command => command.id === 'move-project'), false);
  function check(items: Command[]) {
    for (const command of items) {
      assert(command.run || command.children?.length, `Dead end: ${command.id}`);
      if (command.children) check(command.children);
    }
  }
  check(commands);
});
