//! ZeroLu prompt-library sync (MVP5 §35.4 - §35.6).
//!
//! Pulls the upstream README through `reqwest`, runs a tolerant Markdown
//! parser to extract prompt blocks, maps upstream sections to Photonix
//! categories, upserts rows into `prompt_templates` with `provider="zerolu"`,
//! and records the sync metadata in `prompt_library_syncs`. User-specific
//! fields (`is_favorite`, `usage_count`, `last_used_at`) survive re-sync via
//! the upsert helper in `prompt_templates::upsert_prompt_template_inner`.

use crate::storage::database::Database;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

const ZEROLU_README_URL: &str =
    "https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main/README.md";
const ZEROLU_REPO_URL: &str = "https://github.com/ZeroLu/awesome-gpt-image";
const ZEROLU_PROVIDER: &str = "zerolu";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptLibrarySyncResult {
    pub success: bool,
    pub provider: String,
    pub source_url: String,
    pub imported_count: usize,
    pub skipped_count: usize,
    pub warnings: Vec<String>,
    pub error: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptLibrarySyncStatus {
    pub provider: String,
    pub last_synced_at: Option<String>,
    pub last_status: Option<String>,
    pub last_error: Option<String>,
    pub imported_count: i64,
    pub total_local_count: i64,
}

/// Sync the ZeroLu prompt library from GitHub Raw. The Rust runtime owns
/// the network call so we don't have CORS or browser fetch quirks.
#[tauri::command]
pub async fn sync_zerolu_prompt_library(
    app: tauri::AppHandle,
    db: State<'_, Database>,
) -> Result<PromptLibrarySyncResult, String> {
    let _ = app; // app handle reserved for future progress events
    let started_at = super::chrono_now();
    let sync_id = uuid::Uuid::new_v4().to_string();

    // 1. Insert a "running" row up front so the UI can show progress and the
    //    last status survives a failed download.
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let _ = conn.execute(
            "INSERT INTO prompt_library_syncs
             (id, provider, source_url, status, imported_count, skipped_count,
              warning_json, error_message, started_at, finished_at)
             VALUES (?1, ?2, ?3, ?4, 0, 0, NULL, NULL, ?5, NULL)",
            params![sync_id, ZEROLU_PROVIDER, ZEROLU_README_URL, "running", started_at],
        );
    }

    // 2. Download.
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let response = match client.get(ZEROLU_README_URL).send().await {
        Ok(r) => r,
        Err(e) => return Ok(finalize_sync(&db, &sync_id, &started_at, false, 0, 0, vec![], Some(format!("Network error: {}", e)))),
    };
    if !response.status().is_success() {
        let status = response.status();
        let err = format!("Upstream returned HTTP {}", status);
        return Ok(finalize_sync(&db, &sync_id, &started_at, false, 0, 0, vec![], Some(err)));
    }
    let body = match response.text().await {
        Ok(b) => b,
        Err(e) => return Ok(finalize_sync(&db, &sync_id, &started_at, false, 0, 0, vec![], Some(format!("Failed to read response: {}", e)))),
    };

    // 3. Parse.
    let parse_outcome = parse_zerolu_markdown(&body);

    // 4. Upsert into prompt_templates. Existing favorite/usage fields are
    //    preserved by upsert_prompt_template_inner.
    let mut imported = 0usize;
    let mut skipped = parse_outcome.skipped_count;
    let mut warnings = parse_outcome.warnings.clone();

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        for parsed in &parse_outcome.prompts {
            let row = parsed.into_row(&started_at);
            match super::prompt_templates::__internal_upsert(&conn, &row) {
                Ok(()) => imported += 1,
                Err(e) => {
                    skipped += 1;
                    warnings.push(format!("Failed to import \"{}\": {}", parsed.title, e));
                }
            }
        }
    }

    Ok(finalize_sync(
        &db,
        &sync_id,
        &started_at,
        true,
        imported,
        skipped,
        warnings,
        None,
    ))
}

#[tauri::command]
pub fn get_prompt_library_sync_status(
    db: State<'_, Database>,
    provider: String,
) -> Result<PromptLibrarySyncStatus, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let last: Option<(Option<String>, String, Option<String>, i64)> = conn
        .query_row(
            "SELECT finished_at, status, error_message, imported_count
             FROM prompt_library_syncs
             WHERE provider = ?1 AND status != 'running'
             ORDER BY started_at DESC LIMIT 1",
            params![provider],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )
        .ok();

    let total_local_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM prompt_templates WHERE provider = ?1",
            params![provider],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(PromptLibrarySyncStatus {
        provider,
        last_synced_at: last.as_ref().and_then(|t| t.0.clone()),
        last_status: last.as_ref().map(|t| t.1.clone()),
        last_error: last.as_ref().and_then(|t| t.2.clone()),
        imported_count: last.as_ref().map(|t| t.3).unwrap_or(0),
        total_local_count,
    })
}

fn finalize_sync(
    db: &State<'_, Database>,
    sync_id: &str,
    _started_at: &str,
    success: bool,
    imported: usize,
    skipped: usize,
    warnings: Vec<String>,
    error: Option<String>,
) -> PromptLibrarySyncResult {
    let finished_at = super::chrono_now();
    let status = if success { "succeeded" } else { "failed" };

    if let Ok(conn) = db.conn.lock() {
        let warning_json = if warnings.is_empty() {
            None
        } else {
            serde_json::to_string(&warnings).ok()
        };
        let _ = conn.execute(
            "UPDATE prompt_library_syncs
             SET status = ?1, imported_count = ?2, skipped_count = ?3,
                 warning_json = ?4, error_message = ?5, finished_at = ?6
             WHERE id = ?7",
            params![
                status,
                imported as i64,
                skipped as i64,
                warning_json,
                error,
                finished_at,
                sync_id,
            ],
        );
    }

    PromptLibrarySyncResult {
        success,
        provider: ZEROLU_PROVIDER.to_string(),
        source_url: ZEROLU_README_URL.to_string(),
        imported_count: imported,
        skipped_count: skipped,
        warnings,
        error,
        started_at: _started_at.to_string(),
        finished_at: Some(finished_at),
    }
}

// ─── Parser ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct ParsedPrompt {
    /// Stable hashed id so re-sync upserts the same row.
    external_id: String,
    title: String,
    prompt: String,
    upstream_category: Option<String>,
    photonix_category: String,
    source_original_url: Option<String>,
    preview_image_url: Option<String>,
}

#[derive(Debug, Default)]
struct ParseOutcome {
    prompts: Vec<ParsedPrompt>,
    warnings: Vec<String>,
    skipped_count: usize,
}

impl ParsedPrompt {
    fn into_row(&self, now: &str) -> super::prompt_templates::PromptTemplateRow {
        let id = format!("zerolu-{}", self.external_id);
        super::prompt_templates::PromptTemplateRow {
            id,
            mode: "generate".to_string(),
            category: self.photonix_category.clone(),
            title: self.title.clone(),
            description: None,
            prompt: self.prompt.clone(),
            negative_prompt: None,
            tags_json: Some(
                serde_json::to_string(&self.upstream_category.iter().collect::<Vec<_>>())
                    .unwrap_or_else(|_| "[]".to_string()),
            ),
            language: detect_language(&self.prompt).to_string(),
            source_name: Some("ZeroLu/awesome-gpt-image".to_string()),
            source_url: Some(ZEROLU_REPO_URL.to_string()),
            is_builtin: false,
            is_favorite: false,
            created_at: now.to_string(),
            updated_at: now.to_string(),
            external_id: Some(self.external_id.clone()),
            provider: Some(ZEROLU_PROVIDER.to_string()),
            upstream_category: self.upstream_category.clone(),
            source_repository: Some(ZEROLU_REPO_URL.to_string()),
            source_original_url: self.source_original_url.clone(),
            preview_image_url: self.preview_image_url.clone(),
            usage_count: 0,
            last_used_at: None,
            imported_at: Some(now.to_string()),
            synced_at: Some(now.to_string()),
            content_filter_status: "unreviewed".to_string(),
            content_filter_notes: None,
        }
    }
}

fn detect_language(text: &str) -> &'static str {
    if text.chars().any(|c| matches!(c, '\u{4E00}'..='\u{9FFF}')) {
        "zh-CN"
    } else {
        "en"
    }
}

fn stable_hash(input: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(input.as_bytes());
    let bytes = h.finalize();
    let mut s = String::with_capacity(16);
    for b in &bytes[..8] {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

/// Tolerant Markdown parser. The upstream README is heading-organised:
/// `#` for the doc title, `##` for top-level sections, `###` for
/// sub-sections, and prompts appear as fenced code blocks or as quoted
/// paragraphs underneath each heading. We track the current heading stack
/// and emit a ParsedPrompt per detected prompt block.
fn parse_zerolu_markdown(input: &str) -> ParseOutcome {
    let mut outcome = ParseOutcome::default();

    let mut current_section: Option<String> = None;
    let mut current_subsection: Option<String> = None;
    let mut current_link: Option<String> = None;
    let mut current_image: Option<String> = None;

    let mut iter = input.lines().peekable();
    while let Some(line) = iter.next() {
        let trimmed = line.trim();

        // Heading 2
        if let Some(rest) = trimmed.strip_prefix("## ") {
            current_section = Some(rest.trim().to_string());
            current_subsection = None;
            current_link = None;
            current_image = None;
            continue;
        }
        // Heading 3 or deeper
        if let Some(rest) = trimmed.strip_prefix("### ").or_else(|| trimmed.strip_prefix("#### ")) {
            current_subsection = Some(rest.trim().to_string());
            current_link = None;
            current_image = None;
            continue;
        }

        // Image link `![alt](url)`
        if let Some(url) = extract_image_url(trimmed) {
            current_image = Some(url);
            continue;
        }
        // Plain link `[text](url)` — keep the most recent before a prompt block
        if let Some(url) = extract_link_url(trimmed) {
            current_link = Some(url);
            continue;
        }

        // Fenced code block: collect content until closing fence
        if trimmed.starts_with("```") {
            let mut block = String::new();
            for next in iter.by_ref() {
                if next.trim_start().starts_with("```") {
                    break;
                }
                if !block.is_empty() {
                    block.push('\n');
                }
                block.push_str(next);
            }
            consume_prompt_block(
                block.trim(),
                current_section.as_deref(),
                current_subsection.as_deref(),
                current_link.as_deref(),
                current_image.as_deref(),
                &mut outcome,
            );
            // Don't reset section/subsection — they apply to subsequent prompts
            // until the next heading. We do clear per-prompt link/image hints.
            current_link = None;
            current_image = None;
            continue;
        }

        // Block-quoted prompt: `> ...`. Group consecutive `>` lines.
        if trimmed.starts_with("> ") || trimmed == ">" {
            let mut block = String::new();
            block.push_str(trimmed.trim_start_matches('>').trim());
            while let Some(next) = iter.peek() {
                let nt = next.trim();
                if nt.starts_with("> ") || nt == ">" {
                    block.push('\n');
                    block.push_str(nt.trim_start_matches('>').trim());
                    iter.next();
                } else {
                    break;
                }
            }
            consume_prompt_block(
                block.trim(),
                current_section.as_deref(),
                current_subsection.as_deref(),
                current_link.as_deref(),
                current_image.as_deref(),
                &mut outcome,
            );
            current_link = None;
            current_image = None;
            continue;
        }
    }

    if outcome.prompts.is_empty() {
        outcome
            .warnings
            .push("No prompt blocks detected in upstream README.".to_string());
    }

    outcome
}

fn consume_prompt_block(
    raw: &str,
    section: Option<&str>,
    subsection: Option<&str>,
    link: Option<&str>,
    image: Option<&str>,
    outcome: &mut ParseOutcome,
) {
    let cleaned = raw.trim().to_string();
    if cleaned.is_empty() || cleaned.len() < 16 {
        outcome.skipped_count += 1;
        return;
    }
    // Reject fenced blocks that look like code samples rather than prompts.
    if cleaned.starts_with("import ")
        || cleaned.starts_with("from ")
        || cleaned.contains("function (")
        || cleaned.starts_with("const ")
        || cleaned.starts_with("$ ")
        || cleaned.starts_with("npm ")
    {
        outcome.skipped_count += 1;
        return;
    }

    let upstream_category = subsection
        .map(String::from)
        .or_else(|| section.map(String::from));
    let photonix_category = map_to_photonix_category(upstream_category.as_deref());
    let title = derive_title(&cleaned, subsection, section);

    outcome.prompts.push(ParsedPrompt {
        external_id: stable_hash(&cleaned),
        title,
        prompt: cleaned,
        upstream_category,
        photonix_category,
        source_original_url: link.map(String::from),
        preview_image_url: image.map(String::from),
    });
}

fn extract_image_url(line: &str) -> Option<String> {
    if !line.starts_with("![") {
        return None;
    }
    let close = line.find("](")?;
    let end = line[close + 2..].find(')')?;
    Some(line[close + 2..close + 2 + end].to_string())
}

fn extract_link_url(line: &str) -> Option<String> {
    let lower = line.to_lowercase();
    if !lower.contains("http") {
        return None;
    }
    let start = line.find('(')?;
    if !line[..start].contains('[') {
        return None;
    }
    let end = line[start + 1..].find(')')?;
    Some(line[start + 1..start + 1 + end].to_string())
}

fn map_to_photonix_category(upstream: Option<&str>) -> String {
    let cat = upstream.unwrap_or("").to_lowercase();
    let buckets: &[(&[&str], &str)] = &[
        (&["portrait", "人像", "肖像", "人物"], "portrait"),
        (
            &[
                "landscape", "风景", "自然", "nature", "scenery", "outdoor",
            ],
            "landscape",
        ),
        (&["product", "commercial", "ad", "电商", "广告", "产品"], "product"),
        (
            &["architecture", "interior", "建筑", "室内", "indoor", "home"],
            "architecture",
        ),
        (&["food", "drink", "美食", "饮料", "beverage", "cuisine"], "food"),
        (
            &[
                "art", "illustration", "style", "painting", "艺术", "插画", "风格",
            ],
            "art",
        ),
    ];
    for (keys, mapped) in buckets {
        for k in *keys {
            if cat.contains(k) {
                return (*mapped).to_string();
            }
        }
    }
    "other".to_string()
}

fn derive_title(prompt: &str, subsection: Option<&str>, section: Option<&str>) -> String {
    if let Some(s) = subsection {
        if !s.trim().is_empty() {
            return truncate(s.trim(), 60);
        }
    }
    // First sentence-ish chunk of the prompt itself.
    let first_line = prompt.lines().next().unwrap_or(prompt);
    let stop = first_line
        .find(|c: char| matches!(c, '.' | '。' | '!' | '！' | '?' | '？' | ',' | '，'))
        .unwrap_or(first_line.len());
    let candidate = first_line[..stop].trim();
    if !candidate.is_empty() {
        return truncate(candidate, 60);
    }
    if let Some(s) = section {
        return truncate(s.trim(), 60);
    }
    "Untitled prompt".to_string()
}

fn truncate(s: &str, max_chars: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= max_chars {
        s.to_string()
    } else {
        let mut out: String = chars[..max_chars].iter().collect();
        out.push('…');
        out
    }
}
