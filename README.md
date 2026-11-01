# Project Zero

A small, offline Mac app that works like a paper to-do list: see current work at a glance, add tasks quickly, and arrange them in the order they matter.

## Name and identity

Accepted on 31 October 2026:

- **Project Zero** is the app name.
- The name represents a clear head and nothing slipping through the cracks, alongside the satisfaction of completing work. An empty backlog is not an obligation.
- **P0** is the starting direction for the app icon: a simple, compact monogram. A provisional vector monogram and generated desktop icons are included.
- Suggested supporting line, not yet final: “A clear view of what's next.”

## Technology decision

Accepted on 31 October 2026:

- **Tauri** for the desktop application.
- **Svelte + TypeScript** for the interface.
- **Vite** for frontend development and builds; no SvelteKit required.
- **SQLite** for persistent local storage.
- Scoped component CSS, system fonts, and a small set of dependencies.

This balances a small installed application with code the owner can understand and maintain using familiar web technologies. Keep task and ordering rules in TypeScript modules, with desktop integration and storage behind a small, documented interface. Keep custom Rust code contained.

The finished app must run without Xcode, Node.js, Rust, a development server, an account, or an internet connection. Building the Mac app requires Node.js, Rust, and Apple's Xcode Command Line Tools; the full Xcode application is not required for the desktop target.

Measure installed release size and installer size separately. No size target has been established yet.

## Agreed workflow

- One board with projects as horizontal swimlanes.
- Default columns: To do, Doing, Done. Rename columns or add another in Settings. A rename commits on Enter or when leaving the field, rather than on each keystroke. Columns are shared across projects and Today; new columns appear before completed work. The Done column keeps its completion behaviour when renamed.
- Move cards between columns by dragging or through the command palette; cards have no completion checkbox. Keyboard commands also change task order within All work or Today.
- Blocking is an independent flag on a task. It does not change the task’s column, priority, or Today membership. Completion clears the flag. There is only one description field; no separate blocker-reason field.
- Open one project at a time from the sidebar; All work returns to every project. Project selection is navigation, not a multi-select toggle. Today shows the daily selection across all projects.
- A Today view selects existing tasks across projects without duplicating them or changing their status.
- Today uses status columns and project labels without project swimlanes, allowing ordering across projects within a status.
- Card order expresses priority; no separate priority field.
- All work and Today retain their own ordering.
- Unfinished Today tasks remain selected until removed or completed.
- Projects are created in a modal with the name focused. The selected project has Rename and Delete project buttons beside its heading. Rename edits its name and colour, with eight distinct presets (purple, green, yellow, graphite, magenta, orange, blue, cyan) and a custom colour picker. Deleting a project permanently removes all its tasks after confirmation. Cards have a plain rounded outline. Today cards identify their project with a small coloured dot and name; project swimlanes provide that context elsewhere.
- Today actions read “Add to today’s work” and “Remove from today’s work”. Clear today’s work is available through the command palette; it requires confirmation and only clears Today membership.
- Active cards show Today and Edit controls at all times. Delete is in the edit modal. Done cards have no edit or Today action and show Delete directly. Title and description use consistent labelled text fields.
- Cmd+Shift+P opens the full command palette. New task in the palette opens a dedicated, focused creation form. Only a title is required; Enter creates it. The current project and Today view supply context.
- Task/project creation, cleanup, and collapse-all actions live in the command palette. The board has no shortcut labels or command buttons.
- Drag the sidebar edge to resize it; the width is saved. The focused divider also supports arrow keys, Home, and End.
- Opening the command palette asks before discarding an unsaved form. Closing a form explicitly still discards its draft.
- There is no task search or permanent task-entry field on the board.
- Click anywhere in a project heading row to collapse or expand its swimlane, or use Collapse all / Expand all in the palette. These choices are saved and restored.
- Delete cards individually or clear the completed column in the current project/view. Deletion and clearing completed tasks require confirmation. Deletion is permanent after confirmation; there is no recovery list or Undo toast.
- Remove custom columns in Settings by choosing a destination for their tasks in a second modal stacked above Settings. To do, Doing/In progress, and Done are protected even after renaming. Core columns removed by an earlier draft are restored without losing task data.
- Blocked cards use themeable warning colours and a stronger warning border on hover. Their controls keep the same position as other cards.
- Task editing contains the title, description, and blocked flag. Save applies the edits and closes the modal; the close button or Escape discard unsaved edits. Delete is separated from the primary Save action and requires confirmation. Existing checklist data is retained in saved drafts but has no editing controls.

## Persistence requirements

- Store data locally, separately from the installed app, in a stable application data directory.
- Persist confirmed changes during use, including task order and Today selections; task-editor drafts are saved with Save. Never rely on normal shutdown to save.
- Use transactions for related writes.
- Show save failures clearly and preserve existing data; never silently replace an unreadable database with an empty board.
- Include rotating local backups, backup before database migrations, export, and restore in the first version.
- Verify persistence across restarts and recovery from backups before relying on the app for real work.

Local backups support recovery but cannot protect against loss or failure of the entire Mac without an additional copy elsewhere.

## Scope

The interactive Svelte prototype and Tauri Mac shell are implemented. The browser interactions are verified, the Rust shell passes cargo check, and a release Mac application bundle builds successfully (approximately 4 MB at this stage). The native UI shortcut check could not be performed because computer-control permission was unavailable.

The initial design was simplified following owner feedback: keep the screen close to a paper list, remove decorative copy, badges and counts, minimise repeated controls, and keep task controls straightforward. The board starts with three editable columns, with blocking represented on the card. Appearance lives in the Settings modal. Blocked cards use a muted red warning background, with a stronger border on hover. Task titles use 14px text, with a shared typography scale and more space inside and between cards. Narrow windows scroll horizontally to preserve readable card widths. Buttons have explicit borders and backgrounds, including Cancel and Delete. Cards separate their header, optional description, project label, and full-width Today action. Export is available through the command palette and save-error notice.

Additional features should follow demonstrated workflow needs.

## Running the prototype

Requires Node.js 22.18+ (or a newer supported version), plus npm.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:1420/. The development server listens only on this Mac. The app has no remote fonts, images, accounts, or runtime service dependencies.

```sh
npm run build  # Svelte/TypeScript checks and production frontend bundle
npm test      # Shared-task and independent-ordering behaviour
```

The Tauri shell is prepared for `npm run tauri dev` and `npm run tauri build`, which also require Rust and Xcode Command Line Tools. The release bundle is at `src-tauri/target/release/bundle/macos/Project Zero.app`. Native interactive verification and SQLite integration remain outstanding.

## Prototype storage boundary

This preview uses versioned browser local storage through `src/lib/storage.ts`, including task edits, ordering, and Today selections. Version 6 removes deleted-task storage and recovery. Older deleted-task lists are dropped during migration; active tasks and collapse preferences are preserved. Version 5 removed the separate blocker-reason field and preserved its contents once in the description. Version 4 added the completed-column designation and saved collapsed projects. Version 3 added column definitions; version 2 introduced the independent blocker flag. Older drafts are validated and migrated; their original storage keys are retained. Former Blocked cards move into Doing with the flag set, while their general notes remain unchanged. The description is the sole place for task details and blocker explanations. It is a disposable trial workspace, **not the final durable SQLite storage**. Browser and desktop-webview drafts are separate. Do not rely on it for irreplaceable work yet.

An unreadable saved draft is left untouched, editing is paused, and sample tasks are not displayed in its place. Save failures show an error inside an open form and leave its draft available for retry; changes appear on the board only after a successful write. Writes detect a previously saved change from another window and refuse to silently overwrite it. This is a best-effort conflict check, not a database transaction or live synchronisation service. Export tasks in the command palette downloads the current saved board as JSON in the browser preview; it is not a routine sidebar action. Import/restore, database migrations, and rotating backups are not implemented yet.

## Changing the theme

`src/theme.css` is the theme API. Palette values exist once per appearance; all other styles use semantic variables. For example:

- `--bg`, `--sidebar-bg`, `--surface`: main backgrounds.
- `--text`, `--text-secondary`, `--text-muted`: text colours.
- `--accent`, `--accent-soft`, `--accent-ink`: selection and accent colours.
- `--border`, `--border-strong`: dividers and card borders.
- `--todo`, `--doing`, `--done`: default status colours.
- `--warning-surface`, `--warning-border`, `--warning-strong`, `--warning-ink`, `--on-warning`: blocked-card appearance.
- `--iris`, `--sage`, `--sand`, `--slate`, `--rose`, `--coral`, `--sky`, `--teal`: project markers.
- `--font-ui`, `--text-base`, `--text-sm`, `--text-xs`, `--text-card`: shared typography.
- `--sidebar-width`, `--content-padding`, `--column-min-width`, `--card-padding`, `--column-gap`, `--card-gap`, `--radius-sm`: layout and breathing room.

Settings contains appearance and column management. Open it from the command palette. Appearance supports Light, Dark, and System. System is the default and follows macOS changes while the app is open. `src/lib/theme.ts` remembers the preference and sets `data-appearance` on the document; the light and dark CSS sections define each palette. `src/styles.css` handles layout and components.

## Keyboard shortcuts

- Cmd+Shift+P: open the command palette.
- Type to filter commands; results also search nested task/project actions. For example, “move homepage done” can find a task's destination directly.
- Up/Down: change the selected command. Enter: run it or open its choices.
- Escape: go back one palette level, then close. Backspace in an empty command field also goes back.
- The palette includes creation, navigation, task editing, status/project moves, task order, Today membership, blocking, project editing and deletion, collapsing projects, column management, appearance, Settings, export, and confirmed cleanup.
- Escape: close the current dialog or cancel confirmation.

Cmd+Shift+P is the only app-specific shortcut. The native Mac menu forwards it to the interface. Standard text editing and dialog/palette navigation keys remain available. Window-level shortcuts (with Control equivalents) work when the host delivers them. These shortcuts do not operate outside the app. Browser Cmd+Shift+P was verified; the Mac bundle builds successfully, but native keyboard operation is not yet interactively verified.

## Code layout

- `src/lib/model.ts`: framework-independent task operations and ordering rules.
- `src/lib/storage.ts`: replaceable, independently testable prototype persistence adapter with stale-window detection.
- `src/lib/codec.ts`: saved-data validation and migration.
- `src/components/Settings.svelte`: appearance and column management.
- `src/components/TaskPalette.svelte`: keyboard command list, filtering, nested navigation, and action dispatch.
- `src/components/NewTaskDialog.svelte`: focused task creation.
- `src/components/TextPrompt.svelte`: keyboard-friendly column naming.
- `src/lib/commands.ts`: command types and nested search.
- `src/lib/command-registry.ts`: available app commands and task/project choices.
- `src/components/ProjectDialog.svelte`: project creation and name/colour editing.
- `src/components/ConfirmDialog.svelte`: confirmation before task deletion and clearing Today.
- `src/lib/native.ts`: native menu event subscription and cleanup.
- `src/lib/theme.ts`: appearance preference and system resolution.
- `src/components/Board.svelte`: project swimlanes and drag targets.
- `src/components/TaskCard.svelte`: compact card controls.
- `src/components/TaskEditor.svelte`: task title, description, blocked flag, and deletion action.
- `src/App.svelte`: views, command wiring, dialogs, and coordination.

