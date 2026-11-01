// The command palette works like Typr's: one list at a time, fuzzy matching, recently
// used commands first. A command with children opens a fresh list of them.
export interface Command {
  id: string;
  label: string;
  // Not shown; used to decide what is available while editing is paused.
  group?: string;
  detail?: string;
  // Shown on the right, e.g. a tick on the current appearance.
  hint?: string;
  // Placeholder for the list of children.
  placeholder?: string;
  run?: () => unknown;
  children?: Command[];
}
// The palette as a one-line prompt, e.g. for a column name. `submit` resolves to an
// error message to show, or null when the prompt can close.
export interface PalettePrompt {
  placeholder: string;
  value?: string;
  submit: (value: string) => Promise<string | null>;
}

export const MAX_SHOWN = 60;
export const MAX_RECENT = 8;

/** Subsequence match with bonuses for runs and word starts. Higher is better. */
export function score(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const s = text.toLowerCase();
  let at = 0;
  let prev = -2;
  let total = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const i = s.indexOf(ch, at);
    if (i < 0) return null;
    total += i === prev + 1 ? 3 : 1;
    if (i === 0 || /[\s/_\-.]/.test(s[i - 1])) total += 2;
    prev = i;
    at = i + 1;
  }
  return total - s.length * 0.01;
}

export function filterCommands(items: Command[], query: string): Command[] {
  const q = query.trim();
  if (!q) return items.slice(0, MAX_SHOWN);
  return items
    .map(command => ({ command, s: score(q, `${command.label} ${command.detail ?? ''}`) }))
    .filter((match): match is { command: Command; s: number } => match.s !== null)
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_SHOWN)
    .map(match => match.command);
}

// Recently used first; the rest keep their usual order (the sort is stable).
export function orderByRecent(items: Command[], recent: string[]): Command[] {
  const rank = (id: string) => (recent.includes(id) ? recent.indexOf(id) : recent.length);
  return [...items].sort((a, b) => rank(a.id) - rank(b.id));
}

export function rememberRecent(recent: string[], id: string): string[] {
  return [id, ...recent.filter(used => used !== id)].slice(0, MAX_RECENT);
}
