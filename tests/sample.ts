import { emptyBoard, type Board, type Status } from '../src/lib/model.ts';
export function sampleBoard(): Board {
  const rows: [string, string, Status, boolean, string][] = [
    ['zero', 'Make adding a task feel effortless', 'doing', true, 'One line, Enter, and on to the next thought.'],
    ['zero', 'Sketch the Today view', 'todo', true, 'A little space for the things that matter today.'],
    ['zero', 'Try a few colours for the app', 'todo', false, ''],
    ['zero', 'Choose the app foundation', 'done', false, 'Tauri, Svelte and TypeScript.'],
    ['web', 'Build the homepage layout', 'doing', true, ''],
    ['web', 'Write the about page', 'todo', false, ''],
    ['web', 'Get the final images', 'doing', true, 'Waiting for the new photography.'],
    ['docs', 'Outline the next app idea', 'todo', true, ''],
    ['docs', 'Tidy up project notes', 'todo', false, ''],
    ['docs', 'Review the launch checklist', 'done', false, ''],
  ];
  return {
    ...emptyBoard(),
    projects: [
      { id: 'zero', name: 'Project Zero', color: 'iris' },
      { id: 'web', name: 'Website', color: 'sage' },
      { id: 'docs', name: 'Documents & planning', color: 'sand' },
      { id: 'general', name: 'General', color: 'slate' },
    ],
    tasks: rows.map(([projectId, title, status, today, notes], i) => ({
      id: `sample-${i}`,
      title,
      projectId,
      status,
      today,
      notes,
      order: i,
      todayOrder: i,
      blocked: i === 6,
    })),
  };
}
