export type Theme = 'system' | 'light' | 'dark';
const KEY = 'project-zero.theme';
export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.appearance =
    theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* Theme still works when storage is unavailable. */
  }
}
