pub mod candidates;
pub mod edit;
pub mod generate;
pub mod library;
pub mod prompt;
pub mod prompt_library;
pub mod prompt_templates;
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

/// Resolve a path, falling back to the literal path when it doesn't exist yet
/// (e.g. the destination of a fresh export). On Windows, dunce::canonicalize
/// would be ideal but we avoid the extra dependency: std::fs::canonicalize is
/// adequate for paths that already exist, and we only use this for the
/// already-on-disk source.
fn canonicalize_existing(p: &std::path::Path) -> std::path::PathBuf {
    std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
}

/// Compose an output path under `dir` from a user-supplied filename.
/// Refuses any filename that contains path separators, drive letters, leading
/// dots-only segments, or other characters that could escape `dir`. Returns
/// the joined absolute path on success.
fn safe_join_output(dir: &str, filename: &str) -> Result<std::path::PathBuf, String> {
    if filename.is_empty() {
        return Err("Empty filename".into());
    }
    // Reject anything that looks like a path. We intentionally check the raw
    // string (not Path components) because some Windows tricks like "C:" are
    // not flagged as components.
    if filename.contains('/')
        || filename.contains('\\')
        || filename.contains(':')
        || filename.contains('\0')
    {
        return Err(format!(
            "Filename must not contain path separators or drive specs: {}",
            filename
        ));
    }
    if filename == "." || filename == ".." {
        return Err(format!("Invalid filename: {}", filename));
    }
    // Reject leading/trailing whitespace and Windows reserved names defensively.
    let trimmed = filename.trim();
    if trimmed.is_empty() || trimmed != filename {
        return Err(format!("Filename has invalid whitespace: {}", filename));
    }

    let dir_path = std::path::Path::new(dir);
    let candidate = dir_path.join(filename);

    // After joining, double-check that the parent of the candidate is exactly
    // the directory we were given. This is paranoia — the checks above already
    // forbid separators — but it costs nothing.
    let candidate_parent = candidate.parent().ok_or("Output path has no parent")?;
    if candidate_parent != dir_path {
        return Err(format!(
            "Filename resolves outside the output directory: {}",
            filename
        ));
    }

    Ok(candidate)
}

/// Pure pixel pipeline: open → border → watermark → optional resize → encode.
/// Caller is responsible for ensuring `dst` is safe to write.
fn run_export_pipeline(
    src: &str,
    dst: &std::path::Path,
    format_lower: &str,
    quality: u8,
    max_long_edge: Option<u32>,
    border: Option<border::BorderConfig>,
    watermark: Option<watermark::WatermarkConfig>,
) -> Result<(), String> {
    let mut img =
        image::open(src).map_err(|e| format!("Failed to open source ({}): {}", src, e))?;

    if let Some(cfg) = &border {
        img = border::apply_border(img, cfg);
    }
    if let Some(cfg) = &watermark {
        if !cfg.text.is_empty() {
            img = watermark::apply_watermark(img, cfg)?;
        }
    }
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

    if let Some(parent) = dst.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create output directory: {}", e))?;
        }
    }

    match format_lower {
        "png" => {
            img.save_with_format(dst, image::ImageFormat::Png)
                .map_err(|e| format!("Failed to save PNG: {}", e))?;
        }
        "jpeg" | "jpg" => {
            let rgb = img.to_rgb8();
            let output_file = std::fs::File::create(dst)
                .map_err(|e| format!("Failed to create output file ({}): {}", dst.display(), e))?;
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
                std::io::BufWriter::new(output_file),
                quality,
            );
            encoder
                .encode_image(&rgb)
                .map_err(|e| format!("Failed to encode JPEG: {}", e))?;
        }
        _ => return Err(format!("Unsupported format: {}", format_lower)),
    }
    Ok(())
}

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

    // Refuse to overwrite the source. The source already exists so we can
    // canonicalize it; the destination may not exist yet, so we resolve the
    // parent and recombine.
    let src_canon = canonicalize_existing(std::path::Path::new(&source_path));
    let dst_path = std::path::Path::new(&output_path);
    let dst_canon = match dst_path.parent() {
        Some(p) if !p.as_os_str().is_empty() => {
            // If the parent doesn't exist yet we can't canonicalize; assume it
            // is safe and let create_dir_all handle creation.
            let parent_canon = canonicalize_existing(p);
            match dst_path.file_name() {
                Some(name) => parent_canon.join(name),
                None => dst_path.to_path_buf(),
            }
        }
        _ => dst_path.to_path_buf(),
    };
    if src_canon == dst_canon {
        return Err(format!(
            "Refusing to overwrite the source file: {}",
            source_path
        ));
    }

    let src = source_path.clone();
    let dst = output_path.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<(), String> {
        run_export_pipeline(
            &src,
            std::path::Path::new(&dst),
            &format_lower,
            quality,
            max_long_edge,
            border,
            watermark,
        )
    })
    .await
    .map_err(|e| format!("Export task panicked: {}", e))?;

    result?;
    Ok(output_path)
}

// ─── Batch Export ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchExportRequest {
    pub source_path: String,
    pub output_dir: String,
    /// Caller-proposed filename. May still be reconciled (rename suffix) or
    /// rejected (existing file + skip policy) on this side.
    pub filename: String,
    pub format: String,
    pub quality: u8,
    pub max_long_edge: Option<u32>,
    pub border: Option<border::BorderConfig>,
    pub watermark: Option<watermark::WatermarkConfig>,
    /// "skip" | "overwrite" | "rename"
    pub overwrite_policy: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchExportResult {
    /// "succeeded" | "skipped" | "failed"
    pub status: String,
    pub output_path: Option<String>,
    pub final_filename: Option<String>,
    pub error: Option<String>,
}

/// Batch-friendly export. Resolves the final on-disk filename atomically on
/// the Rust side so the JS layer can't race or get tricked into writing
/// outside the requested output directory.
#[tauri::command]
pub async fn batch_export_image(
    request: BatchExportRequest,
) -> Result<BatchExportResult, String> {
    if !std::path::Path::new(&request.source_path).exists() {
        return Ok(BatchExportResult {
            status: "failed".into(),
            output_path: None,
            final_filename: None,
            error: Some(format!("Source not found: {}", request.source_path)),
        });
    }

    let format_lower = request.format.to_lowercase();
    if !matches!(format_lower.as_str(), "png" | "jpeg" | "jpg") {
        return Ok(BatchExportResult {
            status: "failed".into(),
            output_path: None,
            final_filename: None,
            error: Some(format!("Unsupported format: {}", request.format)),
        });
    }

    let dir_path = std::path::Path::new(&request.output_dir);
    if !dir_path.exists() {
        std::fs::create_dir_all(dir_path)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    } else if !dir_path.is_dir() {
        return Ok(BatchExportResult {
            status: "failed".into(),
            output_path: None,
            final_filename: None,
            error: Some(format!("Output is not a directory: {}", request.output_dir)),
        });
    }

    // 1. Filename safety: must be a single basename, no separators, no escape.
    let initial = match safe_join_output(&request.output_dir, &request.filename) {
        Ok(p) => p,
        Err(e) => {
            return Ok(BatchExportResult {
                status: "failed".into(),
                output_path: None,
                final_filename: None,
                error: Some(e),
            });
        }
    };

    // 2. Reconcile against existing files according to policy.
    let (resolved_path, resolved_name) = match request.overwrite_policy.as_str() {
        "overwrite" => (initial.clone(), request.filename.clone()),
        "skip" => {
            if initial.exists() {
                return Ok(BatchExportResult {
                    status: "skipped".into(),
                    output_path: None,
                    final_filename: None,
                    error: None,
                });
            }
            (initial.clone(), request.filename.clone())
        }
        "rename" | _ => {
            if !initial.exists() {
                (initial.clone(), request.filename.clone())
            } else {
                let (stem, ext) = split_basename(&request.filename);
                let mut chosen: Option<(std::path::PathBuf, String)> = None;
                for i in 1..1000 {
                    let candidate_name = if ext.is_empty() {
                        format!("{}_{}", stem, i)
                    } else {
                        format!("{}_{}.{}", stem, i, ext)
                    };
                    let candidate_path = match safe_join_output(&request.output_dir, &candidate_name) {
                        Ok(p) => p,
                        Err(e) => {
                            return Ok(BatchExportResult {
                                status: "failed".into(),
                                output_path: None,
                                final_filename: None,
                                error: Some(e),
                            });
                        }
                    };
                    if !candidate_path.exists() {
                        chosen = Some((candidate_path, candidate_name));
                        break;
                    }
                }
                match chosen {
                    Some(c) => c,
                    None => {
                        return Ok(BatchExportResult {
                            status: "failed".into(),
                            output_path: None,
                            final_filename: None,
                            error: Some(
                                "Could not find a free filename after 1000 attempts".into(),
                            ),
                        });
                    }
                }
            }
        }
    };

    // 3. Source != destination protection. Same logic as the single-export
    //    command: canonicalize both ends and refuse if they collide.
    let src_canon = canonicalize_existing(std::path::Path::new(&request.source_path));
    let dst_canon = canonicalize_existing(&resolved_path);
    if src_canon == dst_canon {
        return Ok(BatchExportResult {
            status: "failed".into(),
            output_path: None,
            final_filename: None,
            error: Some(format!(
                "Refusing to overwrite source file: {}",
                request.source_path
            )),
        });
    }

    // 4. Run the pixel pipeline on a blocking thread.
    let src = request.source_path.clone();
    let dst = resolved_path.clone();
    let fmt = format_lower.clone();
    let q = request.quality;
    let max_edge = request.max_long_edge;
    let border = request.border;
    let watermark = request.watermark;
    let pipeline_result = tokio::task::spawn_blocking(move || -> Result<(), String> {
        run_export_pipeline(&src, &dst, &fmt, q, max_edge, border, watermark)
    })
    .await
    .map_err(|e| format!("Export task panicked: {}", e))?;

    match pipeline_result {
        Ok(()) => Ok(BatchExportResult {
            status: "succeeded".into(),
            output_path: Some(resolved_path.to_string_lossy().to_string()),
            final_filename: Some(resolved_name),
            error: None,
        }),
        Err(e) => Ok(BatchExportResult {
            status: "failed".into(),
            output_path: None,
            final_filename: None,
            error: Some(e),
        }),
    }
}

fn split_basename(filename: &str) -> (String, String) {
    if let Some(dot) = filename.rfind('.') {
        if dot > 0 {
            return (filename[..dot].to_string(), filename[dot + 1..].to_string());
        }
    }
    (filename.to_string(), String::new())
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
