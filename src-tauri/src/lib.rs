mod document;
mod recents;
mod recovery;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Wry};

/// Frontend event carrying a native menu id (e.g. "new", "save", "recent:C:\x.udraw").
const MENU_EVENT: &str = "udraw://menu";
/// Frontend event asking the app to open a path (file association / second instance).
const OPEN_FILE_EVENT: &str = "udraw://open-file";

const DOCUMENT_EXTENSIONS: [&str; 2] = ["udraw", "excalidraw"];

fn document_arg(argv: &[String]) -> Option<String> {
    argv.iter().skip(1).find(|arg| {
        !arg.starts_with('-')
            && std::path::Path::new(arg)
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| DOCUMENT_EXTENSIONS.contains(&e.to_lowercase().as_str()))
                .unwrap_or(false)
    })
    .cloned()
}

/// The path this process was launched with, if the user double-clicked a drawing.
#[tauri::command]
fn startup_file() -> Option<String> {
    document_arg(&std::env::args().collect::<Vec<_>>())
}

fn build_menu(app: &AppHandle, recents: &[recents::Recent]) -> tauri::Result<Menu<Wry>> {
    let item = |id: &str, label: &str, accel: Option<&str>| {
        MenuItem::with_id(app, id, label, true, accel)
    };

    let recent_menu = Submenu::with_id(app, "recent-menu", "Abrir recente", true)?;
    if recents.is_empty() {
        let empty = MenuItem::with_id(app, "recent-empty", "(nenhum)", false, None::<&str>)?;
        recent_menu.append(&empty)?;
    } else {
        for entry in recents {
            let id = format!("recent:{}", entry.path);
            recent_menu.append(&MenuItem::with_id(app, id, &entry.name, true, None::<&str>)?)?;
        }
        recent_menu.append(&PredefinedMenuItem::separator(app)?)?;
        recent_menu.append(&item("recent-clear", "Limpar recentes", None)?)?;
    }

    let file_menu = Submenu::with_id(app, "file-menu", "Arquivo", true)?;
    file_menu.append_items(&[
        &item("new", "Novo", Some("CmdOrCtrl+N"))?,
        &item("open", "Abrir...", Some("CmdOrCtrl+O"))?,
        &recent_menu,
        &PredefinedMenuItem::separator(app)?,
        &item("save", "Salvar", Some("CmdOrCtrl+S"))?,
        &item("save-as", "Salvar como...", Some("CmdOrCtrl+Shift+S"))?,
        &PredefinedMenuItem::separator(app)?,
        &item("export-png", "Exportar PNG...", Some("CmdOrCtrl+Shift+E"))?,
        &item("export-svg", "Exportar SVG...", None)?,
        &item("copy-png", "Copiar imagem para a área de transferência", None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::quit(app, Some("Sair"))?,
    ])?;

    let insert_menu = Submenu::with_id(app, "insert-menu", "Inserir", true)?;
    insert_menu.append(&item(
        "insert-mermaid",
        "Diagrama Mermaid...",
        Some("CmdOrCtrl+Shift+M"),
    )?)?;

    // No Edit submenu on purpose: native accelerators for Ctrl+C/V/Z would swallow
    // the keystrokes Excalidraw needs for canvas copy/paste and undo.
    Menu::with_items(app, &[&file_menu, &insert_menu])
}

/// Rebuilt from the frontend whenever the recents list changes.
#[tauri::command]
fn refresh_menu(app: AppHandle) -> Result<(), String> {
    let entries = recents::list_recents(app.clone());
    let menu = build_menu(&app, &entries).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
            if let Some(path) = document_arg(&argv) {
                let _ = app.emit(OPEN_FILE_EVENT, path);
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let entries = recents::list_recents(handle.clone());
            app.set_menu(build_menu(&handle, &entries)?)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = app.emit(MENU_EVENT, event.id().0.clone());
        })
        .invoke_handler(tauri::generate_handler![
            startup_file,
            refresh_menu,
            document::read_document,
            document::write_document,
            document::path_exists,
            document::write_binary_document,
            recents::list_recents,
            recents::push_recent,
            recents::clear_recents,
            recovery::recovery_write,
            recovery::recovery_read,
            recovery::recovery_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running uDraw");
}
