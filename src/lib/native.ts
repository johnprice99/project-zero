import { createBrowserBackend } from './browser-storage.ts';
import { createBoardStore } from './storage.ts';
import { createTauriBackend } from './tauri-storage.ts';

export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function createAppStore() {
  const browser = createBrowserBackend(localStorage);
  return createBoardStore(isDesktop ? createTauriBackend(() => browser.prototypeBoard()) : browser);
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
