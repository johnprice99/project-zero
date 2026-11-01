//! Check for Updates, following Typr: asks GitHub for the newest release and, if it's
//! newer, downloads it, checks it was signed with the developer's key (the updater
//! plugin verifies it against the public key in tauri.conf.json) and restarts into it,
//! after the board's pending saves have finished. If Project Zero can't replace itself
//! (e.g. it's running from the disk image), it offers the download in the browser
//! instead. Packaged copies also check quietly about once a day.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU8, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::window::{ProgressBarState, ProgressBarStatus};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Error as UpdateError, UpdaterExt};

pub const WEBSITE: &str = "https://johnprice99.github.io/project-zero/";
pub const ISSUES: &str = "https://github.com/johnprice99/project-zero/issues/new";
/// A fixed name, so the website's link always gets the newest release.
const DOWNLOAD: &str = "https://github.com/johnprice99/project-zero/releases/latest/download/Project-Zero-mac-arm64.dmg";
// Only release builds check daily.
#[cfg_attr(debug_assertions, allow(dead_code))]
const DAY_MS: u64 = 24 * 60 * 60 * 1000;

const IDLE: u8 = 0;
const BUSY: u8 = 1;
const PENDING: u8 = 2;

/// Set while an update is downloading, and once it is waiting for the restart, so it's
/// never fetched twice.
#[derive(Default)]
pub struct UpdateState(AtomicU8);

fn tell(app: &AppHandle, title: &str, detail: &str, kind: MessageDialogKind) {
    let mut dialog = app.dialog().message(detail).title(title).kind(kind);
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.parent(&window);
    }
    dialog.blocking_show();
}

fn ask(app: &AppHandle, title: &str, detail: &str, yes: &str, no: &str) -> bool {
    let mut dialog = app
        .dialog()
        .message(detail)
        .title(title)
        .buttons(MessageDialogButtons::OkCancelCustom(yes.into(), no.into()));
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.parent(&window);
    }
    dialog.blocking_show()
}

pub fn open_in_browser(url: &str) {
    if let Err(error) = std::process::Command::new("/usr/bin/open").arg(url).spawn() {
        eprintln!("Could not open {url}: {error}");
    }
}

/// The running app's bundle (…/Project Zero.app), if this is a packaged copy.
fn own_bundle() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let bundle = exe.parent()?.parent()?.parent()?.to_path_buf();
    (bundle.extension()? == "app").then_some(bundle)
}

/// Why this copy can't replace itself, if it can't.
fn cant_replace(bundle: Option<&Path>) -> Option<String> {
    let Some(bundle) = bundle else {
        return Some("This copy of Project Zero isn’t an installed app.".into());
    };
    let path = bundle.to_string_lossy();
    // macOS runs a downloaded app from a hidden, read-only copy until it's moved.
    if path.contains("/AppTranslocation/") || path.starts_with("/Volumes/") {
        return Some("Move Project Zero into your Applications folder first.".into());
    }
    let folder = bundle.parent()?;
    let probe = folder.join(format!(".project-zero-update-check-{}", std::process::id()));
    match std::fs::File::create(&probe) {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            None
        }
        Err(_) => Some(format!(
            "Project Zero can’t replace itself in {}.",
            folder.display()
        )),
    }
}

fn offer_browser(app: &AppHandle, why: &str) {
    let detail = format!("{why} You can download it and drag it into Applications instead.");
    if ask(
        app,
        "Project Zero couldn’t install the update itself",
        &detail,
        "Download",
        "Cancel",
    ) {
        open_in_browser(DOWNLOAD);
    }
}

fn show_progress(app: &AppHandle, progress: Option<u64>) {
    if let Some(window) = app.get_webview_window("main") {
        let status = if progress.is_some() {
            ProgressBarStatus::Normal
        } else {
            ProgressBarStatus::None
        };
        let _ = window.set_progress_bar(ProgressBarState {
            status: Some(status),
            progress,
        });
    }
}

fn check_failure(error: &UpdateError) -> String {
    match error {
        UpdateError::ReleaseNotFound => {
            "No releases have been published yet, or GitHub couldn’t be reached.".into()
        }
        UpdateError::Reqwest(_) | UpdateError::Network(_) => {
            "GitHub couldn’t be reached. Check your internet connection.".into()
        }
        other => other.to_string(),
    }
}

/// Checks now. `quiet` (the daily check) says nothing unless there's an update.
pub async fn check_for_updates(app: AppHandle, quiet: bool) {
    let state = app.state::<UpdateState>();
    match state.0.load(Ordering::SeqCst) {
        BUSY if !quiet => {
            return tell(
                &app,
                "The update is downloading",
                "",
                MessageDialogKind::Info,
            )
        }
        PENDING if !quiet => {
            return tell(
                &app,
                "The update will install when Project Zero restarts",
                "",
                MessageDialogKind::Info,
            )
        }
        IDLE => {}
        _ => return,
    }
    let current = app.package_info().version.to_string();
    let checked = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    let update = match checked {
        Ok(Some(update)) => update,
        Ok(None) => {
            if !quiet {
                let detail = format!("You have the newest version, {current}.");
                tell(
                    &app,
                    "Project Zero is up to date",
                    &detail,
                    MessageDialogKind::Info,
                );
            }
            return;
        }
        Err(error) => {
            if !quiet {
                tell(
                    &app,
                    "Couldn’t check for updates",
                    &check_failure(&error),
                    MessageDialogKind::Warning,
                );
            }
            return;
        }
    };
    let version = update.version.clone();
    let detail =
        format!("You have {current}. Project Zero will save your board, download it, and restart.");
    if !ask(
        &app,
        &format!("Project Zero {version} is available"),
        &detail,
        "Install and Restart",
        "Later",
    ) {
        return;
    }
    if let Some(why) = cant_replace(own_bundle().as_deref()) {
        return offer_browser(&app, &why);
    }
    if state
        .0
        .compare_exchange(IDLE, BUSY, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    let mut received = 0u64;
    let progress_app = app.clone();
    let installed = update
        .download_and_install(
            |chunk, total| {
                received += chunk as u64;
                if let Some(total) = total.filter(|total| *total > 0) {
                    show_progress(&progress_app, Some((received * 100 / total).min(100)));
                }
            },
            || {},
        )
        .await;
    show_progress(&app, None);
    match installed {
        Ok(()) => {
            state.0.store(PENDING, Ordering::SeqCst);
            crate::request_restart(&app);
        }
        Err(UpdateError::Minisign(_) | UpdateError::SignatureUtf8(_) | UpdateError::Base64(_)) => {
            state.0.store(IDLE, Ordering::SeqCst);
            let detail = "It isn’t signed with Project Zero’s key, so it may not be genuine. Nothing was changed.";
            tell(
                &app,
                &format!("Project Zero {version} wasn’t installed"),
                detail,
                MessageDialogKind::Warning,
            );
        }
        Err(error) => {
            state.0.store(IDLE, Ordering::SeqCst);
            offer_browser(
                &app,
                &format!("{}.", check_failure(&error).trim_end_matches('.')),
            );
        }
    }
}

#[cfg_attr(debug_assertions, allow(dead_code))]
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// At launch: starts the quiet daily check, after startup so it never slows opening.
#[cfg_attr(debug_assertions, allow(dead_code))]
pub fn check_daily(app: AppHandle, stamp: PathBuf) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(10));
        loop {
            let last = std::fs::read_to_string(&stamp)
                .ok()
                .and_then(|s| s.trim().parse::<u64>().ok())
                .unwrap_or(0);
            if now_ms().saturating_sub(last) >= DAY_MS {
                // A failure to record only means it may check again sooner.
                let _ = std::fs::create_dir_all(stamp.parent().unwrap_or(Path::new(".")));
                let _ = std::fs::write(&stamp, now_ms().to_string());
                tauri::async_runtime::block_on(check_for_updates(app.clone(), true));
            }
            std::thread::sleep(Duration::from_secs(60 * 60));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_an_installed_writable_copy_replaces_itself() {
        assert!(cant_replace(None)
            .unwrap()
            .contains("isn’t an installed app"));
        let translocated =
            Path::new("/private/var/folders/x/AppTranslocation/ABC/d/Project Zero.app");
        assert!(cant_replace(Some(translocated))
            .unwrap()
            .contains("Applications folder"));
        let disk_image = Path::new("/Volumes/Project Zero/Project Zero.app");
        assert!(cant_replace(Some(disk_image))
            .unwrap()
            .contains("Applications folder"));
        let read_only = Path::new("/System/Project Zero.app");
        assert!(cant_replace(Some(read_only))
            .unwrap()
            .contains("can’t replace itself"));
        let writable = std::env::temp_dir().join("Project Zero.app");
        assert_eq!(cant_replace(Some(&writable)), None);
    }
}
