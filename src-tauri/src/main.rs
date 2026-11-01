mod dialogs;
mod storage;
mod updates;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use storage::{LoadedBoard, Storage, StorageError};
use tauri::{
    menu::{MenuBuilder, MenuItem, SubmenuBuilder},
    AppHandle, Emitter, Manager, RunEvent, State, WindowEvent,
};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// How long to wait for the window to answer before quitting anyway (only if it never does).
const EXIT_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Default)]
struct ExitGate {
    requested: AtomicBool,
    allowed: AtomicBool,
    /// Restart instead of quitting (after an update has been installed).
    restart: AtomicBool,
    /// Changes whenever the window answers, so an earlier timeout can't force an exit.
    generation: AtomicU64,
}

// Quitting or closing the window first asks the frontend to finish pending saves.
fn request_exit(app: &AppHandle) {
    let gate = app.state::<ExitGate>();
    if gate.requested.swap(true, Ordering::SeqCst) {
        return;
    }
    let generation = gate.generation.fetch_add(1, Ordering::SeqCst) + 1;
    if app.emit("project-zero:before-exit", ()).is_err() {
        finish_exit(app);
        return;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(EXIT_TIMEOUT);
        let gate = handle.state::<ExitGate>();
        if gate.requested.load(Ordering::SeqCst)
            && gate.generation.load(Ordering::SeqCst) == generation
        {
            finish_exit(&handle);
        }
    });
}

/// Restarts into an installed update once pending saves have finished, as quitting does.
pub fn request_restart(app: &AppHandle) {
    app.state::<ExitGate>()
        .restart
        .store(true, Ordering::SeqCst);
    request_exit(app);
}

fn finish_exit(app: &AppHandle) {
    let gate = app.state::<ExitGate>();
    if gate.allowed.swap(true, Ordering::SeqCst) {
        return;
    }
    if gate.restart.load(Ordering::SeqCst) {
        // Restarting from the main thread skips RunEvent::Exit, where the window-state plugin
        // saves, so save first. The main thread also can't be waiting on a window event then.
        let handle = app.clone();
        let restart = app.run_on_main_thread(move || {
            let _ = handle.save_window_state(StateFlags::all());
            handle.restart();
        });
        if restart.is_err() {
            app.restart();
        }
        return;
    }
    app.exit(0);
}

/// The window has finished its pending saves. `unsaved` explains a change that couldn't
/// be saved: then ask before quitting, as Typr does, so it can be retried.
#[tauri::command]
async fn allow_exit(app: AppHandle, unsaved: Option<String>) {
    let gate = app.state::<ExitGate>();
    gate.generation.fetch_add(1, Ordering::SeqCst);
    if let Some(problem) = unsaved {
        let detail = format!("{problem} If you quit now, your latest changes will be lost.");
        let title = "Your latest changes couldn’t be saved";
        if dialogs::ask(&app, title, &detail, "Don’t Quit", "Quit Anyway") {
            gate.restart.store(false, Ordering::SeqCst);
            gate.requested.store(false, Ordering::SeqCst);
            return;
        }
    }
    finish_exit(&app);
}

// Storage commands are async so file flushes run off the main thread.
#[tauri::command]
async fn load_board(storage: State<'_, Storage>) -> Result<Option<LoadedBoard>, StorageError> {
    storage.load()
}

#[tauri::command]
async fn save_board(
    storage: State<'_, Storage>,
    expected_revision: u64,
    contents: String,
) -> Result<u64, StorageError> {
    storage.save(expected_revision, &contents)
}

#[tauri::command]
async fn check_for_updates(app: AppHandle) {
    updates::check_for_updates(app, false).await;
}

/// Only Project Zero's own pages can be opened.
#[tauri::command]
fn open_link(target: String) {
    match target.as_str() {
        "website" => updates::open_in_browser(updates::WEBSITE),
        "issues" => updates::open_in_browser(updates::ISSUES),
        _ => {}
    }
}

fn window_state() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let builder = tauri_plugin_window_state::Builder::default();
    // Development builds keep their own window, as they keep their own board.
    #[cfg(debug_assertions)]
    let builder = builder.with_filename(".window-state-development.json");
    builder.build()
}

fn main() {
    let builder = tauri::Builder::default();
    // Only one copy may write the board. Development builds keep their own data folder and
    // skip this, so `tauri dev` can run while the installed app is open.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));
    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Reopens the window as it was left.
        .plugin(window_state())
        .manage(ExitGate::default())
        .manage(updates::UpdateState::default())
        .invoke_handler(tauri::generate_handler![
            load_board,
            save_board,
            check_for_updates,
            open_link,
            allow_exit
        ])
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            // Packaged copies check for updates quietly about once a day.
            #[cfg(not(debug_assertions))]
            updates::check_daily(app.handle().clone(), data.join("update-check.json"));
            // Development builds keep their own data so they never touch the real board.
            #[cfg(debug_assertions)]
            let data = data.join("development");
            app.manage(Storage::new(data));
            // Maximised the first time; after that the window-state plugin reopens it as it was left.
            let remembered = app
                .path()
                .app_config_dir()?
                .join(app.handle().filename())
                .exists();
            if !remembered {
                // Cosmetic, so a failure must not stop the app starting.
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.maximize();
                }
            }

            let item =
                |id: &str, label: &str| MenuItem::with_id(app, id, label, true, None::<&str>);
            let command_palette = MenuItem::with_id(
                app,
                "command-palette",
                "Command Palette…",
                true,
                Some("CmdOrCtrl+Shift+P"),
            )?;
            let new_task =
                MenuItem::with_id(app, "new-task", "New Task", true, Some("CmdOrCtrl+N"))?;
            let new_project = MenuItem::with_id(
                app,
                "new-project",
                "New Project",
                true,
                Some("CmdOrCtrl+Shift+N"),
            )?;
            let quit =
                MenuItem::with_id(app, "quit", "Quit Project Zero", true, Some("CmdOrCtrl+Q"))?;
            let app_menu = SubmenuBuilder::new(app, "Project Zero")
                .item(&item("about", "About Project Zero")?)
                .item(&item("check-updates", "Check for Updates…")?)
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .item(&quit)
                .build()?;
            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&new_task)
                .item(&new_project)
                .separator()
                .item(&command_palette)
                .close_window()
                .build()?;
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let window_menu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .separator()
                .fullscreen()
                .build()?;
            let help_menu = SubmenuBuilder::new(app, "Help")
                .item(&item("website", "Project Zero Website")?)
                .item(&item("report-problem", "Report a Problem")?)
                .build()?;
            let menu = MenuBuilder::new(app)
                .items(&[&app_menu, &file_menu, &edit_menu, &window_menu, &help_menu])
                .build()?;
            app.set_menu(menu)?;
            // macOS adds menu search to Help and the window list to Window.
            #[cfg(target_os = "macos")]
            {
                window_menu.set_as_windows_menu_for_nsapp()?;
                help_menu.set_as_help_menu_for_nsapp()?;
            }
            app.on_menu_event(|handle, event| {
                let emit = |name: &str| {
                    if let Err(error) = handle.emit(name, ()) {
                        eprintln!("Menu action failed: {error}");
                    }
                };
                match event.id().0.as_str() {
                    "command-palette" => emit("project-zero:command-palette"),
                    "new-task" => emit("project-zero:new-task"),
                    "new-project" => emit("project-zero:new-project"),
                    "about" => emit("project-zero:about"),
                    "check-updates" => {
                        tauri::async_runtime::spawn(updates::check_for_updates(
                            handle.clone(),
                            false,
                        ));
                    }
                    "website" => updates::open_in_browser(updates::WEBSITE),
                    "report-problem" => updates::open_in_browser(updates::ISSUES),
                    "quit" => request_exit(handle),
                    _ => {}
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if !app.state::<ExitGate>().allowed.load(Ordering::SeqCst) {
                    api.prevent_close();
                    request_exit(app);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Project Zero could not start");

    app.run(|app, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            if !app.state::<ExitGate>().allowed.load(Ordering::SeqCst) {
                api.prevent_exit();
                request_exit(app);
            }
        }
    });
}
