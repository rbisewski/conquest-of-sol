// The Rust side is a thin desktop shell (SPEC 2.3). The game itself, including the
// simulation, runs in the webview as TypeScript. The shell only stores save files, in a
// "saves" folder under the app's data directory, and quits.

use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use tauri::{AppHandle, Manager};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveInfo {
    name: String,
    /** Milliseconds since the Unix epoch. */
    saved_at: u64,
}

fn saves_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("saves");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/** The file for a save name. Names are plain titles, never paths. */
fn save_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let ok = !name.trim().is_empty()
        && name.len() <= 120
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_alphanumeric() || " -_.,'()".contains(c));
    if !ok {
        return Err(format!("Invalid save name \"{name}\""));
    }
    Ok(saves_dir(app)?.join(format!("{name}.json")))
}

#[tauri::command]
fn list_saves(app: AppHandle) -> Result<Vec<SaveInfo>, String> {
    let mut saves = Vec::new();
    for entry in fs::read_dir(saves_dir(&app)?).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|s| s.to_str()) else { continue };
        let saved_at = fs::metadata(&path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_millis() as u64);
        saves.push(SaveInfo { name: name.to_string(), saved_at });
    }
    saves.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
    Ok(saves)
}

#[tauri::command]
fn read_save(app: AppHandle, name: String) -> Result<String, String> {
    fs::read_to_string(save_path(&app, &name)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_save(app: AppHandle, name: String, text: String) -> Result<(), String> {
    fs::write(save_path(&app, &name)?, text).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_save(app: AppHandle, name: String) -> Result<(), String> {
    fs::remove_file(save_path(&app, &name)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_saves, read_save, write_save, delete_save, quit])
        .run(tauri::generate_context!())
        .expect("error while running Conquest of Sol");
}
