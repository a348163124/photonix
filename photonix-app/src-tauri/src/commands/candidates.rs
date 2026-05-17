//! Edit-candidate persistence (MVP3 §33.5).
//!
//! Candidates are lightweight metadata rows. Each candidate references an
//! existing image_versions row produced by a normal edit job; this table
//! groups them and remembers which was favorited.

use crate::storage::database::Database;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditCandidateRow {
    pub id: String,
    pub image_id: String,
    pub version_id: Option<String>,
    pub candidate_group_id: String,
    pub label: String,
    pub prompt_modifier: Option<String>,
    pub style_profile_id: Option<String>,
    pub is_favorite: bool,
    pub created_at: String,
}

#[tauri::command]
pub fn record_candidate(
    db: State<'_, Database>,
    candidate: EditCandidateRow,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO edit_candidates
         (id, image_id, version_id, candidate_group_id, label, prompt_modifier,
          style_profile_id, is_favorite, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            candidate.id,
            candidate.image_id,
            candidate.version_id,
            candidate.candidate_group_id,
            candidate.label,
            candidate.prompt_modifier,
            candidate.style_profile_id,
            candidate.is_favorite as i32,
            candidate.created_at,
        ],
    )
    .map_err(|e| format!("Failed to record candidate: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn list_candidates_for_image(
    db: State<'_, Database>,
    image_id: String,
) -> Result<Vec<EditCandidateRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, image_id, version_id, candidate_group_id, label, prompt_modifier,
                    style_profile_id, is_favorite, created_at
             FROM edit_candidates WHERE image_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![image_id], |row| {
            Ok(EditCandidateRow {
                id: row.get(0)?,
                image_id: row.get(1)?,
                version_id: row.get(2)?,
                candidate_group_id: row.get(3)?,
                label: row.get(4)?,
                prompt_modifier: row.get(5)?,
                style_profile_id: row.get(6)?,
                is_favorite: row.get::<_, i32>(7)? != 0,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// List every favorited candidate across all images. Used by batch export
/// when the user picks "all favorited candidates".
#[tauri::command]
pub fn list_favorite_candidates(
    db: State<'_, Database>,
) -> Result<Vec<EditCandidateRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, image_id, version_id, candidate_group_id, label, prompt_modifier,
                    style_profile_id, is_favorite, created_at
             FROM edit_candidates WHERE is_favorite = 1 ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(EditCandidateRow {
                id: row.get(0)?,
                image_id: row.get(1)?,
                version_id: row.get(2)?,
                candidate_group_id: row.get(3)?,
                label: row.get(4)?,
                prompt_modifier: row.get(5)?,
                style_profile_id: row.get(6)?,
                is_favorite: row.get::<_, i32>(7)? != 0,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_candidate_favorite(
    db: State<'_, Database>,
    id: String,
    is_favorite: bool,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE edit_candidates SET is_favorite = ?1 WHERE id = ?2",
        params![is_favorite as i32, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_candidate(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM edit_candidates WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
