use crate::storage::database::Database;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StyleProfileRow {
    pub id: String,
    pub name: String,
    pub category: String,
    pub source: String,
    pub reference_image_path: Option<String>,
    pub description: String,
    pub style_summary: String,
    pub positive_prompt: String,
    pub negative_prompt: String,
    pub color_mood_json: Option<String>,
    pub preserve_identity: bool,
    pub preserve_composition: bool,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn upsert_style_profile(
    db: State<'_, Database>,
    profile: StyleProfileRow,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO style_profiles
         (id, name, category, source, reference_image_path, description, style_summary,
          positive_prompt, negative_prompt, color_mood_json, preserve_identity,
          preserve_composition, is_default, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            profile.id,
            profile.name,
            profile.category,
            profile.source,
            profile.reference_image_path,
            profile.description,
            profile.style_summary,
            profile.positive_prompt,
            profile.negative_prompt,
            profile.color_mood_json,
            profile.preserve_identity as i32,
            profile.preserve_composition as i32,
            profile.is_default as i32,
            profile.created_at,
            profile.updated_at,
        ],
    )
    .map_err(|e| format!("Failed to upsert style profile: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn list_style_profiles(db: State<'_, Database>) -> Result<Vec<StyleProfileRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, category, source, reference_image_path, description, style_summary,
                    positive_prompt, negative_prompt, color_mood_json, preserve_identity,
                    preserve_composition, is_default, created_at, updated_at
             FROM style_profiles ORDER BY is_default DESC, updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(StyleProfileRow {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                source: row.get(3)?,
                reference_image_path: row.get(4)?,
                description: row.get(5)?,
                style_summary: row.get(6)?,
                positive_prompt: row.get(7)?,
                negative_prompt: row.get(8)?,
                color_mood_json: row.get(9)?,
                preserve_identity: row.get::<_, i32>(10)? != 0,
                preserve_composition: row.get::<_, i32>(11)? != 0,
                is_default: row.get::<_, i32>(12)? != 0,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_style_profile(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM style_profiles WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete style profile: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn set_default_style_profile(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    // Single-flag transaction: clear all, then set the chosen one.
    conn.execute("UPDATE style_profiles SET is_default = 0", [])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE style_profiles SET is_default = 1 WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
