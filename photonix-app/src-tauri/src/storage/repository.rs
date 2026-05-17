use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

// ─── Data Models ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderRow {
    pub id: String,
    pub path: String,
    pub recursive: bool,
    pub created_at: String,
    pub last_scanned_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageRow {
    pub id: String,
    pub folder_id: Option<String>,
    pub source_path: String,
    pub filename: String,
    pub extension: String,
    pub file_size_bytes: i64,
    pub width: i64,
    pub height: i64,
    pub checksum: Option<String>,
    pub import_status: String,
    pub created_at: String,
    pub modified_at: String,
    pub last_seen_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageVersionRow {
    pub id: String,
    pub image_id: String,
    pub parent_version_id: Option<String>,
    pub version_kind: String,
    pub storage_path: String,
    pub width: i64,
    pub height: i64,
    pub file_size_bytes: Option<i64>,
    pub is_current: bool,
    pub created_at: String,
}

// ─── Folder Operations ───────────────────────────────────────────────────────

pub fn insert_folder(conn: &Connection, folder: &FolderRow) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO folders (id, path, recursive, created_at, last_scanned_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            folder.id,
            folder.path,
            folder.recursive as i32,
            folder.created_at,
            folder.last_scanned_at,
        ],
    )
    .map_err(|e| format!("Failed to insert folder: {}", e))?;
    Ok(())
}

pub fn get_all_folders(conn: &Connection) -> Result<Vec<FolderRow>, String> {
    let mut stmt = conn
        .prepare("SELECT id, path, recursive, created_at, last_scanned_at FROM folders ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(FolderRow {
                id: row.get(0)?,
                path: row.get(1)?,
                recursive: row.get::<_, i32>(2)? != 0,
                created_at: row.get(3)?,
                last_scanned_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn update_folder_scan_time(conn: &Connection, folder_id: &str, time: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE folders SET last_scanned_at = ?1 WHERE id = ?2",
        params![time, folder_id],
    )
    .map_err(|e| format!("Failed to update folder scan time: {}", e))?;
    Ok(())
}

// ─── Image Operations ────────────────────────────────────────────────────────

pub fn insert_image(conn: &Connection, img: &ImageRow) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO images (id, folder_id, source_path, filename, extension, file_size_bytes, width, height, checksum, import_status, created_at, modified_at, last_seen_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            img.id,
            img.folder_id,
            img.source_path,
            img.filename,
            img.extension,
            img.file_size_bytes,
            img.width,
            img.height,
            img.checksum,
            img.import_status,
            img.created_at,
            img.modified_at,
            img.last_seen_at,
        ],
    )
    .map_err(|e| format!("Failed to insert image: {}", e))?;
    Ok(())
}

pub fn get_images_by_folder(conn: &Connection, folder_id: &str) -> Result<Vec<ImageRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, folder_id, source_path, filename, extension, file_size_bytes, width, height, checksum, import_status, created_at, modified_at, last_seen_at
             FROM images WHERE folder_id = ?1 ORDER BY filename ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![folder_id], |row| {
            Ok(ImageRow {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                source_path: row.get(2)?,
                filename: row.get(3)?,
                extension: row.get(4)?,
                file_size_bytes: row.get(5)?,
                width: row.get(6)?,
                height: row.get(7)?,
                checksum: row.get(8)?,
                import_status: row.get(9)?,
                created_at: row.get(10)?,
                modified_at: row.get(11)?,
                last_seen_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_all_images(conn: &Connection) -> Result<Vec<ImageRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, folder_id, source_path, filename, extension, file_size_bytes, width, height, checksum, import_status, created_at, modified_at, last_seen_at
             FROM images ORDER BY filename ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ImageRow {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                source_path: row.get(2)?,
                filename: row.get(3)?,
                extension: row.get(4)?,
                file_size_bytes: row.get(5)?,
                width: row.get(6)?,
                height: row.get(7)?,
                checksum: row.get(8)?,
                import_status: row.get(9)?,
                created_at: row.get(10)?,
                modified_at: row.get(11)?,
                last_seen_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ─── Version Operations ──────────────────────────────────────────────────────

pub fn insert_version(conn: &Connection, ver: &ImageVersionRow) -> Result<(), String> {
    conn.execute(
        "INSERT INTO image_versions (id, image_id, parent_version_id, version_kind, storage_path, width, height, file_size_bytes, is_current, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            ver.id,
            ver.image_id,
            ver.parent_version_id,
            ver.version_kind,
            ver.storage_path,
            ver.width,
            ver.height,
            ver.file_size_bytes,
            ver.is_current as i32,
            ver.created_at,
        ],
    )
    .map_err(|e| format!("Failed to insert version: {}", e))?;
    Ok(())
}

pub fn get_versions_for_image(conn: &Connection, image_id: &str) -> Result<Vec<ImageVersionRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, image_id, parent_version_id, version_kind, storage_path, width, height, file_size_bytes, is_current, created_at
             FROM image_versions WHERE image_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![image_id], |row| {
            Ok(ImageVersionRow {
                id: row.get(0)?,
                image_id: row.get(1)?,
                parent_version_id: row.get(2)?,
                version_kind: row.get(3)?,
                storage_path: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                file_size_bytes: row.get(7)?,
                is_current: row.get::<_, i32>(8)? != 0,
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ─── Settings Operations ─────────────────────────────────────────────────────

pub fn set_setting(conn: &Connection, key: &str, value_json: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value_json, updated_at)
         VALUES (?1, ?2, datetime('now'))",
        params![key, value_json],
    )
    .map_err(|e| format!("Failed to set setting: {}", e))?;
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let result = conn.query_row(
        "SELECT value_json FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    );

    match result {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
