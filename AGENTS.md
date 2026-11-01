# Project Zero — notes for agents

A small macOS (Apple silicon only) to-do board. Tauri 2 + Svelte 5 + TypeScript, with the board file kept by a little Rust. Owner: John Price. Read README.md for features and keys.

## Commands

- `npm run check` — Svelte/TypeScript, Prettier, unit tests. With `cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test`, run before every commit.
- `npm run tauri build` — the app (about a minute). `npm run dist` — a release into `dist/`. `npm run icon` — every icon, from the artwork in `src-tauri/icons/` (needs Xcode 26+). `npm run screenshots` — the website's pictures.

## Layout

- `src/lib/model.ts` — the task rules, as pure functions from board to board. Keep rules here, not in components.
- Every change goes through `commit()` in `App.svelte`, which uses `src/lib/commit.ts`: the board changes on screen at once, `src/lib/storage.ts` saves in order, and a failed save rolls back. Don't change `board` any other way (loading, restoring and reloading excepted), and don't make a change wait for its save before showing: later changes would be built on a stale board.
- `src/lib/codec.ts` — the board format (`schema: 1`). A format change needs `SCHEMA` bumped, a migration step, and a test. Every save is checked against it first, so a model bug can't write a board that won't load.
- `src/lib/command-registry.ts` — the palette's commands; `src/lib/commands.ts` — matching and recent-first order.
- `src-tauri/src/` — `storage.rs` (atomic writes, revisions, backups, restore), `main.rs` (menu, commands, the exit gate), `updates.rs` (Check for Updates), `dialogs.rs`.

## Rules

- The owner likes the interface as it is. Don't change how it looks or behaves unless asked, and keep markup and CSS changes to what was asked for.
- Tests are unit tests, for what's critical to not losing work (model, codec, save queue, commit, the palette's commands, Rust storage). No browser or end-to-end tests. Don't add tools or dependencies without asking (Playwright is only for `npm run screenshots`).
- Prettier formats the TypeScript and scripts. Svelte files are formatted by hand because reflowing markup can change spacing, and CSS, HTML, Markdown and JSON are left alone too (see `.prettierignore`). Rust uses `cargo fmt`.
- Typr (`~/work/typr`) is the model for the palette (one list at a time, fuzzy matching, recent first, Esc closes), the About panel, updates, Help, the website, the icon and releasing. Keep them in step with it.
- Never touch the owner's board (`~/Library/Application Support/com.johnprice.projectzero/`). Development builds use its `development` folder; screenshots use a made-up board.
- Ask before anything disruptive: installing into `/Applications`, quitting the owner's copy, pushing, publishing.
- Don't bump the version or release unless asked.
- Before committing: review the diff (a subagent review for anything non-trivial), fix what it finds, run the checks.

## Gotchas

- The bundle id `com.johnprice.projectzero` decides where the board lives. Never change it.
- Vite builds into `src-tauri/target/web`, which Tauri bundles (`frontendDist`) and the Rust build embeds. After `cargo clean`, run `npm run build` before `cargo test` or `cargo clippy`. `dist/` holds only `npm run dist`'s release files.
- Single instance applies to release builds only: its lock is per bundle id, so `tauri dev` couldn't run alongside the installed app.
- Quit, Close Window and restart-after-update go through the exit gate in `main.rs`. The window finishes its saves (`bindExitFlush`) and calls `allow_exit`; if the last save failed, it asks Don't Quit / Quit Anyway. Quit is a custom menu item so it passes through the gate. Quitting from the Dock, logging out and shutting down skip it.
- While a task or project is being deleted, `App.svelte` keeps its snapshot in `deleting` so an open editor stays until the delete is saved (a failed delete keeps the draft).
- The icon: `npm run icon` compiles `src-tauri/icons/ProjectZero.icon` into `src-tauri/icons/Assets.car` (copied into the bundle by `bundle.macOS.files`, found through `CFBundleIconName` in `src-tauri/Info.plist`) and the `icon.icns` fallback. `icon.png` is built into the program uncompressed as the window icon, so keep it at 128 px. Icon Composer ignores a gradient's direction, so the diagonal gradient is an image layer. `Assets.car` comes out slightly different on every run even when nothing changed; commit it only when the icon has.
- Release file names are fixed (`Project-Zero-mac-arm64.*`, tag = version without “v”) because the website and the updater depend on them. `Cargo.toml`'s version must match `package.json`'s; `npm run dist` checks.
- The update signing key is `~/.config/project-zero/update-key`; never commit it.
