#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::{
    menu::{MenuBuilder, MenuItem, SubmenuBuilder},
    Emitter,
};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let command_palette = MenuItem::with_id(
                app,
                "command-palette",
                "Command Palette…",
                true,
                Some("CmdOrCtrl+Shift+P"),
            )?;
            let app_menu = SubmenuBuilder::new(app, "Project Zero")
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
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
            let menu = MenuBuilder::new(app)
                .items(&[&app_menu, &file_menu, &edit_menu])
                .build()?;
            app.set_menu(menu)?;
            app.on_menu_event(|handle, event| {
                let result = match event.id().0.as_str() {
                    "command-palette" => handle.emit("project-zero:command-palette", ()),
                    _ => Ok(()),
                };
                if let Err(error) = result {
                    eprintln!("Menu action failed: {error}");
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Project Zero could not start");
}
