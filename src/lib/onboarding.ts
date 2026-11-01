import { emptyBoard, type Board, type Status } from './model.ts';

// What a new install opens with: one project whose tasks show how Project Zero works.
// Start over removes it.
export function onboardingBoard(): Board {
  const rows: [Status, string, string, boolean][] = [
    [
      'todo',
      'Open the command palette with ⇧⌘P',
      'Everything is in the palette. Type a few letters, like “new task”, and press Return.',
      false,
    ],
    [
      'todo',
      'Drag this card to Doing',
      'Drag cards across to change their status, or up and down to change their order. Order is priority.',
      false,
    ],
    [
      'todo',
      "Add this task to today's work",
      'Press the button below, then choose Today in the sidebar. Today gathers tasks from every project without moving them.',
      false,
    ],
    ['todo', 'Edit this task', 'Click the pencil to change its title or description, or to mark it blocked.', false],
    ['todo', 'Add your first project', '⇧⌘P, then New project. Projects are the rows on the board.', false],
    [
      'todo',
      "Start over when you're ready",
      '⇧⌘P, then Start over with an empty board, deletes every project and task, this one included.',
      false,
    ],
    [
      'doing',
      'Waiting on something? Mark it blocked',
      'A blocked task stands out until you clear the flag. Put the reason in its description, like this.',
      true,
    ],
    [
      'done',
      'Install Project Zero',
      'Finished tasks can be deleted one at a time, or all at once with ⇧⌘P, then Clear all completed tasks.',
      false,
    ],
  ];
  const order: Partial<Record<Status, number>> = {};
  return {
    ...emptyBoard(),
    projects: [{ id: 'onboarding', name: 'Onboard to Project Zero', color: 'iris' }],
    tasks: rows.map(([status, title, notes, blocked], i) => ({
      id: `onboarding-${i}`,
      title,
      projectId: 'onboarding',
      status,
      blocked,
      today: false,
      order: (order[status] = (order[status] ?? -1) + 1),
      todayOrder: 0,
      notes,
    })),
  };
}
