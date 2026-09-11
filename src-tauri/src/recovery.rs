use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recovery {
    /// Serialized .udraw contents of the unsaved scene.
    pub contents: String,
    /// File the scene came from, when it had one.
    pub source_path: Option<String>,
    pub saved_at: u64,
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Sem diretório de dados: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Sem diretório de dados: {e}"))?;
    Ok(dir.join("recovery.json"))
}

#[tauri::command]
pub fn recovery_write(
    app: AppHandle,
    contents: String,
    source_path: Option<String>,
) -> Result<(), String> {
    let saved_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let entry = Recovery { contents, source_path, saved_at };
    let raw = serde_json::to_string(&entry).map_err(|e| e.to_string())?;
    fs::write(store_path(&app)?, raw).map_err(|e| format!("Autosave falhou: {e}"))
}

#[tauri::command]
pub fn recovery_read(app: AppHandle) -> Option<Recovery> {
    store_path(&app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str::<Recovery>(&raw).ok())
}

#[tauri::command]
pub fn recovery_clear(app: AppHandle) -> Result<(), String> {
    let path = store_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Não foi possível limpar o autosave: {e}"))?;
    }
    Ok(())
}
