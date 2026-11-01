import type { Board } from './model.ts';
import { decodeBoard } from './codec.ts';

const KEY = 'project-zero.prototype.board.v6';
const OLD_KEYS = [5, 4, 3, 2, 1].map(v => `project-zero.prototype.board.v${v}`);
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;

// Keep the adapter independent of browser globals so failure and conflict handling can be tested.
// Production storage will be SQLite in Tauri's app-data directory.
export function createBoardStorage(storage: StorageAccess) {
  let loaded = false;
  let expected: string | null = null;

  return {
    read(): Board | null {
      loaded = false;
      const current = storage.getItem(KEY);
      const raw = current ?? OLD_KEYS.map(key => storage.getItem(key)).find(value => value !== null) ?? null;
      const board = raw === null ? null : decodeBoard(JSON.parse(raw));
      expected = current;
      loaded = true;
      return board;
    },
    write(board: Board): void {
      if (!loaded) throw new Error('Read the saved board before making changes.');
      if (storage.getItem(KEY) !== expected) {
        throw new Error('This board changed in another window. Reload to use the latest saved version.');
      }
      const raw = JSON.stringify(board);
      storage.setItem(KEY, raw);
      expected = raw;
    },
  };
}

let adapter: ReturnType<typeof createBoardStorage> | undefined;
function boardStorage() { return adapter ??= createBoardStorage(localStorage); }
export function readBoard(): Board | null { return boardStorage().read(); }
export function writeBoard(board: Board): void { boardStorage().write(board); }

export function exportBoard(board: Board): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `project-zero-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
