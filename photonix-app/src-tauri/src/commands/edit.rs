use crate::storage::database::Database;
use crate::storage::repository::{self, ImageVersionRow};
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageEncoder};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};
use uuid::Uuid;

use super::secrets;

// ─── Upload Proxy Profiles ───────────────────────────────────────────────────
//
// MVP2: Three configurable profiles. Default is "recommended" — a balance
// between visual quality and upload size for social-sharing landscape work.

#[derive(Debug, Clone, Copy)]
struct ProxyProfile {
    max_long_edge: u32,
    max_bytes: usize,
    start_jpeg_quality: u8,
    min_jpeg_quality: u8,
}

const PROFILE_FAST: ProxyProfile = ProxyProfile {
    max_long_edge: 3072,
    max_bytes: 5 * 1024 * 1024,
    start_jpeg_quality: 88,
    min_jpeg_quality: 68,
};

const PROFILE_RECOMMENDED: ProxyProfile = ProxyProfile {
    max_long_edge: 4096,
    max_bytes: 8 * 1024 * 1024,
    start_jpeg_quality: 90,
    min_jpeg_quality: 78,
};

const PROFILE_HIGH_QUALITY: ProxyProfile = ProxyProfile {
    max_long_edge: 5120,
    max_bytes: 12 * 1024 * 1024,
    start_jpeg_quality: 92,
    min_jpeg_quality: 82,
};

fn profile_for(name: Option<&str>) -> ProxyProfile {
    match name.unwrap_or("recommended") {
        "fast" => PROFILE_FAST,
        "high_quality" => PROFILE_HIGH_QUALITY,
        _ => PROFILE_RECOMMENDED,
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitEditRequest {
    pub image_id: String,
    pub source_path: String,
    pub mask_path: Option<String>,
    pub prompt: String,
    pub quality_mode: String,
    /// MVP2: optional. One of "fast" | "recommended" | "high_quality".
    /// Defaults to "recommended" when omitted.
    pub upload_proxy_profile: Option<String>,
    pub base_url: String,
    pub image_model: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitEditResult {
    pub success: bool,
    pub version_id: Option<String>,
    pub output_path: Option<String>,
    pub error: Option<String>,
}

/// Full image edit command:
/// 1. Reads source image bytes from disk
/// 2. Optionally reads and inverts mask (UI semantics → API semantics)
/// 3. Sends multipart POST to provider /images/edits with response_format=b64_json
/// 4. Saves returned image to versions directory
/// 5. Creates a version record in SQLite
/// 6. Returns the new version info
#[tauri::command]
pub async fn submit_edit(
    app: tauri::AppHandle,
    db: State<'_, Database>,
    request: SubmitEditRequest,
) -> Result<SubmitEditResult, String> {
    let api_key = secrets::read_api_key(&app)?
        .ok_or("No API key configured. Please set it in Settings.")?;

    let profile = profile_for(request.upload_proxy_profile.as_deref());

    // 1. Build a profile-bounded upload proxy so large photography sources stay responsive.
    let upload_proxy = prepare_upload_proxy(&request.source_path, profile)?;

    // 2. Read and invert mask if provided.
    //    UI convention: user paints red on areas TO EDIT (alpha > 0 = painted).
    //    OpenAI API convention: transparent (alpha=0) = area to edit.
    //    So we invert: painted pixels → alpha=0, unpainted → alpha=255.
    let mask_bytes = if let Some(ref mask_path) = request.mask_path {
        let raw = std::fs::read(mask_path)
            .map_err(|e| format!("Failed to read mask: {}", e))?;
        Some(prepare_mask_for_api(
            &raw,
            upload_proxy.width,
            upload_proxy.height,
        )?)
    } else {
        None
    };

    // 3. Build multipart request body
    let boundary = format!("----PhotonixBoundary{}", Uuid::new_v4().simple());
    let mut body: Vec<u8> = Vec::new();

    // model
    append_text_field(&mut body, &boundary, "model", &request.image_model);
    // prompt
    append_text_field(&mut body, &boundary, "prompt", &request.prompt);
    // size — auto lets the API match input dimensions
    append_text_field(&mut body, &boundary, "size", "auto");
    // response_format — explicitly request base64 to avoid URL expiry issues
    append_text_field(&mut body, &boundary, "response_format", "b64_json");

    // image file — upload the compressed proxy, not the original large source.
    append_file_field(
        &mut body,
        &boundary,
        "image",
        &upload_proxy.filename,
        &upload_proxy.mime_type,
        &upload_proxy.bytes,
    );

    // mask file (inverted for API semantics)
    if let Some(ref mask_data) = mask_bytes {
        append_file_field(
            &mut body,
            &boundary,
            "mask",
            "mask.png",
            "image/png",
            mask_data,
        );
    }

    // Close boundary
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

    // 4. Send request
    let url = format!("{}/images/edits", request.base_url.trim_end_matches('/'));

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header(
            "Content-Type",
            format!("multipart/form-data; boundary={}", boundary),
        )
        .body(body)
        .timeout(std::time::Duration::from_secs(180))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let error_body = response.text().await.unwrap_or_default();
        // Try to extract a readable error message from JSON
        let readable_error = parse_provider_error(&error_body, status);
        return Ok(SubmitEditResult {
            success: false,
            version_id: None,
            output_path: None,
            error: Some(readable_error),
        });
    }

    // 5. Parse response
    let resp_body = response.bytes().await.map_err(|e| e.to_string())?;
    let resp_json: serde_json::Value =
        serde_json::from_slice(&resp_body).map_err(|e| format!("Invalid JSON response: {}", e))?;

    let output_bytes = extract_image_from_response(&resp_json, &client).await?;

    // 6. Save to versions directory
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let version_id = Uuid::new_v4().to_string();
    let version_dir = app_data_dir.join("versions").join(&request.image_id);
    std::fs::create_dir_all(&version_dir).map_err(|e| e.to_string())?;

    let output_path = version_dir.join(format!("{}.png", version_id));
    std::fs::write(&output_path, &output_bytes)
        .map_err(|e| format!("Failed to save result: {}", e))?;

    // 7. Get dimensions
    let (width, height) = image::image_dimensions(&output_path)
        .map_err(|e| format!("Failed to read result dimensions: {}", e))?;

    let file_size = output_bytes.len() as i64;
    let output_path_str = output_path.to_string_lossy().to_string();

    // 8. Create version record
    let version_kind = if request.quality_mode == "final" {
        "final"
    } else {
        "draft"
    };

    let version = ImageVersionRow {
        id: version_id.clone(),
        image_id: request.image_id.clone(),
        parent_version_id: None,
        version_kind: version_kind.to_string(),
        storage_path: output_path_str.clone(),
        width: width as i64,
        height: height as i64,
        file_size_bytes: Some(file_size),
        is_current: true,
        created_at: super::chrono_now(),
    };

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Unset previous current
    conn.execute(
        "UPDATE image_versions SET is_current = 0 WHERE image_id = ?1 AND is_current = 1",
        rusqlite::params![request.image_id],
    )
    .map_err(|e| e.to_string())?;

    repository::insert_version(&conn, &version)?;

    Ok(SubmitEditResult {
        success: true,
        version_id: Some(version_id),
        output_path: Some(output_path_str),
        error: None,
    })
}

/// Save a mask data URL (base64 PNG from canvas) to a temp file on disk.
#[tauri::command]
pub fn save_mask_to_disk(
    app: tauri::AppHandle,
    image_id: String,
    mask_data_url: String,
) -> Result<String, String> {
    let base64_data = mask_data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or("Invalid mask data URL format")?;

    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode mask base64: {}", e))?;

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mask_dir = app_data_dir.join("cache").join("masks");
    std::fs::create_dir_all(&mask_dir).map_err(|e| e.to_string())?;

    let mask_path = mask_dir.join(format!("{}.png", image_id));
    std::fs::write(&mask_path, &bytes)
        .map_err(|e| format!("Failed to write mask: {}", e))?;

    Ok(mask_path.to_string_lossy().to_string())
}

// ─── Upload Proxy And Mask Preparation ───────────────────────────────────────

struct UploadProxy {
    bytes: Vec<u8>,
    width: u32,
    height: u32,
    filename: String,
    mime_type: String,
}

/// Create a JPEG upload proxy capped to the profile's long-edge and byte budget.
fn prepare_upload_proxy(source_path: &str, profile: ProxyProfile) -> Result<UploadProxy, String> {
    let img = image::open(source_path)
        .map_err(|e| format!("Failed to decode source image for upload proxy: {}", e))?;

    let resized = resize_to_long_edge(img, profile.max_long_edge);
    let (width, height) = resized.dimensions();
    let bytes = encode_jpeg_under_limit(&resized, profile)?;

    Ok(UploadProxy {
        bytes,
        width,
        height,
        filename: "photonix-upload-proxy.jpg".to_string(),
        mime_type: "image/jpeg".to_string(),
    })
}

fn resize_to_long_edge(img: DynamicImage, max_long_edge: u32) -> DynamicImage {
    let (width, height) = img.dimensions();
    let long_edge = width.max(height);

    if long_edge <= max_long_edge {
        return img;
    }

    let scale = max_long_edge as f32 / long_edge as f32;
    let target_width = ((width as f32 * scale).round() as u32).max(1);
    let target_height = ((height as f32 * scale).round() as u32).max(1);
    img.resize(target_width, target_height, FilterType::Lanczos3)
}

fn encode_jpeg_under_limit(img: &DynamicImage, profile: ProxyProfile) -> Result<Vec<u8>, String> {
    let rgb = img.to_rgb8();
    let mut quality = profile.start_jpeg_quality;

    loop {
        let mut bytes = Vec::new();
        {
            let mut encoder =
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, quality);
            encoder
                .encode_image(&rgb)
                .map_err(|e| format!("Failed to encode upload proxy: {}", e))?;
        }

        if bytes.len() <= profile.max_bytes {
            return Ok(bytes);
        }

        if quality <= profile.min_jpeg_quality {
            return Err(format!(
                "Upload proxy is still {:.1}MB after compression. Try a smaller source or a different proxy profile.",
                bytes.len() as f64 / (1024.0 * 1024.0)
            ));
        }

        quality = quality.saturating_sub(6);
    }
}

/// Resize mask to match upload proxy and invert semantics for the provider.
fn prepare_mask_for_api(
    png_bytes: &[u8],
    target_width: u32,
    target_height: u32,
) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(png_bytes)
        .map_err(|e| format!("Failed to decode mask PNG: {}", e))?;

    let resized = img.resize_exact(target_width, target_height, FilterType::Nearest);
    invert_mask_for_api(&resized)
}

/// Invert mask semantics from UI (painted=opaque red) to API (painted=transparent).
/// Input: PNG where painted areas have alpha > 0.
/// Output: PNG where painted areas have alpha = 0, unpainted areas have alpha = 255.
fn invert_mask_for_api(img: &DynamicImage) -> Result<Vec<u8>, String> {
    let mut rgba = img.to_rgba8();

    for pixel in rgba.pixels_mut() {
        let alpha = pixel[3];
        if alpha > 0 {
            // User painted here → make transparent (area to edit)
            pixel[0] = 0;
            pixel[1] = 0;
            pixel[2] = 0;
            pixel[3] = 0;
        } else {
            // User did NOT paint here → make opaque white (area to preserve)
            pixel[0] = 255;
            pixel[1] = 255;
            pixel[2] = 255;
            pixel[3] = 255;
        }
    }

    // Encode back to PNG
    let mut output = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(std::io::Cursor::new(&mut output));
    encoder
        .write_image(
            rgba.as_raw(),
            rgba.width(),
            rgba.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| format!("Failed to encode inverted mask: {}", e))?;

    Ok(output)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn append_text_field(body: &mut Vec<u8>, boundary: &str, name: &str, value: &str) {
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(
        format!("Content-Disposition: form-data; name=\"{}\"\r\n\r\n", name).as_bytes(),
    );
    body.extend_from_slice(value.as_bytes());
    body.extend_from_slice(b"\r\n");
}

fn append_file_field(
    body: &mut Vec<u8>,
    boundary: &str,
    name: &str,
    filename: &str,
    content_type: &str,
    data: &[u8],
) {
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(
        format!(
            "Content-Disposition: form-data; name=\"{}\"; filename=\"{}\"\r\n",
            name, filename
        )
        .as_bytes(),
    );
    body.extend_from_slice(format!("Content-Type: {}\r\n\r\n", content_type).as_bytes());
    body.extend_from_slice(data);
    body.extend_from_slice(b"\r\n");
}

/// Extract image bytes from provider response. Fully async — no blocking calls.
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

    let first = data_arr
        .first()
        .ok_or("Response 'data' array is empty")?;

    // Prefer b64_json (we explicitly requested it)
    if let Some(b64) = first.get("b64_json").and_then(|v| v.as_str()) {
        use base64::Engine;
        return base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| format!("Failed to decode b64_json: {}", e));
    }

    // Fallback: download from URL (async, no blocking)
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

/// Parse provider error body into a human-readable message.
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
