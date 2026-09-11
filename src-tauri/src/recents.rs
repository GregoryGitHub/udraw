use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MAX_RECENTS: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recent {
    pub path: String,
    pub name: String,
    pub opened_at: u64,
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Sem diretório de dados: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Sem diretório de dados: {e}"))?;
    Ok(dir.join("recents.json"))
}

fn load(app: &AppHandle) -> Vec<Recent> {
    store_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str::<Vec<Recent>>(&raw).ok())
        .unwrap_or_default()
}

fn persist(app: &AppHandle, entries: &[Recent]) -> Result<(), String> {
    let path = store_path(app)?;
    let raw = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| format!("Não foi possível gravar os recentes: {e}"))
}

/// Entries whose file has since been deleted or moved are dropped, so the menu
/// never offers a dead path.
#[tauri::command]
pub fn list_recents(app: AppHandle) -> Vec<Recent> {
    load(&app)
        .into_iter()
        .filter(|r| Path::new(&r.path).exists())
        .collect()
}

#[tauri::command]
pub fn push_recent(app: AppHandle, path: String) -> Result<Vec<Recent>, String> {
    let name = Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    let opened_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let mut entries = load(&app);
    entries.retain(|r| r.path != path && Path::new(&r.path).exists());
    entries.insert(0, Recent { path, name, opened_at });
    entries.truncate(MAX_RECENTS);

    persist(&app, &entries)?;
    Ok(entries)
}

#[tauri::command]
pub fn clear_recents(app: AppHandle) -> Result<(), String> {
    persist(&app, &[])
}
