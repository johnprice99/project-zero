# Project Zero

A small, offline Mac app that works like a paper to-do list: see current work at a glance, add tasks quickly, and arrange them in the order they matter.

## Name and identity

Accepted on 31 October 2026:

- **Project Zero** is the app name.
- The name represents a clear head and nothing slipping through the cracks, alongside the satisfaction of completing work. An empty backlog is not an obligation.
- **P0** is the starting direction for the app icon: a simple, compact monogram. A provisional vector monogram and generated desktop icons are included.
- Supporting line: “A clear view of what's next.” (used in About and on the website).
- Bundle identifier `com.johnprice.projectzero`, following Typr's `com.johnprice.typr`. Do not change it: it decides where the board is stored.

## Technology decision

Accepted on 31 October 2026:

- **Tauri** for the desktop application.
- **Svelte + TypeScript** for the interface.
- **Vite** for frontend development and builds; no SvelteKit required.
- **A single JSON board file**, written by a small Rust module, for persistent local storage (revised on 1 November 2026; SQLite was the original choice).
- Scoped component CSS, system fonts, and a small set of dependencies.

This balances a small installed application with code the owner can understand and maintain using familiar web technologies. The board is small and held in memory, and every change produces a complete board, so a safely written file meets every persistence requirement without a database. SQLite remains an option if history, search across years of work, or sync are ever needed; storage sits behind one interface, so switching would not affect the rest of the app. Keep task and ordering rules in TypeScript modules, with desktop integration and storage behind a small, documented interface. Keep custom Rust code contained.

The finished app must run without Xcode, Node.js, Rust, a development server, an account, or an internet connection. Building the Mac app requires Node.js, Rust, and Apple's Xcode Command Line Tools; the full Xcode application is not required for the desktop target.

Measure installed release size and installer size separately. No size target has been established. On 1 November 2026 the installed app was 4.3 MB and a zipped copy 1.4 MB (for comparison, Typr is 243 MB because it bundles Chromium; Tauri uses the WebKit already in macOS).

## Agreed workflow

- One board with projects as horizontal swimlanes.
- Default columns: To do, Doing, Done. Rename columns or add another in Settings or the command palette. A rename commits on Enter or when leaving the field, rather than on each keystroke. Columns are shared across projects and Today; new columns appear before completed work. The Done column keeps its completion behaviour when renamed.
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
- Delete cards individually, clear all completed tasks across every project, or clear the completed tasks in the current project/view. There is no archive. Deletion and clearing completed tasks require confirmation. Deletion is permanent after confirmation; there is no recovery list or Undo toast.
- Remove custom columns in Settings by choosing a destination for their tasks in a second modal stacked above Settings. To do, Doing/In progress, and Done are protected even after renaming. Core columns removed by an earlier draft are restored without losing task data.
- Blocked cards use themeable warning colours and a stronger warning border on hover. Their controls keep the same position as other cards.
- Task editing contains the title, description, and blocked flag. Save applies the edits and closes the modal; the close button or Escape discard unsaved edits. Delete is separated from the primary Save action and requires confirmation. Existing checklist data is retained in saved drafts but has no editing controls.

## Persistence requirements

- Store data locally, separately from the installed app, in a stable application data directory.
- Persist confirmed changes during use, including task order and Today selections; task-editor drafts are saved with Save. Never rely on normal shutdown to save.
- Write every change atomically, so a crash leaves either the previous or the new board, never a mix.
- Show save failures clearly and preserve existing data; never silently replace an unreadable board with an empty board.
- Include rotating local backups, backup before format upgrades, export, and restore in the first version.
- Verify persistence across restarts and recovery from backups before relying on the app for real work.

Local backups support recovery but cannot protect against loss or failure of the entire Mac without an additional copy elsewhere. Keep the data folder out of iCloud Drive or Dropbox; put exports there instead.

## Scope

The board, its Tauri Mac app, and durable file storage with backups, export, and restore are implemented. Unit tests cover the task rules, the board format, the save queue, and the Rust storage. Interactive checks in the desktop app (shortcuts, saving before quit, export/restore dialogs, persistence across restarts) are done by hand; see the 1 November entry in `REVIEW.md`.

The initial design was simplified following owner feedback: keep the screen close to a paper list, remove decorative copy, badges and counts, minimise repeated controls, and keep task controls straightforward. The board starts with three editable columns, with blocking represented on the card. Appearance lives in the Settings modal. Blocked cards use a muted red warning background, with a stronger border on hover. Task titles use 14px text, with a shared typography scale and more space inside and between cards. Narrow windows scroll horizontally to preserve readable card widths. Buttons have explicit borders and backgrounds, including Cancel and Delete. Cards separate their header, optional description, project label, and full-width Today action. Export is available through the command palette and save-error notice.

Additional features should follow demonstrated workflow needs.

## Running the app

Requires Node.js 22.18+ (or a newer supported version), plus npm.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:1420/ for the browser preview. The development server listens only on this Mac. The app has no remote fonts, images, accounts, or runtime service dependencies.

```sh
npm run check   # Svelte/TypeScript checks, Prettier, and unit tests
npm run build   # check, then the production frontend bundle
npm test        # unit tests only
npm run format  # format TypeScript with Prettier (Svelte files are formatted by hand)
cd src-tauri && cargo test   # storage, backup, and restore tests
```

`npm run tauri dev` runs the desktop app; `npm run tauri build` builds it. Both also require Rust and Xcode Command Line Tools. The release bundle is at `src-tauri/target/release/bundle/macos/Project Zero.app`.

To install, quit any running copy, then replace it:

```sh
npm run tauri build
rm -rf "/Applications/Project Zero.app" && ditto "src-tauri/target/release/bundle/macos/Project Zero.app" "/Applications/Project Zero.app"
```

The app is ad-hoc signed (no Apple developer account) and not notarised. That is fine for a copy you build yourself; a copy downloaded from elsewhere would show Gatekeeper's warning once. It requires an Apple silicon Mac with macOS 11 or later.

Tests are unit tests for the parts where a bug could lose work: task and ordering rules, the board format and imports, the save queue, and the Rust storage. There are no browser or end-to-end tests.

## Storage

The desktop app keeps the board in `~/Library/Application Support/com.johnprice.projectzero/board.json`. Development builds (`npm run tauri dev`) use a separate `development` folder inside it, so they never touch the real board.

- **Saving.** Every change is shown immediately and saved straight away, in order. Changes made while a save is running are combined into the next one. Rust writes a temporary file, flushes it to disk, and renames it over `board.json`. If a save fails, the board returns to its last saved state and the error is shown; open forms keep their draft for retry. Deletions behave like every other change, so later changes always build on them; an open editor stays until its task's deletion is saved. A form closes only if nothing was changed while it was saving. Every board is checked before it is written, so a bug cannot save a board that would fail to load.
- **Revisions.** The file carries a revision number. A save based on an older revision is refused and the latest board is reloaded. Only one copy of the installed app can run at a time (development builds are exempt and use their own data folder).
- **Quitting.** Quit (Cmd+Q), closing the window, and restarting after an update wait for pending saves to finish. If the latest change couldn't be saved, the app asks: Don't Quit (to retry) or Quit Anyway. It quits regardless only if the window doesn't respond within ten seconds. Quitting from the Dock, logging out, or shutting down does not wait; saves start immediately and take milliseconds, so at most a change made in that instant is lost, and the file is never left half-written.
- **Backups.** The previous board is copied to `backups/` before the first change after opening the app, then at most every 30 minutes, and before any restore. The newest 20 are kept, plus one per day for 60 days.
- **Unreadable boards.** If the board cannot be read, nothing is overwritten and editing is paused. Restore from backup or Restore from exported file in the command palette replaces it; the unreadable file is kept as a backup first.
- **Export and restore.** Export tasks waits for pending saves, then saves a readable JSON copy where you choose. Restore accepts an export, a backup, or a board saved by the browser prototype. It asks for confirmation and backs up the current board first.
- **Format.** The board document has a `schema` number (currently 1), checked by `src/lib/codec.ts`. A board from a newer version of the app is refused rather than misread. Future format changes add a migration step there; the previous file is backed up before the upgraded board is first saved.

The browser preview keeps its board in localStorage instead, with the same revision check between tabs. It has no backups and is not durable. The app identifier changed from `local.projectzero.desktop` to `com.johnprice.projectzero` on 1 November 2026: tasks entered in a desktop build made before then are not imported automatically; export them from that build and use Restore from exported file. Boards saved by the browser prototype (formats 1–6) are imported automatically on first run in the same browser, and the prototype's copy is left untouched.

Collapsed projects are part of the board, so they are backed up and restored with it. Theme, sidebar width, and recently used commands are device preferences kept in webview storage. They are not part of the board, exports, or backups.

## About, updates, and help

These follow Typr.

- **About.** Project Zero › About Project Zero (or the palette) shows a small panel with the icon, version, and supporting line. Escape, Close, or a click outside closes it.
- **Check for Updates.** Project Zero › Check for Updates… asks GitHub for the newest release. If it's newer, it offers Install and Restart. The update is downloaded and installed only if it is signed with the developer's key; pending saves finish, then the app restarts into the new version. If the app can't replace itself (running from the disk image, or not in a writable folder), it offers the download in the browser instead. Installed copies also check quietly about once a day, ten seconds after opening, and say nothing unless there is an update.
- **Help.** Help › Project Zero Website and Report a Problem open the website and a new GitHub issue. Help also searches the menus.

## Releasing (the owner publishes)

1. Set the same new `version` in `package.json` and `src-tauri/Cargo.toml`, then run `npm run dist`. It builds into `release/`:
   - `Project-Zero-mac-arm64.dmg`: the download the website links to.
   - `Project-Zero-mac-arm64.app.tar.gz` and its `.sig`: the signed update installed copies download.
   - `latest.json`: tells installed copies the newest version and where it is.
2. On GitHub, **Releases › Draft a new release**: a new tag equal to the version (e.g. `1.0.0`, no “v”), a title, and attach **all four** files. Publish it as the latest release.

The names are fixed, so the website's download link and the update address (`releases/latest/download/latest.json`) keep working from one version to the next.

**The signing key** is `~/.config/project-zero/update-key`, made once with `npm run update-key` and never committed. Back it up somewhere safe. Its public half is in `src-tauri/tauri.conf.json` (`plugins › updater › pubkey`). Without the key, `npm run dist` builds the disk image only and installed copies cannot update themselves to that release. If the key is lost or leaked, make a new one, replace the public key in `tauri.conf.json`, and release: copies with the old key can't verify it, so they need the new version downloaded from the website once.

The app is ad-hoc signed and not notarised, so a downloaded copy shows Gatekeeper's warning once (see the website's install steps).

## Website

`docs/` is a single static page (no build step), in the same style as Typr's. To publish it with GitHub Pages: **Settings › Pages › Deploy from a branch › `main` / `docs`**. On a free GitHub plan, Pages and release downloads need the repository to be public. It will be at https://johnprice99.github.io/project-zero/.

`npm run screenshots` retakes `docs/images/*.png` from the browser preview in WebKit (the engine the desktop app uses), with a made-up board in a throwaway browser profile. It never touches your own board. It also copies the app icon to the website.

## Icon

The P0 monogram is provisional. To replace it, from a 1024 × 1024 PNG:

1. `npx tauri icon path/to/icon.png` regenerates `src-tauri/icons/`. It also makes Android, iOS, and Windows icons, which a Mac-only app doesn't use: `rm -rf src-tauri/icons/{android,ios,icon.ico,StoreLogo.png,Square*Logo.png}`.
2. Replace `src/assets/icon-light.png` and `src/assets/icon-dark.png` (the About panel; 256 × 256 is enough). Use the same image twice if there is no dark variant.
3. Replace `public/favicon.svg` (the browser preview's tab icon), or remove it and point `index.html` at a PNG.
4. `npm run screenshots` to update the website's icon and screenshots.

## Changing the theme

`src/theme.css` is the theme API. Palette values exist once per appearance; all other styles use semantic variables. For example:

- `--bg`, `--sidebar-bg`, `--surface`: main backgrounds.
- `--text`, `--text-secondary`, `--text-muted`: text colours.
- `--accent`, `--accent-soft`, `--accent-ink`: selection and accent colours.
- `--border`, `--border-strong`: dividers and card borders.
- `--warning-surface`, `--warning-border`, `--warning-strong`, `--warning-ink`, `--on-warning`: blocked-card appearance.
- `--iris`, `--sage`, `--sand`, `--slate`, `--rose`, `--coral`, `--sky`, `--teal`: project markers.
- `--palette-shadow`: command palette shadow.
- `--font-ui`, `--text-base`, `--text-sm`, `--text-xs`, `--text-card`: shared typography.
- `--sidebar-width`, `--content-padding`, `--column-min-width`, `--card-padding`, `--column-gap`, `--card-gap`, `--radius-sm`: layout and breathing room.

Settings contains appearance and column management. Open it from the command palette. Appearance supports Light, Dark, and System. System is the default and follows macOS changes while the app is open. `src/lib/theme.ts` remembers the preference and sets `data-appearance` on the document; the light and dark CSS sections define each palette. `src/styles.css` handles layout and components.

## Command palette and shortcuts

The palette works like Typr's:

- Cmd+Shift+P opens it. It lists only what you can do right now, with your most recently used commands first.
- Type to filter. Matching is fuzzy: the letters must appear in order, and word starts and consecutive letters rank higher.
- Up/Down or Ctrl+N/Ctrl+P change the selection. Enter runs it. Escape, clicking outside, or leaving the field closes the palette.
- Commands ending in “…” open a second list, such as the tasks to move and then the destination column. Each list is searched on its own.
- Appearance choices are listed as “Appearance: Light/Dark/System”, with a tick on the current one.
- Add column and Rename column turn the palette into a one-line name prompt. Enter saves; an invalid or duplicate name keeps the prompt open with an explanation.
- The palette includes creation, navigation, task editing, status/project moves, task order, Today membership, blocking, project editing and deletion, collapsing projects, column management, appearance, Settings, export, restore, and confirmed cleanup.
- Escape: close the current dialog or cancel confirmation.

Cmd+Shift+P is the only app-specific shortcut. The native Mac menu forwards it to the interface, and also provides About, Hide, Quit, Close Window, standard editing, and a Window menu (Minimize, Zoom, Enter Full Screen). These shortcuts do not operate outside the app.

## Code layout

- `src/lib/model.ts`: framework-independent task operations and ordering rules.
- `src/lib/storage.ts`: the storage interface and the ordered save queue.
- `src/lib/commit.ts`: applies a change to the board immediately, saves it, and rolls back if the save fails.
- `src/lib/tauri-storage.ts` / `src/lib/browser-storage.ts`: desktop (Rust) and browser-preview storage.
- `src/lib/codec.ts`: the board file format, validation, and future migrations.
- `src/lib/prototype.ts`: frozen importer for boards saved by the browser prototype.
- `src-tauri/src/storage.rs`: the board file, revisions, backups, restore, export, and import.
- `src-tauri/src/main.rs`: native menu, storage commands, single instance, and saving before quit or restart.
- `src-tauri/src/updates.rs`: Check for Updates and the quiet daily check.
- `src/components/AboutPanel.svelte`: the About panel.
- `scripts/release.mjs`: builds a release (`npm run dist`). `scripts/screenshots.mjs`: the website's screenshots.
- `docs/`: the website.
- `src/components/Settings.svelte`: appearance and column management.
- `src/components/TaskPalette.svelte`: the command palette and its name prompt.
- `src/components/NewTaskDialog.svelte`: focused task creation.
- `src/lib/commands.ts`: command types, fuzzy matching, and recent-first ordering.
- `src/lib/command-registry.ts`: available app commands and task/project choices.
- `src/components/ProjectDialog.svelte`: project creation and name/colour editing.
- `src/components/ConfirmDialog.svelte`: confirmation before task deletion and clearing Today.
- `src/lib/native.ts`: chooses desktop or browser storage; native menu, About, links, updates, and quit events.
- `src/lib/theme.ts`: appearance preference and system resolution.
- `src/components/Board.svelte`: project swimlanes and drag targets.
- `src/components/TaskCard.svelte`: compact card controls.
- `src/components/TaskEditor.svelte`: task title, description, blocked flag, and deletion action.
- `src/App.svelte`: views, command wiring, dialogs, and coordination.

