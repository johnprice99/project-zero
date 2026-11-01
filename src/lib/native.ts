import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { readableError } from './codec.ts';
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
  return listen('project-zero:command-palette', openPalette);
}

// Rust holds quitting and closing the window until pending saves finish. If the latest
// change could not be saved, it asks whether to quit anyway.
export async function bindExitFlush(flush: () => Promise<{ saved: boolean; error: unknown }>): Promise<() => void> {
  if (!isDesktop) return () => {};
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

const WEBSITE = 'https://johnprice99.github.io/project-zero/';
const ISSUES = 'https://github.com/johnprice99/project-zero/issues/new';

// Project Zero › About Project Zero shows the app's own About panel.
export async function bindAbout(open: () => void): Promise<() => void> {
  if (!isDesktop) return () => {};
  return listen('project-zero:about', open);
}

// The desktop app shows its own native dialogs while checking and installing.
export async function checkForUpdates(): Promise<void> {
  await invoke('check_for_updates');
}

export async function openLink(target: 'website' | 'issues'): Promise<void> {
  if (!isDesktop) {
    window.open(target === 'website' ? WEBSITE : ISSUES, '_blank', 'noopener');
    return;
  }
  await invoke('open_link', { target });
}
