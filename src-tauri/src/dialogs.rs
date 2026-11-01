//! Native message boxes, attached to the window when there is one.

use tauri::Wry;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{
    DialogExt, MessageDialogBuilder, MessageDialogButtons, MessageDialogKind,
};

fn dialog(app: &AppHandle, title: &str, detail: &str) -> MessageDialogBuilder<Wry> {
    let dialog = app.dialog().message(detail).title(title);
    match app.get_webview_window("main") {
        Some(window) => dialog.parent(&window),
        None => dialog,
    }
}

pub fn tell(app: &AppHandle, title: &str, detail: &str, kind: MessageDialogKind) {
    dialog(app, title, detail).kind(kind).blocking_show();
}

/// True when the first (default) button is chosen.
pub fn ask(app: &AppHandle, title: &str, detail: &str, yes: &str, no: &str) -> bool {
    dialog(app, title, detail)
        .buttons(MessageDialogButtons::OkCancelCustom(yes.into(), no.into()))
        .blocking_show()
}
