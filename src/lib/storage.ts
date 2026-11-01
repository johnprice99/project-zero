import { BoardFormatError, decodeAnyBoard, decodeBoard, encodeBoard } from './codec.ts';
import type { Board } from './model.ts';

// Where the board is kept: a file, by Rust (tauri-storage.ts); the tests use one in memory.
// It holds the JSON board document with a revision number.
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
}
export interface BackupInfo {
  id: string;
  savedAt: number;
  reason: string;
}
export class ConflictError extends Error {}
export type LoadSource = 'saved' | 'upgraded' | 'empty';

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
  let loading = false;
  // The most recent save's failure; cleared by the next successful save.
  let lastError: unknown = null;

  // Never write a board that would fail to load next time.
  function encodeChecked(board: Board): string {
    const contents = JSON.stringify(encodeBoard(board));
    try {
      decodeBoard(JSON.parse(contents));
    } catch (error) {
      const problem = error instanceof BoardFormatError ? ` (${error.message})` : '';
      throw new Error(`This change would leave the board unreadable, so it was not saved${problem}.`);
    }
    return contents;
  }

  async function drain(): Promise<void> {
    draining = true;
    while (queue.length) {
      const job = queue.shift()!;
      try {
        const contents = encodeChecked(job.board);
        revision = job.kind === 'replace' ? await backend.replace(contents) : await backend.save(revision!, contents);
        saved = job.board;
        lastError = null;
        for (const waiter of job.waiters) waiter.resolve();
      } catch (error) {
        lastError = error;
        const abandoned = queue.flatMap(queued => queued.waiters);
        queue = [];
        for (const waiter of [...job.waiters, ...abandoned]) waiter.reject(error);
      }
    }
    draining = false;
  }
  function schedule(kind: Job['kind'], board: Board): Promise<void> {
    if (loading) return Promise.reject(new Error('The saved board is being reloaded. Try again.'));
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
      // New saves are refused until the load finishes, and saves already queued finish first.
      loading = true;
      try {
        while (draining) await idle;
        revision = null;
        saved = null;
        const file = await backend.load();
        if (file) {
          const { board, upgraded } = decodeAnyBoard(JSON.parse(file.contents));
          [revision, saved] = [file.revision, board];
          return { board, source: upgraded ? 'upgraded' : 'saved' };
        }
        revision = 0;
        return { board: null, source: 'empty' };
      } finally {
        loading = false;
      }
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
    // Waits for every pending save. `saved` is false when the most recent save failed,
    // so the latest changes are not on disk (quitting asks before losing them).
    async flush(): Promise<{ saved: boolean; error: unknown }> {
      while (draining) await idle;
      return { saved: lastError === null, error: lastError };
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
