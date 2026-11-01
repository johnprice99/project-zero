import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError, createBoardStore } from '../src/lib/storage.ts';
import { sampleBoard } from './sample.ts';
import { patchTask, type Board } from '../src/lib/model.ts';
import { controlledBackend, memoryBackend, type Disk } from './backends.ts';

const settle = () => new Promise(resolve => setImmediate(resolve));
const titled = (title: string, board: Board = sampleBoard()) => patchTask(board, 'sample-0', { title });
const disk = (): Disk => ({ board: null, revision: 0 });

test('first launch and later saves persist across restarts', async () => {
  const shared = disk();
  const first = createBoardStore(memoryBackend(shared));
  assert.deepEqual(await first.load(), { board: null, source: 'empty' });
  await first.save(sampleBoard());
  await first.save(titled('Second save'));
  assert.deepEqual(await createBoardStore(memoryBackend(shared)).load(), { board: titled('Second save'), source: 'saved' });
});

test('an unreadable saved board is never overwritten by normal saves', async () => {
  const shared = { ...disk(), board: '{broken' };
  const store = createBoardStore(memoryBackend(shared));
  await assert.rejects(store.load());
  await assert.rejects(store.save(sampleBoard()), /not been loaded/);
  assert.equal(shared.board, '{broken');
});

test('saves run in order and changes made during a save are combined', async () => {
  const { backend, saves } = controlledBackend();
  const store = createBoardStore(backend);
  await store.load();
  const done: string[] = [];
  const first = store.save(titled('A')).then(() => done.push('A'));
  const second = store.save(titled('B')).then(() => done.push('B'));
  const third = store.save(titled('C')).then(() => done.push('C'));
  await settle();
  assert.equal(saves.length, 1);
  saves[0].finish();
  await first;
  await settle();
  assert.equal(saves.length, 2, 'B and C are written together');
  assert.equal(saves[1].board.tasks[0].title, 'C');
  saves[1].finish();
  await Promise.all([second, third]);
  assert.deepEqual(done, ['A', 'B', 'C']);
  assert.equal(store.saved()?.tasks[0].title, 'C');
});

test('a failed save abandons the changes queued behind it and keeps the last saved board', async () => {
  const { backend, saves } = controlledBackend();
  const store = createBoardStore(backend);
  await store.load();
  await Promise.all([store.save(titled('Saved')), settle().then(() => saves[0].finish())]);
  const failing = store.save(titled('Fails'));
  const queued = store.save(titled('Built on the failed change'));
  await settle();
  saves[1].fail(new Error('Disk full'));
  await assert.rejects(failing, /Disk full/);
  await assert.rejects(queued, /Disk full/);
  assert.equal(saves.length, 2, 'the queued change is not written');
  assert.equal(store.saved()?.tasks[0].title, 'Saved');
  // Saving works again afterwards.
  const retry = store.save(titled('Retried'));
  await settle();
  saves[2].finish();
  await retry;
  assert.equal(store.saved()?.tasks[0].title, 'Retried');
});

test('flush waits for pending saves', async () => {
  const { backend, saves } = controlledBackend();
  const store = createBoardStore(backend);
  await store.load();
  void store.save(titled('Pending'));
  let flushed = false;
  void store.flush().then(() => (flushed = true));
  await settle();
  assert.equal(flushed, false);
  saves[0].finish();
  await settle();
  assert.equal(flushed, true);
});

test('a stale copy cannot silently overwrite a newer save', async () => {
  const shared = disk();
  const first = createBoardStore(memoryBackend(shared));
  await first.load();
  await first.save(sampleBoard());
  const second = createBoardStore(memoryBackend(shared));
  await second.load();
  await first.save(titled('From the first copy'));
  await assert.rejects(second.save(titled('From the stale copy')), ConflictError);
  assert.equal((await second.load()).board?.tasks[0].title, 'From the first copy');
});

test('a board that would not load again is never written', async () => {
  const shared = disk();
  const store = createBoardStore(memoryBackend(shared));
  await store.load();
  await store.save(sampleBoard());
  const broken = { ...sampleBoard(), tasks: [...sampleBoard().tasks, sampleBoard().tasks[0]] };
  await assert.rejects(store.save(broken), /would leave the board unreadable.*duplicate id/);
  assert.deepEqual((await createBoardStore(memoryBackend(shared)).load()).board, sampleBoard());
});

test('reloading waits for the save in progress and refuses new saves until it finishes', async () => {
  const { backend, saves } = controlledBackend();
  const store = createBoardStore(backend);
  await store.load();
  const inProgress = store.save(titled('In progress'));
  await settle();
  let reloaded = false;
  const reload = store.load().then(() => (reloaded = true));
  await assert.rejects(store.save(titled('During reload')), /being reloaded/);
  await settle();
  assert.equal(reloaded, false, 'the reload waits for the save');
  saves[0].finish();
  await Promise.all([inProgress, reload]);
  assert.equal(saves.length, 1);
});
