import { ConflictError, type StorageBackend } from '../src/lib/storage.ts';
import type { Board } from '../src/lib/model.ts';

// Stands in for the Rust board file: saves at once and checks revisions the same way.
// Several stores can share one disk, like two copies of the app.
export interface Disk {
  board: string | null;
  revision: number;
}
export function memoryBackend(disk: Disk = { board: null, revision: 0 }): StorageBackend {
  return {
    load: async () => (disk.board === null ? null : { revision: disk.revision, contents: disk.board }),
    async save(expected, contents) {
      if (expected !== disk.revision) throw new ConflictError('This board was changed elsewhere.');
      disk.board = contents;
      return ++disk.revision;
    },
  };
}

// A backend whose saves finish only when the test says so.
export function controlledBackend() {
  const saves: { board: Board; finish: () => void; fail: (error: Error) => void }[] = [];
  let revision = 0;
  const backend: StorageBackend = {
    load: async () => null,
    save: (_expected, contents) =>
      new Promise((resolve, reject) => {
        saves.push({ board: JSON.parse(contents), finish: () => resolve(++revision), fail: reject });
      }),
  };
  return { backend, saves };
}
