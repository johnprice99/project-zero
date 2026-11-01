import { createBrowserBackend } from './browser-storage.ts';
import { emptyBoard, type Board } from './model.ts';
import { sampleBoard } from './sample.ts';
import { createBoardStore, type BoardStore } from './storage.ts';
import { createTauriBackend } from './tauri-storage.ts';

export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function createAppStore(): BoardStore {
  const browser = createBrowserBackend(localStorage);
  return createBoardStore(isDesktop ? createTauriBackend(() => browser.prototypeBoard()) : browser);
}

export interface Startup {
  board: Board;
  error: unknown;
}
// New, imported, and upgraded boards are saved straight away. The desktop app backs up
// the previous file before the first save of each session.
export async function openBoard(store: BoardStore): Promise<Startup> {
  try {
    const loaded = await store.load();
    const board = loaded.board ?? sampleBoard();
    if (loaded.source !== 'saved') await store.save(board);
    return { board, error: null };
  } catch (error) {
    return { board: emptyBoard(), error };
  }
}

// The command palette is the only app-specific global shortcut.
export async function bindNativeMenus(openPalette: () => void): Promise<() => void> {
  if (!isDesktop) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen('project-zero:command-palette', openPalette);
}

// Rust holds quitting and closing the window until pending saves finish (or a short timeout).
export async function bindExitFlush(flush: () => Promise<void>): Promise<() => void> {
  if (!isDesktop) return () => {};
  const [{ listen }, { invoke }] = await Promise.all([import('@tauri-apps/api/event'), import('@tauri-apps/api/core')]);
  return listen('project-zero:before-exit', async () => {
    try {
      await flush();
    } finally {
      await invoke('allow_exit');
    }
  });
}
