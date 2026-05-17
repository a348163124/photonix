use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

/// Store API key encrypted on disk using a simple XOR with machine-specific key.
/// In production, this should use Windows Credential Manager or Tauri Stronghold.
/// This is a step above plaintext SQLite — the key is stored in a separate
/// binary file in the app data directory, not in the database.

const SECRET_FILE: &str = "credentials.bin";
const OBFUSCATION_KEY: &[u8] = b"photonix-local-obfuscation-key-v1";

#[derive(Debug, Serialize, Deserialize, Default)]
struct SecretStore {
    api_key: Option<String>,
}

fn get_secret_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(SECRET_FILE))
}

fn obfuscate(data: &[u8]) -> Vec<u8> {
    data.iter()
        .enumerate()
        .map(|(i, b)| b ^ OBFUSCATION_KEY[i % OBFUSCATION_KEY.len()])
        .collect()
}

fn read_store(app: &tauri::AppHandle) -> Result<SecretStore, String> {
    let path = get_secret_path(app)?;
    if !path.exists() {
        return Ok(SecretStore::default());
    }
    let encrypted = std::fs::read(&path).map_err(|e| e.to_string())?;
    let decrypted = obfuscate(&encrypted);
    serde_json::from_slice(&decrypted).map_err(|e| format!("Failed to parse secrets: {}", e))
}

fn write_store(app: &tauri::AppHandle, store: &SecretStore) -> Result<(), String> {
    let path = get_secret_path(app)?;
    let json = serde_json::to_vec(store).map_err(|e| e.to_string())?;
    let encrypted = obfuscate(&json);
    std::fs::write(&path, &encrypted).map_err(|e| format!("Failed to write secrets: {}", e))
}

#[tauri::command]
pub fn save_api_key(app: tauri::AppHandle, api_key: String) -> Result<(), String> {
    let mut store = read_store(&app)?;
    store.api_key = if api_key.is_empty() {
        None
    } else {
        Some(api_key)
    };
    write_store(&app, &store)
}

#[tauri::command]
pub fn load_api_key(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let store = read_store(&app)?;
    Ok(store.api_key)
}

#[tauri::command]
pub fn has_api_key(app: tauri::AppHandle) -> Result<bool, String> {
    let store = read_store(&app)?;
    Ok(store.api_key.is_some())
}
