pub mod candidates;
pub mod edit;
pub mod generate;
pub mod library;
pub mod prompt;
pub mod reference_style;
pub mod secrets;
pub mod styles;

use crate::image_core::{border, scanner, thumbnail, watermark};
use crate::storage::database::Database;
use crate::storage::repository::{self, FolderRow, ImageRow, ImageVersionRow};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};
use uuid::Uuid;

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub folder_id: String,
    pub images_found: usize,
    pub images_imported: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ThumbnailResult {
    pub image_id: String,
    pub thumb_path: String,
    pub width: u32,
    pub height: u32,
}

// ─── Basic Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Photonix.", name)
}

#[tauri::command]
pub fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

// ─── Folder Import ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn import_folder(
    db: State<'_, Database>,
    app: tauri::AppHandle,
    folder_path: String,
    recursive: bool,
) -> Result<ImportResult, String> {
    let now = chrono_now();
    let folder_id = Uuid::new_v4().to_string();

    let scanned = scanner::scan_folder(&folder_path, recursive)?;
    let images_found = scanned.len();

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cache_dir = app_data_dir.join("cache");

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let folder = FolderRow {
        id: folder_id.clone(),
        path: folder_path.clone(),
        recursive,
        created_at: now.clone(),
        last_scanned_at: Some(now.clone()),
    };
    repository::insert_folder(&conn, &folder)?;

    let mut images_imported = 0;
    for file in &scanned {
        // Check if image already exists by source_path (avoid re-import cascade delete)
        let existing = conn.query_row(
            "SELECT id FROM images WHERE source_path = ?1",
            rusqlite::params![file.path],
            |row| row.get::<_, String>(0),
        );
        if existing.is_ok() {
            // Already imported, just update last_seen_at
            let _ = conn.execute(
                "UPDATE images SET last_seen_at = ?1, folder_id = ?2 WHERE source_path = ?3",
                rusqlite::params![now, folder_id, file.path],
            );
            images_imported += 1;
            continue;
        }

        let image_id = Uuid::new_v4().to_string();
        let dims = thumbnail::get_dimensions(&file.path).unwrap_or(
            thumbnail::ImageDimensions { width: 0, height: 0 },
        );

        let img = ImageRow {
            id: image_id.clone(),
            folder_id: Some(folder_id.clone()),
            source_path: file.path.clone(),
            filename: file.filename.clone(),
            extension: file.extension.clone(),
            file_size_bytes: file.file_size_bytes as i64,
            width: dims.width as i64,
            height: dims.height as i64,
            checksum: None,
            import_status: "indexed".to_string(),
            created_at: now.clone(),
            modified_at: now.clone(),
            last_seen_at: Some(now.clone()),
        };

        if repository::insert_image(&conn, &img).is_ok() {
            images_imported += 1;
        }
    }

    let _ = std::fs::create_dir_all(cache_dir.join("thumbs"));
    let _ = std::fs::create_dir_all(cache_dir.join("proxies"));
    let _ = std::fs::create_dir_all(cache_dir.join("masks"));
    let _ = std::fs::create_dir_all(cache_dir.join("temp"));

    Ok(ImportResult {
        folder_id,
        images_found,
        images_imported,
    })
}

// ─── Image Queries ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_all_images(db: State<'_, Database>) -> Result<Vec<ImageRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::get_all_images(&conn)
}

#[tauri::command]
pub fn get_images_by_folder(
    db: State<'_, Database>,
    folder_id: String,
) -> Result<Vec<ImageRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::get_images_by_folder(&conn, &folder_id)
}

#[tauri::command]
pub fn get_all_folders(db: State<'_, Database>) -> Result<Vec<FolderRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::get_all_folders(&conn)
}

// ─── Thumbnail Generation ────────────────────────────────────────────────────

#[tauri::command]
pub async fn generate_thumbnail(
    app: tauri::AppHandle,
    image_id: String,
    source_path: String,
) -> Result<ThumbnailResult, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let thumb_path = app_data_dir
        .join("cache")
        .join("thumbs")
        .join(format!("{}.webp", image_id));

    let thumb_path_str = thumb_path.to_string_lossy().to_string();

    // Cache hit — return immediately without re-decoding the source image
    if thumb_path.exists() {
        if let Ok(dims) = image::image_dimensions(&thumb_path) {
            return Ok(ThumbnailResult {
                image_id,
                thumb_path: thumb_path_str,
                width: dims.0,
                height: dims.1,
            });
        }
    }

    // Generate on a blocking thread so the Tauri runtime stays responsive
    let src = source_path.clone();
    let dst = thumb_path_str.clone();
    let dims = tokio::task::spawn_blocking(move || thumbnail::generate_thumbnail(&src, &dst))
        .await
        .map_err(|e| format!("Thumbnail task panicked: {}", e))??;

    Ok(ThumbnailResult {
        image_id,
        thumb_path: thumb_path_str,
        width: dims.width,
        height: dims.height,
    })
}

#[tauri::command]
pub async fn generate_proxy(
    app: tauri::AppHandle,
    image_id: String,
    source_path: String,
) -> Result<ThumbnailResult, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let proxy_path = app_data_dir
        .join("cache")
        .join("proxies")
        .join(format!("{}-preview.jpg", image_id));

    let proxy_path_str = proxy_path.to_string_lossy().to_string();

    // Cache hit
    if proxy_path.exists() {
        if let Ok(dims) = image::image_dimensions(&proxy_path) {
            return Ok(ThumbnailResult {
                image_id,
                thumb_path: proxy_path_str,
                width: dims.0,
                height: dims.1,
            });
        }
    }

    let src = source_path.clone();
    let dst = proxy_path_str.clone();
    let dims = tokio::task::spawn_blocking(move || thumbnail::generate_proxy(&src, &dst))
        .await
        .map_err(|e| format!("Proxy task panicked: {}", e))??;

    Ok(ThumbnailResult {
        image_id,
        thumb_path: proxy_path_str,
        width: dims.width,
        height: dims.height,
    })
}

// ─── Version Management ──────────────────────────────────────────────────────

#[tauri::command]
pub fn get_versions(
    db: State<'_, Database>,
    image_id: String,
) -> Result<Vec<ImageVersionRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::get_versions_for_image(&conn, &image_id)
}

// ─── Settings (non-secret only) ──────────────────────────────────────────────

#[tauri::command]
pub fn save_setting(db: State<'_, Database>, key: String, value: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::set_setting(&conn, &key, &value)
}

#[tauri::command]
pub fn load_setting(db: State<'_, Database>, key: String) -> Result<Option<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repository::get_setting(&conn, &key)
}

// ─── Export ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn export_image(
    source_path: String,
    output_path: String,
    format: String,
    quality: u8,
    // MVP2: when Some, resize so the long edge does not exceed this value.
    max_long_edge: Option<u32>,
    // MVP3: optional border applied before resize/encode
    border: Option<border::BorderConfig>,
    // MVP3: optional text watermark applied after border, before resize/encode
    watermark: Option<watermark::WatermarkConfig>,
) -> Result<String, String> {
    // Validate inputs early so the error message is meaningful
    if !std::path::Path::new(&source_path).exists() {
        return Err(format!("Source file does not exist: {}", source_path));
    }

    let format_lower = format.to_lowercase();
    if !matches!(format_lower.as_str(), "png" | "jpeg" | "jpg") {
        return Err(format!("Unsupported format: {}", format));
    }

    let src = source_path.clone();
    let dst = output_path.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut img = image::open(&src)
            .map_err(|e| format!("Failed to open source ({}): {}", src, e))?;

        // 1. Border / canvas expansion (operates on source resolution)
        if let Some(cfg) = &border {
            img = border::apply_border(img, cfg);
        }

        // 2. Watermark text (rendered before resize so font size is consistent
        //    relative to the source resolution; resize will scale it down too)
        if let Some(cfg) = &watermark {
            if !cfg.text.is_empty() {
                img = watermark::apply_watermark(img, cfg)?;
            }
        }

        // 3. Optional long-edge resize for social-sharing presets
        if let Some(max_edge) = max_long_edge {
            use image::GenericImageView;
            let (w, h) = img.dimensions();
            let long_edge = w.max(h);
            if long_edge > max_edge {
                let scale = max_edge as f32 / long_edge as f32;
                let target_w = ((w as f32 * scale).round() as u32).max(1);
                let target_h = ((h as f32 * scale).round() as u32).max(1);
                img = img.resize(target_w, target_h, image::imageops::FilterType::Lanczos3);
            }
        }

        // Ensure the output directory exists
        if let Some(parent) = std::path::Path::new(&dst).parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create output directory: {}", e))?;
            }
        }

        match format_lower.as_str() {
            "png" => {
                img.save_with_format(&dst, image::ImageFormat::Png)
                    .map_err(|e| format!("Failed to save PNG: {}", e))?;
            }
            "jpeg" | "jpg" => {
                let rgb = img.to_rgb8();
                let output_file = std::fs::File::create(&dst)
                    .map_err(|e| format!("Failed to create output file ({}): {}", dst, e))?;
                let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
                    std::io::BufWriter::new(output_file),
                    quality,
                );
                encoder
                    .encode_image(&rgb)
                    .map_err(|e| format!("Failed to encode JPEG: {}", e))?;
            }
            _ => unreachable!(),
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Export task panicked: {}", e))?;

    result?;
    Ok(output_path)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

pub fn chrono_now() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", now.as_secs())
}

// ─── Provider Validation ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidateProviderRequest {
    pub base_url: String,
    pub text_model: String,
    pub image_model: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidateProviderResult {
    pub connected: bool,
    pub text_model_available: bool,
    pub image_model_available: bool,
    pub warnings: Vec<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn validate_provider(
    app: tauri::AppHandle,
    request: ValidateProviderRequest,
) -> Result<ValidateProviderResult, String> {
    let mut result = ValidateProviderResult {
        connected: false,
        text_model_available: false,
        image_model_available: false,
        warnings: Vec::new(),
        error: None,
    };

    if request.base_url.is_empty() {
        result.error = Some("Base URL is required".to_string());
        return Ok(result);
    }

    let api_key = match secrets::read_api_key(&app)? {
        Some(k) => k,
        None => {
            result.error = Some("API key is not configured. Save it in Settings first.".to_string());
            return Ok(result);
        }
    };

    let url = format!("{}/models", request.base_url.trim_end_matches('/'));
    let client = reqwest::Client::new();

    let response = match client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            result.error = Some(format!("Network error: {}", e));
            return Ok(result);
        }
    };

    if !response.status().is_success() {
        let status = response.status().as_u16();
        result.error = Some(match status {
            401 => "Invalid API key (401 Unauthorized)".to_string(),
            403 => "Access denied (403 Forbidden)".to_string(),
            other => format!("Connection failed: {}", other),
        });
        return Ok(result);
    }

    result.connected = true;

    let body: serde_json::Value = match response.json().await {
        Ok(j) => j,
        Err(e) => {
            result.error = Some(format!("Invalid JSON response: {}", e));
            return Ok(result);
        }
    };

    let models: Vec<String> = body
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(|v| v.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();

    if models.iter().any(|m| m == &request.text_model) {
        result.text_model_available = true;
    } else {
        result.warnings.push(format!(
            "Text model \"{}\" not found in model list. It may still work if the provider supports it.",
            request.text_model
        ));
        // Assume available since some providers don't list all models
        result.text_model_available = true;
    }

    if models.iter().any(|m| m == &request.image_model) {
        result.image_model_available = true;
    } else {
        result.warnings.push(format!(
            "Image model \"{}\" not found in model list. Image edit may not be supported by this provider.",
            request.image_model
        ));
    }

    if !request.base_url.contains("openai.com") {
        result.warnings.push(
            "Using a non-OpenAI provider. Image edit compatibility may vary.".to_string(),
        );
    }

    Ok(result)
}
