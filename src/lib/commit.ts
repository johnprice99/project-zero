import type { Board } from './model.ts';
import type { BoardStore } from './storage.ts';

export type CommitResult = { ok: true } | { ok: false; error: unknown };

// Every change, deletions included, appears immediately and is saved in order, so later
// changes always build on it. A failed save returns the board to its last saved state
// (the changes queued behind it are abandoned with it).
export function createCommitter(store: Pick<BoardStore, 'save' | 'saved'>, board: { get(): Board; set(next: Board): void }) {
  return async function commit(change: (current: Board) => Board): Promise<CommitResult> {
    const before = board.get();
    const next = change(before);
    if (next === before) return { ok: false, error: null };
    board.set(next);
    try {
      await store.save(next);
      return { ok: true };
    } catch (error) {
      board.set(store.saved() ?? before);
      return { ok: false, error };
    }
  };
}
