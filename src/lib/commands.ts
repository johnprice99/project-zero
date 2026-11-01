export interface Command {
  id: string;
  label: string;
  group?: string;
  detail?: string;
  keywords?: string;
  run?: () => void;
  children?: Command[];
}
export interface CommandResult { command: Command; path: string; score: number }

// Search nested actions too: “move homepage done” can find the destination directly.
export function findCommands(commands: Command[], query: string): CommandResult[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands.map(command => ({ command, path: '', score: 0 }));
  const matches: CommandResult[] = [];
  function visit(items: Command[], parents: string[]) {
    for (const command of items) {
      const label = command.label.toLowerCase();
      const own = `${label} ${command.detail ?? ''} ${command.keywords ?? ''}`.toLowerCase();
      const path = parents.join(' › ');
      const text = `${path} ${own}`.toLowerCase();
      if (words.every(word => text.includes(word))) {
        const score = words.reduce((sum, word) => sum + (label.startsWith(word) ? 100 : label.includes(word) ? 70 : own.includes(word) ? 40 : 10), 0) - parents.length;
        matches.push({ command, path, score });
      }
      if (command.children?.length) visit(command.children, [...parents, command.label]);
    }
  }
  visit(commands, []);
  return matches.sort((a, b) => b.score - a.score);
}
