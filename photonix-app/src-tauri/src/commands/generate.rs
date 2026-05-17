use crate::storage::database::Database;
use base64::Engine;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};
use uuid::Uuid;

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct GenerateImageRequest {
    pub prompt: String,
    pub size: String,         // "1024x1024" | "1792x1024" | "1024x1792" | "auto"
    pub quality: String,      // "standard" | "hd" | "auto"
    pub base_url: String,
    pub api_key: String,
    pub image_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedImageRow {
    pub id: String,
    pub storage_path: String,
    pub prompt: String,
    pub size: String,
    pub quality: String,
    pub width: i64,
    pub height: i64,
    pub file_size_bytes: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GenerateImageResult {
    pub success: bool,
    pub image: Option<GeneratedImageRow>,
    pub error: Option<String>,
}

// ─── Generate Command ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn generate_image(
    app: tauri::AppHandle,
    db: State<'_, Database>,
    request: GenerateImageRequest,
) -> Result<GenerateImageResult, String> {
    if request.prompt.trim().is_empty() {
        return Ok(GenerateImageResult {
            success: false,
            image: None,
            error: Some("Prompt is required".into()),
        });
    }

    let body = serde_json::json!({
        "model": request.image_model,
        "prompt": request.prompt,
        "size": request.size,
        "quality": request.quality,
        "response_format": "b64_json",
        "n": 1,
    });

    let url = format!(
        "{}/images/generations",
        request.base_url.trim_end_matches('/')
    );

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", request.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(180))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let err_body = response.text().await.unwrap_or_default();
        let readable = parse_provider_error(&err_body, status);
        return Ok(GenerateImageResult {
            success: false,
            image: None,
            error: Some(readable),
        });
    }

    let resp_body = response.bytes().await.map_err(|e| e.to_string())?;
    let resp_json: serde_json::Value =
        serde_json::from_slice(&resp_body).map_err(|e| format!("Invalid JSON response: {}", e))?;

    let bytes = extract_image_from_response(&resp_json, &client).await?;

    // Save to disk
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let gen_dir = app_data_dir.join("generations");
    std::fs::create_dir_all(&gen_dir).map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let storage_path = gen_dir.join(format!("{}.png", id));
    std::fs::write(&storage_path, &bytes)
        .map_err(|e| format!("Failed to save generated image: {}", e))?;

    let (w, h) = image::image_dimensions(&storage_path)
        .map_err(|e| format!("Failed to read result dimensions: {}", e))?;

    let row = GeneratedImageRow {
        id: id.clone(),
        storage_path: storage_path.to_string_lossy().to_string(),
        prompt: request.prompt.clone(),
        size: request.size.clone(),
        quality: request.quality.clone(),
        width: w as i64,
        height: h as i64,
        file_size_bytes: Some(bytes.len() as i64),
        created_at: super::chrono_now(),
    };

    // Persist to database
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO generated_images (id, storage_path, prompt, size, quality, width, height, file_size_bytes, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            row.id,
            row.storage_path,
            row.prompt,
            row.size,
            row.quality,
            row.width,
            row.height,
            row.file_size_bytes,
            row.created_at,
        ],
    )
    .map_err(|e| format!("Failed to persist generation: {}", e))?;

    Ok(GenerateImageResult {
        success: true,
        image: Some(row),
        error: None,
    })
}

// ─── List Generated Images ───────────────────────────────────────────────────

#[tauri::command]
pub fn list_generated_images(
    db: State<'_, Database>,
) -> Result<Vec<GeneratedImageRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, storage_path, prompt, size, quality, width, height, file_size_bytes, created_at
             FROM generated_images ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(GeneratedImageRow {
                id: row.get(0)?,
                storage_path: row.get(1)?,
                prompt: row.get(2)?,
                size: row.get(3)?,
                quality: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                file_size_bytes: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_generated_image(
    db: State<'_, Database>,
    id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Get the storage_path before deleting the row
    let path: Option<String> = conn
        .query_row(
            "SELECT storage_path FROM generated_images WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .ok();

    conn.execute(
        "DELETE FROM generated_images WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format!("Failed to delete generation row: {}", e))?;

    // Best-effort file removal
    if let Some(p) = path {
        let _ = std::fs::remove_file(p);
    }

    Ok(())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async fn extract_image_from_response(
    json: &serde_json::Value,
    client: &reqwest::Client,
) -> Result<Vec<u8>, String> {
    let data_arr = json
        .get("data")
        .and_then(|d| d.as_array())
        .ok_or_else(|| {
            format!(
                "Response missing 'data' array. Full response: {}",
                serde_json::to_string_pretty(json).unwrap_or_default()
            )
        })?;

    let first = data_arr.first().ok_or("Response 'data' array is empty")?;

    if let Some(b64) = first.get("b64_json").and_then(|v| v.as_str()) {
        return base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| format!("Failed to decode b64_json: {}", e));
    }

    if let Some(url) = first.get("url").and_then(|v| v.as_str()) {
        let resp = client
            .get(url)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await
            .map_err(|e| format!("Failed to download result image: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Image download failed: {}", resp.status()));
        }

        return resp
            .bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| format!("Failed to read result bytes: {}", e));
    }

    Err(format!(
        "Response contains neither 'b64_json' nor 'url'. Keys present: {:?}",
        first.as_object().map(|o| o.keys().collect::<Vec<_>>())
    ))
}

fn parse_provider_error(body: &str, status: u16) -> String {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(msg) = json
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
        {
            return format!("Provider error ({}): {}", status, msg);
        }
    }
    let truncated = if body.len() > 200 {
        format!("{}...", &body[..200])
    } else {
        body.to_string()
    };
    format!("Provider error ({}): {}", status, truncated)
}
