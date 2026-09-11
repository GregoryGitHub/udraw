use std::fs;
use std::path::{Path, PathBuf};

fn err(context: &str, e: impl std::fmt::Display) -> String {
    format!("{context}: {e}")
}

#[tauri::command]
pub fn read_document(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| err(&format!("Não foi possível ler {path}"), e))
}

/// Writes through a sibling temp file so a crash mid-write can never truncate an
/// existing drawing. `fs::rename` replaces the destination atomically on Windows
/// and POSIX alike when both paths share a volume, which they do here.
#[tauri::command]
pub fn write_document(path: String, contents: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| err("Não foi possível criar a pasta", e))?;
        }
    }

    let temp = temp_sibling(&target);
    fs::write(&temp, contents.as_bytes())
        .map_err(|e| err(&format!("Não foi possível gravar {path}"), e))?;

    if let Err(e) = fs::rename(&temp, &target) {
        let _ = fs::remove_file(&temp);
        return Err(err(&format!("Não foi possível salvar {path}"), e));
    }
    Ok(())
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

fn temp_sibling(target: &Path) -> PathBuf {
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "document".to_string());
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    target.with_file_name(format!(".{name}.{stamp}.tmp"))
}

/// PNG export path: the bytes arrive base64-encoded because Tauri's IPC would
/// otherwise marshal a multi-megabyte array element by element.
#[tauri::command]
pub fn write_binary_document(path: String, base64_data: String) -> Result<(), String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|e| err("Imagem inválida", e))?;

    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| err("Não foi possível criar a pasta", e))?;
        }
    }

    let temp = temp_sibling(&target);
    fs::write(&temp, &bytes).map_err(|e| err(&format!("Não foi possível gravar {path}"), e))?;
    if let Err(e) = fs::rename(&temp, &target) {
        let _ = fs::remove_file(&temp);
        return Err(err(&format!("Não foi possível salvar {path}"), e));
    }
    Ok(())
}
