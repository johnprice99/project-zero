import { BoardFormatError, decodeBoard, encodeBoard, SCHEMA } from './codec.ts';
import type { Board } from './model.ts';

// Where the board is kept: a file, by Rust (tauri-storage.ts); the tests use one in memory.
// It holds the JSON board document with a revision number.
export interface StorageBackend {
  load(): Promise<{ revision: number; contents: string } | null>;
  // Refuses with ConflictError unless the stored revision still matches.
  save(expectedRevision: number, contents: string): Promise<number>;
}
export class ConflictError extends Error {}
export type LoadSource = 'saved' | 'upgraded' | 'empty';

interface Waiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}
interface Job {
  board: Board;
  waiters: Waiter[];
}

// Saves run one at a time, in order. Changes made while a save is running are combined
// into the next save. If a save fails, the queued changes built on it are abandoned too,
// so the caller can return to the last saved board.
export function createBoardStore(backend: StorageBackend) {
  let revision: number | null = null;
  let saved: Board | null = null;
  let next: Job | null = null;
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
    while (next) {
      const job = next;
      next = null;
      try {
        revision = await backend.save(revision!, encodeChecked(job.board));
        saved = job.board;
        lastError = null;
        for (const waiter of job.waiters) waiter.resolve();
      } catch (error) {
        lastError = error;
        // Changes queued during the failed save were built on it.
        const abandoned = (next as Job | null)?.waiters ?? [];
        next = null;
        for (const waiter of [...job.waiters, ...abandoned]) waiter.reject(error);
      }
    }
    draining = false;
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
        if (!file) {
          revision = 0;
          return { board: null, source: 'empty' };
        }
        const doc = JSON.parse(file.contents) as { schema?: unknown };
        const board = decodeBoard(doc);
        [revision, saved] = [file.revision, board];
        return { board, source: doc.schema === SCHEMA ? 'saved' : 'upgraded' };
      } finally {
        loading = false;
      }
    },
    save(board: Board): Promise<void> {
      if (loading) return Promise.reject(new Error('The saved board is being reloaded. Try again.'));
      if (revision === null) return Promise.reject(new Error('The saved board has not been loaded.'));
      return new Promise((resolve, reject) => {
        if (next) {
          next.board = board;
          next.waiters.push({ resolve, reject });
        } else next = { board, waiters: [{ resolve, reject }] };
        if (!draining) idle = drain();
      });
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
  };
}
export type BoardStore = ReturnType<typeof createBoardStore>;
