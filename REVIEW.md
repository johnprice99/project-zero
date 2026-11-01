# Code review — 31 October 2026

Scope: application state, task operations and ordering, saved-data validation/migrations, local storage, command generation and keyboard handling, Svelte dialogs, CSS/accessibility, and the Tauri shell. This is a review of the current prototype, not a production-readiness certification.

## Findings fixed

| Priority | Finding | Change and verification |
| --- | --- | --- |
| High | Forms could report success and close after a storage write failed. The board also published changes before the write succeeded. | A mutation reports success only after persistence succeeds. Failed saves leave the previous board unchanged and form drafts open, with the error shown inside the modal. Storage failure/retry tests and browser save/reload checks cover this path. |
| High | Two open instances could silently replace each other's saved work. | The storage adapter checks the previously observed saved value before writing. A stale instance refuses the write and asks the user to reload. Tests cover stale writers and preserve the newer saved board. This is a best-effort conflict check; localStorage has no cross-window transaction lock. |
| High | Opening the palette silently discarded unsaved task, project, or column-dialog input. | Dirty forms now ask before the palette replaces them. Cancel preserves the draft; confirmed discard opens the palette. Repeated palette shortcuts no longer reset an already-open palette. Browser checks cover both outcomes. Explicit Close/Escape still discard as previously agreed. |
| Medium | Restoring a missing core column could duplicate a custom column's name, creating a board that failed validation on its next restart. | Restored core columns receive unique names and sensible positions. A regression test covers migration and the following JSON save/reload. |
| Medium | Saved data was cast to the application type before validation, with a large compound condition and incomplete checks. | Separate validators now check identifiers, names, titles, references, numeric ordering, and legacy details before building a Board. Decoder output contains supported fields only. Regression tests cover malformed data and name collisions. |
| Medium | Column renaming wrote partially typed names on every keypress. | Settings commits the full trimmed name on Enter/blur, rejects duplicate names, and treats an unchanged name as valid without another write. Model tests and browser checks cover these cases. |
| Medium | Single-project boards offered task-to-project commands with no destination or action. | Command generation removes empty branches recursively. Regression coverage checks that every offered command has an action or usable children. |
| Low | Custom palette key handling intercepted Enter during input-method composition. | Composition events bypass custom palette navigation. |
| Low | Narrow layouts hid navigation text and left icon-only buttons without an accessible name. | All work and Today have explicit accessible names. The sidebar separator identifies its controlled pane and uses the shared size limits. |
| Low | Native shortcut errors could overwrite storage errors; an unreadable board could still show sample projects. | Separate error state preserves storage diagnostics. Initial state is empty, sample work is loaded only for a genuinely empty store, and editing is blocked when loading fails. |

## Maintenance cleanup

- Extracted named save handlers from large inline component callbacks.
- Made task-editor saves explicit through an `onsave` callback with a success result.
- Added a shared task-patch type and an empty-board factory.
- Separated browser storage access from adapter logic so failures and conflicts can be tested without mutating real data.
- Reformatted the Settings component and Rust entry point; updated workflow and persistence documentation.
- Kept the existing small application structure instead of adding a state-management library or generic form framework.

## Validation

- 48 automated tests pass, including a deterministic sequence of 300 mixed drag/order/Today operations that checks content preservation, unique ordering positions, and JSON round-trips.
- Svelte/TypeScript checks pass with zero errors and zero warnings.
- Rust Clippy passes with warnings treated as errors; Rust formatting applied.
- Release Mac application bundle builds successfully.
- Browser checks: save followed by reload, discard confirmation and cancellation, trimmed column rename, and duplicate-name rejection. Temporary content and column names used in these checks were restored.

## Remaining boundary

The main unfinished engineering work is the previously agreed SQLite persistence layer and local backups. The app still uses browser/webview localStorage. It is not a durable database, browser and desktop drafts are separate, and this review does not change that limitation. Native GUI/shortcut operation and native JSON-download behaviour still need interactive verification; building and static checks do not verify those behaviours.

# Architecture review — 1 November 2026

Scope: readiness for the Tauri desktop app, focused on what could cause problems later. Findings and what was done:

## Changed

| Priority | Finding | Change |
| --- | --- | --- |
| Critical | Saving was synchronous and every dialog expected an immediate result. Tauri calls are asynchronous, and building each change from a possibly out-of-date board would lose rapid changes. | `commit(change)` applies changes to the latest board and saves through an ordered queue (`src/lib/storage.ts`). Changes made during a save are combined; a failed save abandons the changes queued behind it and returns the board to its last saved state. Dialogs await the result and ignore repeated clicks. |
| Critical | The plan said SQLite, but the app works on whole boards. | Replaced with a single JSON board file written by Rust (see README, Technology decision). |
| Critical | No version control. | Git repository initialised; design snapshots removed. |
| High | The app identifier fixes where data lives. | Set to `com.johnprice.projectzero` before real use. Development builds use a separate data folder. |
| High | Durable storage, backups, export, and restore were missing. | `src-tauri/src/storage.rs`: atomic writes, revision checks, backups (first change of a session, every 30 minutes, before restore; pruned to 20 recent plus one per day for 60 days), restore, and export/import through native dialogs. The webview has no file-system access. |
| High | Two copies of the app could write the same data; conflicts had no recovery. | Single-instance plugin. A refused save reloads the latest board and explains what happened. |
| High | Quitting during a save could lose it. | Quit and Close Window wait for pending saves (three-second limit). |
| Medium | One function handled six prototype formats; error messages were vague. | New `schema: 1` format with errors naming the record and field (`tasks[3].title …`), refusal of newer formats, and a migration hook. The prototype decoder is frozen as an importer (`src/lib/prototype.ts`). |
| Medium | Dialog state was seven flags kept consistent by hand. | One `panel` value plus the confirmation layer. |
| Medium | Length limits and core column ids were repeated across files. | `limits` and `coreColumnIds` in `src/lib/model.ts`. |
| Low | Long unformatted lines; mixed Svelte syntax. | Prettier for TypeScript (Svelte templates formatted by hand to avoid spacing changes); `Icon.svelte` uses runes. |
| Low | Mac menu gaps. | About, custom Quit (saves first), and a Window menu. |

The command palette was also rebuilt to work and look like Typr's (owner's request): one list at a time, fuzzy matching, recent commands first, a tick on the current appearance, Escape or clicking outside closes, and a one-line prompt for column names in place of the column-name dialog.

## Independent review of these changes

A second review of the diff found no corruption paths, and confirmed atomic writes, revision handling, backup-id safety, and the save queue. It found these issues, now fixed:

- A change made while a restore was saving could be written over the restored board. Restores now show immediately, so later changes build on them.
- After a failed save before the board had loaded, or during a reload, the failed change could stay on screen. The app now starts only once the board has loaded, and changes are refused during a reload. A conflict triggers one reload rather than one per queued save.
- A reload could run alongside a save. Loading now waits for saves in progress and refuses new ones until it finishes.
- A failed delete closed the task editor and lost its draft. Deletions now apply only once saved.
- The board appeared empty for a moment on launch. It is now loaded before the window content is shown.
- Export could miss a change still being saved. It now waits.
- Nothing stopped a model bug from saving a board that would not load. Every save, and every prototype import, is now checked against the format first.
- `tauri dev` exited at once while the installed app was open (shared single-instance lock). Single instance now applies only to release builds.
- A failed backup was reported as a failed save. It now says that a backup could not be made, so nothing was saved.
- Clicking the error text in the column-name prompt closed it. A leftover error banner could replace the duplicate-name message.

Accepted as they are:

- Quitting from the Dock, logging out, or shutting down skips the save wait (documented).
- A final save that fails while quitting is not reported. The file stays intact and the earlier error was already shown.
- Tasks entered in a desktop build made before the identifier change must be exported from that build and restored.

## Not changed

- Collapsed projects stay in the board (saved, exported, and restored with it); device preferences stay in webview storage.
- No notarisation or DMG; not needed for personal use. The bundle is ad-hoc signed, as Typr is.
- The native menu gains About and a Window menu, and Quit is now a custom item so it can wait for saves. The blocked-storage message now says “saved board” instead of “saved draft”.

## Validation

- Unit tests: TypeScript (task rules, board format and prototype imports, save queue ordering/combining/failure/conflict, palette matching) and Rust (save/reload, revision conflicts, unreadable boards, backups, pruning, backup-id path safety, export validation).
- `npm run check` (Svelte/TypeScript, Prettier, unit tests), `cargo clippy -D warnings`, and a release bundle build.
- Outside the palette, the rendered markup and CSS are unchanged. Edits there are limited to script blocks, event-handler expressions, and `maxlength` values now read from `limits` (same numbers).

## Follow-up (owner decisions)

- Completed tasks are not archived. Clear all completed tasks (palette) permanently deletes every completed task across all projects after confirmation; Clear completed tasks in this view remains for a single project or Today when it would clear less.
- The “Prototype · saved on this device” footer was removed.
- The whole bundle is now ad-hoc signed under `com.johnprice.projectzero`. Previously only the executable was signed by the linker, so `codesign --verify` failed on the app.

