import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserBackend } from '../src/lib/browser-storage.ts';
import { ConflictError, createBoardStore, type StorageBackend } from '../src/lib/storage.ts';
import { sampleBoard } from '../src/lib/sample.ts';
import { patchTask, type Board } from '../src/lib/model.ts';

const key = 'project-zero.board';
const settle = () => new Promise(resolve => setImmediate(resolve));
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}
const titled = (title: string, board: Board = sampleBoard()) => patchTask(board, 'sample-0', { title });

// A backend whose saves finish only when the test says so.
function controlledBackend() {
  const saves: { board: Board; finish: () => void; fail: (error: Error) => void }[] = [];
  let revision = 0;
  const backend: StorageBackend = {
    load: async () => null,
    save: (_expected, contents) =>
      new Promise((resolve, reject) => {
        saves.push({ board: JSON.parse(contents), finish: () => resolve(++revision), fail: reject });
      }),
    replace: async () => ++revision,
    listBackups: async () => [],
    readBackup: async () => '',
    exportFile: async () => true,
    importFile: async () => null,
    prototypeBoard: () => null,
  };
  return { backend, saves };
}

test('first launch and later saves persist across restarts', async () => {
  const storage = memoryStorage();
  const first = createBoardStore(createBrowserBackend(storage));
  assert.deepEqual(await first.load(), { board: null, source: 'empty' });
  await first.save(sampleBoard());
  await first.save(titled('Second save'));
  assert.deepEqual(await createBoardStore(createBrowserBackend(storage)).load(), {
    board: titled('Second save'),
    source: 'saved',
  });
});

test('an unreadable saved board is never overwritten by normal saves', async () => {
  const storage = memoryStorage();
  storage.values.set(key, '{broken');
  const store = createBoardStore(createBrowserBackend(storage));
  await assert.rejects(store.load());
  await assert.rejects(store.save(sampleBoard()), /not been loaded/);
  assert.equal(storage.values.get(key), '{broken');
  // An explicit restore may replace it, keeping the unreadable copy.
  await store.replace(sampleBoard());
  assert.equal(storage.values.get('project-zero.board.before-restore'), '{broken');
  assert.deepEqual((await store.load()).board, sampleBoard());
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

test('a stale window cannot silently overwrite a newer save', async () => {
  const storage = memoryStorage();
  const first = createBoardStore(createBrowserBackend(storage));
  await first.load();
  await first.save(sampleBoard());
  const second = createBoardStore(createBrowserBackend(storage));
  await second.load();
  await first.save(titled('From the first window'));
  await assert.rejects(second.save(titled('From the stale window')), ConflictError);
  assert.equal((await second.load()).board?.tasks[0].title, 'From the first window');
});

test('a browser prototype board is imported once and left in place', async () => {
  const storage = memoryStorage();
  const prototype = JSON.stringify({ ...sampleBoard(), version: 5, deletedTasks: [] });
  storage.values.set('project-zero.prototype.board.v5', prototype);
  const store = createBoardStore(createBrowserBackend(storage));
  const loaded = await store.load();
  assert.deepEqual(loaded, { board: sampleBoard(), source: 'imported' });
  await store.save(loaded.board!);
  assert.equal(storage.values.get('project-zero.prototype.board.v5'), prototype);
  assert.equal(JSON.parse(storage.values.get(key)!).board.schema, 1);
  assert.equal((await store.load()).source, 'saved');
});
