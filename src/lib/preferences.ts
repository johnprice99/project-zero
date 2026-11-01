const SIDEBAR_KEY = 'project-zero.sidebar-width';
export const sidebarRange = { min: 180, max: 360, default: 240 };
export function clampSidebarWidth(width: number): number {
  return Number.isFinite(width) ? Math.round(Math.min(sidebarRange.max, Math.max(sidebarRange.min, width))) : sidebarRange.default;
}
export function readSidebarWidth(): number {
  try { const saved = localStorage.getItem(SIDEBAR_KEY); return saved === null ? sidebarRange.default : clampSidebarWidth(Number(saved)); } catch { return sidebarRange.default; }
}
export function writeSidebarWidth(width: number): void {
  localStorage.setItem(SIDEBAR_KEY, String(clampSidebarWidth(width)));
}
