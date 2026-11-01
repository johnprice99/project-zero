import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { readableError } from './codec.ts';
import { emptyBoard, type Board } from './model.ts';
import { onboardingBoard } from './onboarding.ts';
import { createBoardStore, type BoardStore } from './storage.ts';
import { createTauriBackend } from './tauri-storage.ts';

export function createAppStore(): BoardStore {
  return createBoardStore(createTauriBackend());
}

export interface Startup {
  board: Board;
  error: unknown;
}
// New and upgraded boards are saved straight away.
export async function openBoard(store: BoardStore): Promise<Startup> {
  try {
    const loaded = await store.load();
    const board = loaded.board ?? onboardingBoard();
    if (loaded.source !== 'saved') await store.save(board);
    return { board, error: null };
  } catch (error) {
    return { board: emptyBoard(), error };
  }
}

// Menu items that open something in the window (see main.rs).
export function onMenu(item: 'command-palette' | 'new-task' | 'new-project' | 'about', run: () => void): Promise<() => void> {
  return listen(`project-zero:${item}`, run);
}

// Rust holds quitting and closing the window until pending saves finish. If the latest
// change could not be saved, it asks whether to quit anyway.
export function bindExitFlush(flush: () => Promise<{ saved: boolean; error: unknown }>): Promise<() => void> {
  return listen('project-zero:before-exit', async () => {
    let unsaved: string | null = 'Your latest changes could not be confirmed as saved.';
    try {
      const result = await flush();
      unsaved = result.saved ? null : readableError(result.error, 'Your latest changes could not be saved.');
    } finally {
      await invoke('allow_exit', { unsaved });
    }
  });
}

// Rust shows its own native dialogs while checking and installing.
export async function checkForUpdates(): Promise<void> {
  await invoke('check_for_updates');
}

export async function openLink(target: 'website' | 'issues'): Promise<void> {
  await invoke('open_link', { target });
}
