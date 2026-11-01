// The command palette is the only app-specific global shortcut.
export async function bindNativeMenus(openPalette: () => void): Promise<() => void> {
  if (!('__TAURI_INTERNALS__' in window)) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen('project-zero:command-palette', openPalette);
}
