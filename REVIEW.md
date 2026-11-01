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
