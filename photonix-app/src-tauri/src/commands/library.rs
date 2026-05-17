use crate::storage::database::Database;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

// ─── Prompt History ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptHistoryRow {
    pub id: String,
    pub raw_prompt: String,
    pub preset_id: Option<String>,
    pub quality_mode: String,
    pub image_id: Option<String>,
    pub version_id: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn record_prompt_history(
    db: State<'_, Database>,
    entry: PromptHistoryRow,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO prompt_history
         (id, raw_prompt, preset_id, quality_mode, image_id, version_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            entry.id,
            entry.raw_prompt,
            entry.preset_id,
            entry.quality_mode,
            entry.image_id,
            entry.version_id,
            entry.created_at,
        ],
    )
    .map_err(|e| format!("Failed to record prompt history: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn list_prompt_history(
    db: State<'_, Database>,
    limit: Option<u32>,
) -> Result<Vec<PromptHistoryRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let limit_val: i64 = limit.unwrap_or(50) as i64;
    let mut stmt = conn
        .prepare(
            "SELECT id, raw_prompt, preset_id, quality_mode, image_id, version_id, created_at
             FROM prompt_history ORDER BY created_at DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![limit_val], |row| {
            Ok(PromptHistoryRow {
                id: row.get(0)?,
                raw_prompt: row.get(1)?,
                preset_id: row.get(2)?,
                quality_mode: row.get(3)?,
                image_id: row.get(4)?,
                version_id: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_prompt_history(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM prompt_history WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete prompt history entry: {}", e))?;
    Ok(())
}

// ─── Custom Edit Presets ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomPresetRow {
    pub id: String,
    pub category: String,
    pub name: String,
    pub description: Option<String>,
    pub prompt_template: String,
    pub preserve_identity: bool,
    pub preserve_composition: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[tauri::command]
pub fn upsert_custom_preset(
    db: State<'_, Database>,
    preset: CustomPresetRow,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO custom_edit_presets
         (id, category, name, description, prompt_template, preserve_identity, preserve_composition, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            preset.id,
            preset.category,
            preset.name,
            preset.description,
            preset.prompt_template,
            preset.preserve_identity as i32,
            preset.preserve_composition as i32,
            preset.created_at,
            preset.updated_at,
        ],
    )
    .map_err(|e| format!("Failed to upsert custom preset: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn list_custom_presets(db: State<'_, Database>) -> Result<Vec<CustomPresetRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, category, name, description, prompt_template, preserve_identity, preserve_composition, created_at, updated_at
             FROM custom_edit_presets ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(CustomPresetRow {
                id: row.get(0)?,
                category: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                prompt_template: row.get(4)?,
                preserve_identity: row.get::<_, i32>(5)? != 0,
                preserve_composition: row.get::<_, i32>(6)? != 0,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_custom_preset(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM custom_edit_presets WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete custom preset: {}", e))?;
    Ok(())
}
