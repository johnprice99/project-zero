const SIDEBAR_KEY = 'project-zero.sidebar-width';
export const sidebarRange = { min: 180, max: 360, default: 240 };
export function clampSidebarWidth(width: number): number {
  return Number.isFinite(width)
    ? Math.round(Math.min(sidebarRange.max, Math.max(sidebarRange.min, width)))
    : sidebarRange.default;
}
export function readSidebarWidth(): number {
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    return saved === null ? sidebarRange.default : clampSidebarWidth(Number(saved));
  } catch {
    return sidebarRange.default;
  }
}
export function writeSidebarWidth(width: number): void {
  localStorage.setItem(SIDEBAR_KEY, String(clampSidebarWidth(width)));
}

// The commands last run from the palette, most recent first.
const RECENT_KEY = 'project-zero.used-commands';
export function readRecentCommands(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
export function writeRecentCommands(ids: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    /* Ordering still works for this session. */
  }
}
