import { decodeAnyBoard, encodeBoard } from './codec.ts';
import type { Board } from './model.ts';
import { importPrototypeBoard } from './prototype.ts';

// Where the board is kept. The desktop app saves to a file through Rust; the browser
// preview uses localStorage. Both store a JSON board document with a revision number.
export interface StorageBackend {
  load(): Promise<{ revision: number; contents: string } | null>;
  // Refuses with ConflictError unless the stored revision still matches.
  save(expectedRevision: number, contents: string): Promise<number>;
  // Replaces the board for restores. Backs up the current board first.
  replace(contents: string): Promise<number>;
  listBackups(): Promise<BackupInfo[]>;
  readBackup(id: string): Promise<string>;
  // Resolves false when the user cancels.
  exportFile(fileName: string, contents: string): Promise<boolean>;
  importFile(): Promise<string | null>;
  // A board left by the browser prototype, for one-off import.
  prototypeBoard(): string | null;
}
export interface BackupInfo {
  id: string;
  savedAt: number;
  reason: string;
}
export class ConflictError extends Error {}
export type LoadSource = 'saved' | 'upgraded' | 'imported' | 'empty';

interface Waiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}
interface Job {
  kind: 'save' | 'replace';
  board: Board;
  waiters: Waiter[];
}

// Saves run one at a time, in order. Changes made while a save is running are combined
// into the next save. If a save fails, the queued changes built on it are abandoned too,
// so the caller can return to the last saved board.
export function createBoardStore(backend: StorageBackend) {
  let revision: number | null = null;
  let saved: Board | null = null;
  let queue: Job[] = [];
  let idle: Promise<void> = Promise.resolve();
  let draining = false;

  async function drain(): Promise<void> {
    draining = true;
    while (queue.length) {
      const job = queue.shift()!;
      try {
        const contents = JSON.stringify(encodeBoard(job.board));
        revision = job.kind === 'replace' ? await backend.replace(contents) : await backend.save(revision!, contents);
        saved = job.board;
        for (const waiter of job.waiters) waiter.resolve();
      } catch (error) {
        const abandoned = queue.flatMap(queued => queued.waiters);
        queue = [];
        for (const waiter of [...job.waiters, ...abandoned]) waiter.reject(error);
      }
    }
    draining = false;
  }
  function schedule(kind: Job['kind'], board: Board): Promise<void> {
    return new Promise((resolve, reject) => {
      const last = queue.at(-1);
      if (kind === 'save' && last?.kind === 'save') {
        last.board = board;
        last.waiters.push({ resolve, reject });
      } else queue.push({ kind, board, waiters: [{ resolve, reject }] });
      if (!draining) idle = drain();
    });
  }

  return {
    async load(): Promise<{ board: Board | null; source: LoadSource }> {
      await idle;
      revision = null;
      saved = null;
      const file = await backend.load();
      if (file) {
        const { board, upgraded } = decodeAnyBoard(JSON.parse(file.contents));
        [revision, saved] = [file.revision, board];
        return { board, source: upgraded ? 'upgraded' : 'saved' };
      }
      const prototype = backend.prototypeBoard();
      const board = prototype === null ? null : importPrototypeBoard(JSON.parse(prototype));
      revision = 0;
      return { board, source: board ? 'imported' : 'empty' };
    },
    save(board: Board): Promise<void> {
      if (revision === null) return Promise.reject(new Error('The saved board has not been loaded.'));
      return schedule('save', board);
    },
    // Works even when the saved board could not be read, so a backup can recover it.
    replace(board: Board): Promise<void> {
      return schedule('replace', board);
    },
    saved(): Board | null {
      return saved;
    },
    flush(): Promise<void> {
      return idle;
    },
    listBackups(): Promise<BackupInfo[]> {
      return backend.listBackups();
    },
    async readBackup(id: string): Promise<Board> {
      return decodeAnyBoard(JSON.parse(await backend.readBackup(id))).board;
    },
    async importFile(): Promise<Board | null> {
      const contents = await backend.importFile();
      return contents === null ? null : decodeAnyBoard(JSON.parse(contents)).board;
    },
    exportFile(board: Board, date = new Date()): Promise<boolean> {
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return backend.exportFile(`project-zero-${day}.json`, JSON.stringify(encodeBoard(board), null, 2));
    },
  };
}
export type BoardStore = ReturnType<typeof createBoardStore>;
