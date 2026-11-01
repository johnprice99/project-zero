import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommitter } from '../src/lib/commit.ts';
import { createBoardStore } from '../src/lib/storage.ts';
import { controlledBackend } from './backends.ts';
import { sampleBoard } from '../src/lib/sample.ts';
import { deleteTasks, patchTask } from '../src/lib/model.ts';

const settle = () => new Promise(resolve => setImmediate(resolve));

// A board on screen, a store, and a backend whose saves finish when the test says so.
async function session() {
  const { backend, saves } = controlledBackend();
  const store = createBoardStore(backend);
  await store.load();
  let board = sampleBoard();
  const first = store.save(board);
  await settle();
  saves[0].finish();
  await first;
  const commit = createCommitter(store, { get: () => board, set: next => (board = next) });
  return { commit, saves, store, screen: () => board };
}

test('a change made while a deletion is saving does not bring the task back', async () => {
  const { commit, saves, store, screen } = await session();
  const deletion = commit(b => deleteTasks(b, ['sample-0']));
  const edit = commit(b => patchTask(b, 'sample-1', { title: 'Edited during the delete' }));
  assert.equal(
    screen().tasks.some(t => t.id === 'sample-0'),
    false,
    'the deletion shows immediately',
  );
  await settle();
  saves[1].finish();
  await settle();
  saves[2].finish();
  assert.deepEqual(await Promise.all([deletion, edit]), [{ ok: true }, { ok: true }]);
  for (const board of [saves[2].board, store.saved()!, screen()]) {
    assert.equal(
      board.tasks.some(t => t.id === 'sample-0'),
      false,
    );
    assert.equal(board.tasks.find(t => t.id === 'sample-1')!.title, 'Edited during the delete');
  }
});

test('a failed deletion returns the task and abandons the change queued behind it', async () => {
  const { commit, saves, screen } = await session();
  const deletion = commit(b => deleteTasks(b, ['sample-0']));
  const edit = commit(b => patchTask(b, 'sample-1', { title: 'Queued' }));
  await settle();
  saves[1].fail(new Error('Disk full'));
  const results = await Promise.all([deletion, edit]);
  assert.deepEqual(
    results.map(r => r.ok),
    [false, false],
  );
  assert.deepEqual(screen(), sampleBoard());
  assert.equal(saves.length, 2, 'the queued change is not written');
});

test('a change that changes nothing is not saved', async () => {
  const { commit, saves } = await session();
  assert.deepEqual(await commit(b => b), { ok: false, error: null });
  assert.equal(saves.length, 1);
});

test('flush reports a failed latest save until a later save succeeds', async () => {
  const { commit, saves, store } = await session();
  assert.deepEqual(await store.flush(), { saved: true, error: null });
  const failing = commit(b => patchTask(b, 'sample-0', { title: 'Fails' }));
  await settle();
  saves[1].fail(new Error('Disk full'));
  await failing;
  const after = await store.flush();
  assert.equal(after.saved, false);
  assert.match(String(after.error), /Disk full/);
  const retry = commit(b => patchTask(b, 'sample-0', { title: 'Retried' }));
  await settle();
  saves[2].finish();
  await retry;
  assert.deepEqual(await store.flush(), { saved: true, error: null });
});
