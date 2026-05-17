use serde::{Deserialize, Serialize};

use super::secrets;

#[derive(Debug, Serialize, Deserialize)]
pub struct CompilePromptRequest {
    pub user_prompt: String,
    pub image_type: String,
    pub edit_mode: String,
    pub preserve_identity: bool,
    pub preserve_composition: bool,
    pub mask_present: bool,
    pub quality_mode: String,
    pub base_url: String,
    pub text_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompiledPromptResult {
    pub edit_goal: String,
    pub edit_scope: String,
    pub preserve: Vec<String>,
    pub style_constraints: Vec<String>,
    pub negative_constraints: Vec<String>,
    pub quality_mode: String,
}

/// Compile a user prompt into a structured edit instruction via the text model.
/// Runs entirely in Rust — no CORS issues, API key never enters the JS layer.
#[tauri::command]
pub async fn compile_prompt(
    app: tauri::AppHandle,
    request: CompilePromptRequest,
) -> Result<CompiledPromptResult, String> {
    let api_key = secrets::read_api_key(&app)?
        .ok_or("No API key configured. Please set it in Settings.")?;

    let system_prompt = build_system_prompt(&request);

    let body = serde_json::json!({
        "model": request.text_model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": request.user_prompt }
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.3
    });

    let url = format!(
        "{}/chat/completions",
        request.base_url.trim_end_matches('/')
    );

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Text model request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let err_body = response.text().await.unwrap_or_default();
        return Err(format!("Text model error ({}): {}", status, &err_body[..err_body.len().min(300)]));
    }

    let resp_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse text model response: {}", e))?;

    let content = resp_json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or("Empty response from text model")?;

    // Parse the JSON output from the model
    let parsed: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| format!("Model returned invalid JSON: {}. Raw: {}", e, &content[..content.len().min(200)]))?;

    Ok(CompiledPromptResult {
        edit_goal: parsed.get("editGoal").or(parsed.get("edit_goal"))
            .and_then(|v| v.as_str()).unwrap_or(&request.user_prompt).to_string(),
        edit_scope: parsed.get("editScope").or(parsed.get("edit_scope"))
            .and_then(|v| v.as_str()).unwrap_or("local_masked_region").to_string(),
        preserve: extract_string_array(&parsed, &["preserve"]),
        style_constraints: extract_string_array(&parsed, &["styleConstraints", "style_constraints"]),
        negative_constraints: extract_string_array(&parsed, &["negativeConstraints", "negative_constraints"]),
        quality_mode: request.quality_mode.clone(),
    })
}

fn build_system_prompt(req: &CompilePromptRequest) -> String {
    format!(
r#"You are a photo editing prompt compiler. Given a user's edit request, produce a structured JSON instruction for an AI image editor.

Context:
- Image type: {}
- Edit mode: {}
- Mask present: {}
- Quality mode: {}
- Preserve identity: {}
- Preserve composition: {}

Output a JSON object with these exact fields:
- editGoal: concise description of the edit
- editScope: "global" or "local_masked_region"
- preserve: array of things to preserve
- styleConstraints: array of style requirements
- negativeConstraints: array of things to avoid
- qualityMode: "{}"

Respond ONLY with valid JSON, no markdown."#,
        req.image_type, req.edit_mode, req.mask_present,
        req.quality_mode, req.preserve_identity, req.preserve_composition,
        req.quality_mode
    )
}

fn extract_string_array(json: &serde_json::Value, keys: &[&str]) -> Vec<String> {
    for key in keys {
        if let Some(arr) = json.get(*key).and_then(|v| v.as_array()) {
            return arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
        }
    }
    Vec::new()
}
