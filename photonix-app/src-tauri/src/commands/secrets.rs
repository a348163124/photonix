use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

/// API key storage.
///
/// Primary backend: platform secret store via the `keyring` crate. On Windows
/// this maps to Windows Credential Manager (Generic Credentials), so the key
/// is held by the OS-managed vault rather than a flat file in app data.
///
/// Legacy fallback: an XOR-obfuscated `credentials.bin` file under
/// `app_data_dir`. Earlier builds of Photonix used this file as the primary
/// store. On first read after the upgrade we transparently migrate that file
/// content into the keyring and then delete the file.

const KEYRING_SERVICE: &str = "Photonix";
const KEYRING_USER: &str = "api_key";

const LEGACY_FILE: &str = "credentials.bin";
const LEGACY_OBFUSCATION_KEY: &[u8] = b"photonix-local-obfuscation-key-v1";

#[derive(Debug, Serialize, Deserialize, Default)]
struct LegacySecretStore {
    api_key: Option<String>,
}

// ─── Public Tauri commands ───────────────────────────────────────────────────

#[tauri::command]
pub fn save_api_key(app: tauri::AppHandle, api_key: String) -> Result<(), String> {
    if api_key.is_empty() {
        clear_api_key(&app)
    } else {
        write_api_key(&api_key)?;
        // Best-effort: remove any legacy file so we don't have two sources of truth.
        let _ = clear_legacy_file(&app);
        Ok(())
    }
}

#[tauri::command]
pub fn load_api_key(app: tauri::AppHandle) -> Result<Option<String>, String> {
    read_api_key_internal(&app)
}

#[tauri::command]
pub fn has_api_key(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(read_api_key_internal(&app)?.is_some())
}

// ─── Internal helper for other Rust commands ─────────────────────────────────

/// Read the API key from the secure store. Used directly by other Rust
/// commands so the key never has to flow through the JavaScript layer.
pub(crate) fn read_api_key(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    read_api_key_internal(app)
}

// ─── Implementation ──────────────────────────────────────────────────────────

fn read_api_key_internal(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    // Primary: keyring
    if let Some(value) = read_from_keyring()? {
        return Ok(Some(value));
    }

    // Fallback: legacy XOR file. If found, migrate to keyring and remove file.
    if let Some(legacy) = read_from_legacy_file(app)? {
        if let Err(e) = write_api_key(&legacy) {
            // Migration failed: keep the legacy file rather than losing the key
            eprintln!("Failed to migrate legacy API key into keyring: {}", e);
            return Ok(Some(legacy));
        }
        let _ = clear_legacy_file(app);
        return Ok(Some(legacy));
    }

    Ok(None)
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| format!("Keyring error: {}", e))
}

fn read_from_keyring() -> Result<Option<String>, String> {
    let entry = keyring_entry()?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Keyring read failed: {}", e)),
    }
}

fn write_api_key(value: &str) -> Result<(), String> {
    let entry = keyring_entry()?;
    entry
        .set_password(value)
        .map_err(|e| format!("Keyring write failed: {}", e))
}

fn clear_api_key(app: &tauri::AppHandle) -> Result<(), String> {
    let entry = keyring_entry()?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(format!("Keyring delete failed: {}", e)),
    }
    let _ = clear_legacy_file(app);
    Ok(())
}

// ─── Legacy file (read-only after migration) ─────────────────────────────────

fn legacy_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(LEGACY_FILE))
}

fn obfuscate(data: &[u8]) -> Vec<u8> {
    data.iter()
        .enumerate()
        .map(|(i, b)| b ^ LEGACY_OBFUSCATION_KEY[i % LEGACY_OBFUSCATION_KEY.len()])
        .collect()
}

fn read_from_legacy_file(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = legacy_file_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let encrypted = std::fs::read(&path).map_err(|e| e.to_string())?;
    let decrypted = obfuscate(&encrypted);
    let store: LegacySecretStore = serde_json::from_slice(&decrypted)
        .map_err(|e| format!("Failed to parse legacy secrets: {}", e))?;
    Ok(store.api_key)
}

fn clear_legacy_file(app: &tauri::AppHandle) -> Result<(), String> {
    let path = legacy_file_path(app)?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Failed to remove legacy secrets file: {}", e))?;
    }
    Ok(())
}
