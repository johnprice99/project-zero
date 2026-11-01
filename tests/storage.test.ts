import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoardStorage } from '../src/lib/storage.ts';
import { sampleBoard } from '../src/lib/sample.ts';
import { patchTask } from '../src/lib/model.ts';

const key = 'project-zero.prototype.board.v6';
function memoryStorage() {
  const values = new Map<string, string>();
  let failWrites = false;
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem(key: string, value: string) {
      if (failWrites) throw new Error('Disk full');
      values.set(key, value);
    },
    failWrites: (value: boolean) => { failWrites = value; },
  };
}

test('first launch and subsequent saves persist across adapter restarts', () => {
  const storage = memoryStorage();
  const first = createBoardStorage(storage);
  assert.equal(first.read(), null);
  first.write(sampleBoard());
  assert.deepEqual(createBoardStorage(storage).read(), sampleBoard());
});
test('invalid current data is preserved and never replaced by an older draft', () => {
  const storage = memoryStorage();
  storage.values.set(key, '{broken');
  storage.values.set('project-zero.prototype.board.v5', JSON.stringify({ ...sampleBoard(), version: 5 }));
  const adapter = createBoardStorage(storage);
  assert.throws(() => adapter.read());
  assert.throws(() => adapter.write(sampleBoard()), /Read the saved board/);
  assert.equal(storage.values.get(key), '{broken');
});
test('a failed write preserves the saved board and can be retried', () => {
  const storage = memoryStorage();
  const adapter = createBoardStorage(storage);
  adapter.read();
  adapter.write(sampleBoard());
  const next = patchTask(sampleBoard(), 'sample-0', { title: 'Saved only after retry' });
  storage.failWrites(true);
  assert.throws(() => adapter.write(next), /Disk full/);
  assert.deepEqual(JSON.parse(storage.values.get(key)!), sampleBoard());
  storage.failWrites(false);
  adapter.write(next);
  assert.deepEqual(createBoardStorage(storage).read(), next);
});
test('a stale window cannot silently overwrite a newer save', () => {
  const storage = memoryStorage();
  const first = createBoardStorage(storage);
  first.read(); first.write(sampleBoard());
  const second = createBoardStorage(storage);
  const stale = second.read()!;
  const updated = patchTask(sampleBoard(), 'sample-0', { title: 'From first window' });
  first.write(updated);
  assert.throws(() => second.write(patchTask(stale, 'sample-1', { title: 'From stale window' })), /another window/);
  assert.deepEqual(createBoardStorage(storage).read(), updated);
  second.read(); second.write(updated);
});
test('legacy migration keeps the original draft and writes the current version separately', () => {
  const storage = memoryStorage();
  const legacyKey = 'project-zero.prototype.board.v5';
  const legacy = JSON.stringify({ ...sampleBoard(), version: 5, deletedTasks: [] });
  storage.values.set(legacyKey, legacy);
  const adapter = createBoardStorage(storage);
  const migrated = adapter.read()!;
  adapter.write(migrated);
  assert.equal(storage.values.get(legacyKey), legacy);
  assert.equal(JSON.parse(storage.values.get(key)!).version, 6);
});
