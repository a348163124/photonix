//! Reference style image analysis (MVP3 §33.8).
//!
//! Reads a reference image from disk, computes a local color analysis,
//! resizes to a small proxy, base64-encodes it, and asks a vision-capable
//! chat model to describe the photographic style. Returns both the local
//! numeric summary and the structured AI guidance, plus a draft style
//! profile the user can edit and save.

use base64::Engine;
use image::ImageEncoder;
use serde::{Deserialize, Serialize};

use super::secrets;
use super::styles::StyleProfileRow;
use crate::image_core::color_analysis::{self, LocalColorAnalysis};

const PROXY_LONG_EDGE: u32 = 768;
const PROXY_JPEG_QUALITY: u8 = 80;

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalyzeReferenceStyleRequest {
    pub image_path: String,
    pub base_url: String,
    pub text_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiStyleAnalysis {
    pub summary: String,
    #[serde(rename = "colorMood")]
    pub color_mood: String,
    pub temperature: String,
    pub saturation: String,
    pub contrast: String,
    #[serde(rename = "shadowBehavior")]
    pub shadow_behavior: String,
    #[serde(rename = "highlightBehavior")]
    pub highlight_behavior: String,
    #[serde(rename = "dominantPalette", default)]
    pub dominant_palette: Vec<String>,
    #[serde(rename = "landscapeGuidance", default)]
    pub landscape_guidance: Vec<String>,
    #[serde(rename = "portraitGuidance", default)]
    pub portrait_guidance: Vec<String>,
    #[serde(rename = "negativeConstraints", default)]
    pub negative_constraints: Vec<String>,
    #[serde(rename = "reusablePromptFragment")]
    pub reusable_prompt_fragment: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalyzeReferenceStyleResult {
    pub success: bool,
    pub error: Option<String>,
    pub local_color: Option<LocalColorAnalysis>,
    pub ai: Option<AiStyleAnalysis>,
    pub draft_profile: Option<StyleProfileRow>,
}

#[tauri::command]
pub async fn analyze_reference_style(
    app: tauri::AppHandle,
    request: AnalyzeReferenceStyleRequest,
) -> Result<AnalyzeReferenceStyleResult, String> {
    if !std::path::Path::new(&request.image_path).exists() {
        return Ok(failure(format!(
            "Reference image not found: {}",
            request.image_path
        )));
    }

    let api_key = secrets::read_api_key(&app)?
        .ok_or("No API key configured. Please set it in Settings.")?;

    // 1. Local color analysis (cheap, runs in blocking thread to keep UI alive)
    let local_path = request.image_path.clone();
    let local_color = tokio::task::spawn_blocking(move || color_analysis::analyze(&local_path))
        .await
        .map_err(|e| format!("Local analysis task panicked: {}", e))??;

    // 2. Build a small JPEG proxy for the vision request
    let proxy_b64 = build_proxy_b64(&request.image_path).await?;

    // 3. Call vision-capable chat model
    let ai = call_vision_model(
        &request.base_url,
        &api_key,
        &request.text_model,
        &proxy_b64,
        &local_color,
    )
    .await;

    let ai = match ai {
        Ok(a) => a,
        Err(e) => {
            // Local analysis still useful even if AI fails
            return Ok(AnalyzeReferenceStyleResult {
                success: false,
                error: Some(format!("AI style analysis failed: {}", e)),
                local_color: Some(local_color),
                ai: None,
                draft_profile: None,
            });
        }
    };

    // 4. Build a draft profile from the AI output
    let draft = make_draft_profile(&request.image_path, &ai, &local_color);

    Ok(AnalyzeReferenceStyleResult {
        success: true,
        error: None,
        local_color: Some(local_color),
        ai: Some(ai),
        draft_profile: Some(draft),
    })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn failure(msg: String) -> AnalyzeReferenceStyleResult {
    AnalyzeReferenceStyleResult {
        success: false,
        error: Some(msg),
        local_color: None,
        ai: None,
        draft_profile: None,
    }
}

async fn build_proxy_b64(image_path: &str) -> Result<String, String> {
    let path = image_path.to_string();
    let bytes = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, String> {
        let img = image::open(&path).map_err(|e| format!("Failed to open reference: {}", e))?;
        use image::GenericImageView;
        let (w, h) = img.dimensions();
        let edge = w.max(h);
        let resized = if edge > PROXY_LONG_EDGE {
            let scale = PROXY_LONG_EDGE as f32 / edge as f32;
            img.resize(
                ((w as f32 * scale) as u32).max(1),
                ((h as f32 * scale) as u32).max(1),
                image::imageops::FilterType::Triangle,
            )
        } else {
            img
        };
        let rgb = resized.to_rgb8();
        let mut buf = Vec::new();
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, PROXY_JPEG_QUALITY);
        encoder
            .write_image(
                rgb.as_raw(),
                rgb.width(),
                rgb.height(),
                image::ExtendedColorType::Rgb8,
            )
            .map_err(|e| format!("Failed to encode reference proxy: {}", e))?;
        Ok(buf)
    })
    .await
    .map_err(|e| format!("Reference proxy task panicked: {}", e))??;

    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

async fn call_vision_model(
    base_url: &str,
    api_key: &str,
    model: &str,
    image_b64: &str,
    local: &LocalColorAnalysis,
) -> Result<AiStyleAnalysis, String> {
    let system = build_system_prompt(local);
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": format!("data:image/jpeg;base64,{}", image_b64)
                        }
                    },
                    {
                        "type": "text",
                        "text": "Analyze this reference photo's photographic style. Output strict JSON matching the schema in the system prompt."
                    }
                ]
            }
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.3
    });

    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("Vision model request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let err = response.text().await.unwrap_or_default();
        return Err(format!("Vision model error ({}): {}", status, &err[..err.len().min(300)]));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Invalid JSON response: {}", e))?;

    let content = json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or("Empty response from vision model")?;

    serde_json::from_str::<AiStyleAnalysis>(content)
        .map_err(|e| format!("Model returned invalid analysis JSON: {}. Raw: {}", e, &content[..content.len().min(300)]))
}

fn build_system_prompt(local: &LocalColorAnalysis) -> String {
    format!(
        r#"You are a photographic style analyst.

Look ONLY at color, tone, light, and overall photographic style of the reference image.

Hard rules:
- Do NOT identify any people, faces, brands, locations, or copyrighted content.
- Do NOT describe any specific subjects, objects, or composition.
- Describe ONLY style: color mood, light direction in tonal terms, contrast feel, palette.

Local image stats (already computed locally) for grounding:
- average HSL: H≈{h:.0}°, S≈{s:.2}, L≈{l:.2}
- warm/cool balance: {warm:.2}  (-1 cool .. +1 warm)
- saturation mean: {sat:.2}
- contrast estimate: {contrast:.2}
- dominant palette: {palette:?}

Respond with strict JSON only, matching this schema:
{{
  "summary": string,
  "colorMood": string,
  "temperature": "cool" | "neutral" | "warm",
  "saturation": "low" | "natural" | "rich",
  "contrast": "soft" | "balanced" | "strong",
  "shadowBehavior": string,
  "highlightBehavior": string,
  "dominantPalette": [hex string, ...],
  "landscapeGuidance": [string, ...],
  "portraitGuidance": [string, ...],
  "negativeConstraints": [string, ...],
  "reusablePromptFragment": string
}}

The "reusablePromptFragment" should be a short instruction the editing model can append to a user prompt to mimic this style without copying any subject from the reference."#,
        h = local.average_hsl.h,
        s = local.average_hsl.s,
        l = local.average_hsl.l,
        warm = local.warm_cool_balance,
        sat = local.saturation_mean,
        contrast = local.contrast_estimate,
        palette = local.dominant_palette,
    )
}

fn make_draft_profile(
    image_path: &str,
    ai: &AiStyleAnalysis,
    _local: &LocalColorAnalysis,
) -> StyleProfileRow {
    let now = super::chrono_now();
    let id = format!("style-ref-{}", uuid::Uuid::new_v4());

    let color_mood = serde_json::json!({
        "temperature": ai.temperature,
        "saturation": ai.saturation,
        "contrast": ai.contrast,
    });

    StyleProfileRow {
        id,
        name: derive_name(&ai.summary),
        category: "custom".into(),
        source: "reference_analysis".into(),
        reference_image_path: Some(image_path.to_string()),
        description: ai.summary.clone(),
        style_summary: ai.color_mood.clone(),
        positive_prompt: ai.reusable_prompt_fragment.clone(),
        negative_prompt: ai.negative_constraints.join("; "),
        color_mood_json: Some(color_mood.to_string()),
        preserve_identity: false,
        preserve_composition: true,
        is_default: false,
        created_at: now.clone(),
        updated_at: now,
    }
}

fn derive_name(summary: &str) -> String {
    // First three words of the summary, title-cased, fallback "Reference Style"
    let words: Vec<&str> = summary.split_whitespace().take(3).collect();
    if words.is_empty() {
        return "Reference Style".to_string();
    }
    words
        .iter()
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                Some(c) => c.to_uppercase().chain(chars).collect::<String>(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
