# Project Zero

A clear view of what's next. A small to-do board for your Mac that works like a paper list: see current work at a glance, add tasks quickly, and keep them in the order they matter.

- One board. Each project is a row of **To do**, **Doing** and **Done**. Click a project's heading to collapse it, or use Collapse / Expand all projects in the palette; the choice is remembered.
- Order is priority: drag a card up or down to reorder it, or across to change its column. There is no priority field and no completion checkbox.
- Projects are in the sidebar. Open one at a time; **All work** shows every project. A project's heading has **Rename** (its name, and a colour from eight presets or a custom one) and **Delete project**, which permanently deletes its tasks after asking.
- **Today**: choose tasks from any project with **Add to today's work**. They stay in their project and column. Today shows them in status columns with their project's name and keeps its own order. Tasks stay in Today, finished ones in its Done column, until you remove them or **Clear today's work** (palette, after asking), which leaves the tasks themselves unchanged.
- **Blocked** is a flag on a task, set in its editor or the palette. It doesn't change the task's column, order or Today; finishing the task clears it. Put the reason in the description.
- A task has a title, a description and the blocked flag. **Save** applies your edits; Close or Escape discards them. Delete is in the editor and asks first. Finished cards show only Delete.
- Columns: rename them or add one in Settings or the palette; new columns go before Done. To do, Doing and Done can't be removed, even when renamed. Removing another column asks where its tasks go.
- **Clear all completed tasks** deletes every finished task; **Clear completed tasks in this view** deletes those in the current project or Today. Both ask first. Deleting is permanent: there is no archive or undo.
- Settings (in the palette): appearance (System, Light or Dark) and columns. Drag the sidebar's edge to resize it.
- Every change is saved the moment you make it, and the file is never left half written. Backups are made by themselves; **Export tasks** and **Restore from exported file / backup** are in the palette. See [Storage](#storage).
- The command palette (⇧⌘P) lists only what you can do right now, your recently used commands first. See [Keys](#keys).
- Project Zero › **Check for Updates…** asks GitHub for the newest release and, if there is one, offers **Install and Restart**: it downloads it, checks it's genuine (signed with the developer's key), saves your board, and restarts into it. Release builds also check quietly once a day. If it can't replace itself (e.g. it's running from the disk image), it offers the download instead.
- Project Zero › **About Project Zero**; Help › the website and **Report a Problem**. Help also searches the menus.

```sh
npm install
npm run tauri dev    # the app with live reload, using a separate development board
npm run tauri build  # Project Zero.app, in src-tauri/target/release/bundle/macos/
npm run dist         # a release (disk image and signed update), in dist/
```

Building needs Node.js 22.18 or later, Rust, and the Xcode Command Line Tools. The app needs an Apple silicon Mac with macOS 11 or later, and nothing else: no account, no internet connection.

To install a build, quit Project Zero, then:

```sh
rm -rf "/Applications/Project Zero.app" && ditto "src-tauri/target/release/bundle/macos/Project Zero.app" "/Applications/Project Zero.app"
```

## Tests

```sh
npm run check                                              # Svelte/TypeScript, formatting and unit tests
npm test                                                   # unit tests only
cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test   # Rust lint and storage tests
npm run format                                             # Prettier for TypeScript and scripts (Svelte files are formatted by hand)
```

The tests are unit tests for the parts where a bug could lose work: the task and ordering rules (`model`), the board format (`codec`), the save queue (`storage`), applying and rolling back changes (`commit`), the palette (`commands`), and the Rust file storage, backups and restore. There are no browser or end-to-end tests.

## Storage

The board is one file: `~/Library/Application Support/com.johnprice.projectzero/board.json`. Development builds use a `development` folder inside it, so they never touch the real board.

- **Saving.** Each change shows at once and is saved straight away, in order; changes made during a save are combined into the next one. Rust writes a temporary file, flushes it to disk, and renames it over the board, so a crash leaves the old board or the new one, never a mix. Every board is checked before it is written. If a save fails, the board goes back to its last saved state and says so; an open form keeps your edits so you can try again.
- **One copy.** The file has a revision number, and a save based on an older one is refused. Only one copy of the installed app can run.
- **Quitting** (⌘Q, closing the window, or restarting after an update) waits for saves to finish. If the latest change couldn't be saved, it asks: **Don't Quit** or **Quit Anyway**. Quitting from the Dock or logging out doesn't wait; saves take milliseconds, so at most a change made in that instant is lost.
- **Backups** of the previous board go to `backups/` before the first change after opening the app, then at most every 30 minutes, and before any restore. The newest 20 are kept, plus one a day for 60 days.
- **Unreadable board.** Nothing is overwritten and editing pauses. Restore from a backup or an exported file; the unreadable file is kept as a backup first.
- **Export and restore.** Export tasks saves a readable JSON copy where you choose. Restore accepts an export or a backup, asks first, and backs up the current board.
- **Format.** The board has a `schema` number (currently 1), checked by `src/lib/codec.ts`. A board from a newer version of the app is refused rather than misread.
- Theme, sidebar width and recent commands are device preferences kept by the app, not in the board.

Backups can't protect against losing the whole Mac. Keep exports somewhere else, and keep the data folder itself out of iCloud Drive or Dropbox.

## Releasing

1. Set the same new `version` in `package.json` and `src-tauri/Cargo.toml` (e.g. 1.2.0 → 1.3.0 for new features, → 1.2.1 for fixes).
2. `npm run dist` builds `dist/`: `Project-Zero-mac-arm64.dmg` (the download), `Project-Zero-mac-arm64.app.tar.gz` and its `.sig` (the signed update), and `latest.json` (which tells installed copies about it).
3. On GitHub, **Releases › Draft a new release**: a new tag equal to the version (e.g. `1.3.0`, no “v”), a title, and attach **all four** files. Publish it as the latest release.

The names are fixed, so the website's download link and the update address (`releases/latest/download/latest.json`) keep working from one version to the next.

**The signing key** is `~/.config/project-zero/update-key` (never in the repo); its public half is in `src-tauri/tauri.conf.json`. Back it up somewhere safe. Without it, `npm run dist` builds the disk image only. If it's lost or leaked, make a new one with `npx tauri signer generate -w ~/.config/project-zero/update-key`, put its public key in `tauri.conf.json`, and release; installed copies then need that version downloaded from the website once.

The app is ad-hoc signed and not notarised, so a downloaded copy shows Gatekeeper's warning the first time (the website explains Open Anyway).

## Website

`docs/` is a single static page (no build step) with a download link. To publish it with GitHub Pages: **Settings › Pages › Deploy from a branch › `main` / `docs`**. (On a free GitHub plan, Pages and release downloads need the repository to be public.) It's at https://johnprice99.github.io/project-zero/.

- **Download link:** `releases/latest/download/Project-Zero-mac-arm64.dmg`, so it always gets the newest release.
- **Screenshots** (`docs/images/`) are of the app at 1280 × 800. The page draws the window around them, so if the interface changes, retake them of the window's content only.

## Icon

The app icon was made with Icon Composer, like Typr's, and compiled with Xcode's `actool` into `src-tauri/icons/Assets.car`, which macOS 26 and later show in light, dark, tinted or clear style to match your Mac, and `icon.icns`, the fallback for older macOS (it stops at 256 px, as Typr's does). The About panel uses `src/assets/icon-light.png` and `icon-dark.png`, the website `docs/images/icon.png` and `favicon.png`, and the window icon `src-tauri/icons/icon.png` (128 px), all exported from the same icon. To change it, make a new Icon Composer icon and replace those files; the script that built this one is `scripts/icon.mjs` in commit 5e2a959.

## Keys

Everything is in the command palette (⇧⌘P). Type to filter: the letters must appear in order, and word starts rank higher. Commands ending in “…” open a second list, such as the tasks to move and then the column. Add column and Rename column ask for the name in the palette itself.

|          |                                                     |
| -------- | --------------------------------------------------- |
| ⇧⌘P      | Command palette                                     |
| ↑ / ↓    | Choose a command (also ⌃N / ⌃P)                     |
| ↩        | Run it, or open its list                            |
| Esc      | Close the palette or dialog, or cancel a question   |
| ⌘Q / ⌘W  | Quit / close the window (after saving)              |
| ⌘M       | Minimise                                            |

## Theme

`src/theme.css` holds every colour, and the shared type and layout sizes, once per appearance; `src/styles.css` refers to them by name. For example `--bg`, `--surface`, `--text`, `--accent`, `--border`, the blocked-card colours `--warning-*`, the project colours (`--iris`, `--sage`, `--sand`, `--slate`, `--rose`, `--coral`, `--sky`, `--teal`), the type sizes `--text-*`, and the layout sizes such as `--sidebar-width` and `--card-padding`.

## Code layout

- `src/lib/` — the app without its interface: `model` (tasks, ordering, Today, columns), `codec` (the board format), `storage` (the save queue) with `tauri-storage` (Rust's file), `commit` (apply a change, save it, roll back on failure), `commands` and `command-registry` (the palette), `native` (menus, quitting, updates, links), `theme`, `preferences`, `sample` (the first-run board).
- `src/components/` and `src/App.svelte` — the interface. `App.svelte` holds the board and which dialog is open. `src/assets/` — the About panel's icons.
- `src-tauri/src/` — Rust: `storage` (the board file, revisions, backups, restore, export), `main` (menu, commands, saving before quit), `updates`, `dialogs`.
- `tests/` — unit tests (Node's test runner), with an in-memory stand-in for the Rust storage in `backends.ts`; the Rust tests are in `storage.rs` and `updates.rs`.
- `src-tauri/icons/` — the app icon (see [Icon](#icon)).
- `scripts/release.mjs` — builds a release (`npm run dist`).
- `docs/` — the website.
- `AGENTS.md` — rules and gotchas for coding agents working on Project Zero.
