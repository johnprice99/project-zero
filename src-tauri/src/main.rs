#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod storage;

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use storage::{BackupInfo, LoadedBoard, Storage, StorageError};
use tauri::{
    menu::{AboutMetadata, MenuBuilder, MenuItem, SubmenuBuilder},
    AppHandle, Emitter, Manager, RunEvent, State, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;

/// How long to wait for the window to finish pending saves before quitting anyway.
const EXIT_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Default)]
struct ExitGate {
    requested: AtomicBool,
    allowed: AtomicBool,
}

// Quitting or closing the window first asks the frontend to finish pending saves.
fn request_exit(app: &AppHandle) {
    let gate = app.state::<ExitGate>();
    if gate.requested.swap(true, Ordering::SeqCst) {
        return;
    }
    if app.emit("project-zero:before-exit", ()).is_err() {
        finish_exit(app);
        return;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(EXIT_TIMEOUT);
        finish_exit(&handle);
    });
}

fn finish_exit(app: &AppHandle) {
    app.state::<ExitGate>()
        .allowed
        .store(true, Ordering::SeqCst);
    app.exit(0);
}

#[tauri::command]
fn allow_exit(app: AppHandle) {
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
async fn replace_board(storage: State<'_, Storage>, contents: String) -> Result<u64, StorageError> {
    storage.replace(&contents)
}

#[tauri::command]
async fn list_backups(storage: State<'_, Storage>) -> Result<Vec<BackupInfo>, StorageError> {
    storage.list_backups()
}

#[tauri::command]
async fn read_backup(storage: State<'_, Storage>, id: String) -> Result<String, StorageError> {
    storage.read_backup(&id)
}

#[tauri::command]
async fn export_board(
    app: AppHandle,
    file_name: String,
    contents: String,
) -> Result<bool, StorageError> {
    let mut dialog = app
        .dialog()
        .file()
        .add_filter("Project Zero board", &["json"])
        .set_file_name(file_name);
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    let Some(path) = dialog.blocking_save_file() else {
        return Ok(false);
    };
    let path = path
        .into_path()
        .map_err(|_| StorageError::invalid("That location cannot be used."))?;
    storage::export_to(&path, &contents)?;
    Ok(true)
}

#[tauri::command]
async fn import_board(app: AppHandle) -> Result<Option<String>, StorageError> {
    let mut dialog = app
        .dialog()
        .file()
        .add_filter("Project Zero board", &["json"]);
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    let Some(path) = dialog.blocking_pick_file() else {
        return Ok(None);
    };
    let path = path
        .into_path()
        .map_err(|_| StorageError::invalid("That file cannot be opened."))?;
    storage::read_import(&path).map(Some)
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(ExitGate::default())
        .invoke_handler(tauri::generate_handler![
            load_board,
            save_board,
            replace_board,
            list_backups,
            read_backup,
            export_board,
            import_board,
            allow_exit
        ])
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            // Development builds keep their own data so they never touch the real board.
            #[cfg(debug_assertions)]
            let data = data.join("development");
            app.manage(Storage::new(data));

            let command_palette = MenuItem::with_id(
                app,
                "command-palette",
                "Command Palette…",
                true,
                Some("CmdOrCtrl+Shift+P"),
            )?;
            let quit =
                MenuItem::with_id(app, "quit", "Quit Project Zero", true, Some("CmdOrCtrl+Q"))?;
            let app_menu = SubmenuBuilder::new(app, "Project Zero")
                .about(Some(AboutMetadata::default()))
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .item(&quit)
                .build()?;
            let file_menu = SubmenuBuilder::new(app, "File")
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
            let menu = MenuBuilder::new(app)
                .items(&[&app_menu, &file_menu, &edit_menu, &window_menu])
                .build()?;
            app.set_menu(menu)?;
            app.on_menu_event(|handle, event| match event.id().0.as_str() {
                "command-palette" => {
                    if let Err(error) = handle.emit("project-zero:command-palette", ()) {
                        eprintln!("Menu action failed: {error}");
                    }
                }
                "quit" => request_exit(handle),
                _ => {}
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
