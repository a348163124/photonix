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
///
/// Source-link policy: ZeroLu's README puts the original X / Twitter /
/// other source link AFTER the prompt's code block more often than before
/// it (e.g. lines like `Source: https://x.com/...` or `**Source:** https://`
/// or just a bare URL). We therefore keep a small lookahead window after
/// each emitted prompt so we can back-fill `source_original_url` when the
/// link arrives in the next few non-empty lines, before any new prompt
/// block or heading starts.
fn parse_zerolu_markdown(input: &str) -> ParseOutcome {
    let mut outcome = ParseOutcome::default();

    let mut current_section: Option<String> = None;
    let mut current_subsection: Option<String> = None;
    let mut pending_link: Option<String> = None;
    let mut pending_image: Option<String> = None;
    // Index into `outcome.prompts` of the last emitted prompt that still
    // has empty source/preview metadata. We use this to back-fill source
    // info found in the lines that follow the prompt's code block.
    let mut backfill_target: Option<usize> = None;

    let mut iter = input.lines().peekable();
    while let Some(line) = iter.next() {
        let trimmed = line.trim();

        // Heading 2 — a new section ends any backfill window.
        if let Some(rest) = trimmed.strip_prefix("## ") {
            current_section = Some(rest.trim().to_string());
            current_subsection = None;
            pending_link = None;
            pending_image = None;
            backfill_target = None;
            continue;
        }
        // Heading 3 or deeper — a new sub-section also ends backfill.
        if let Some(rest) = trimmed.strip_prefix("### ").or_else(|| trimmed.strip_prefix("#### ")) {
            current_subsection = Some(rest.trim().to_string());
            pending_link = None;
            pending_image = None;
            backfill_target = None;
            continue;
        }

        // Image — accept both Markdown `![alt](url)` and HTML <img src="...">.
        if let Some(url) = extract_image_url(trimmed) {
            // Backfill image into the previous prompt if it doesn't have one yet.
            if let Some(idx) = backfill_target {
                if let Some(p) = outcome.prompts.get_mut(idx) {
                    if p.preview_image_url.is_none() {
                        p.preview_image_url = Some(url.clone());
                    }
                }
            }
            pending_image = Some(url);
            continue;
        }

        // Plain link `[text](url)` or bare `https://…` — capture for both
        // before- and after-prompt usage.
        if let Some(url) = extract_link_url(trimmed) {
            if let Some(idx) = backfill_target {
                if let Some(p) = outcome.prompts.get_mut(idx) {
                    if p.source_original_url.is_none() {
                        p.source_original_url = Some(url.clone());
                    }
                }
            }
            pending_link = Some(url);
            continue;
        }

        // "Source: https://..." labelled lines — common in ZeroLu README.
        if let Some(url) = extract_source_label_url(trimmed) {
            if let Some(idx) = backfill_target {
                if let Some(p) = outcome.prompts.get_mut(idx) {
                    if p.source_original_url.is_none() {
                        p.source_original_url = Some(url.clone());
                    }
                }
            }
            pending_link = Some(url);
            continue;
        }

        // Fenced code block: collect content until closing fence.
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
            let emitted_index = consume_prompt_block(
                block.trim(),
                current_section.as_deref(),
                current_subsection.as_deref(),
                pending_link.as_deref(),
                pending_image.as_deref(),
                &mut outcome,
            );
            // Don't reset section/subsection — they apply to subsequent
            // prompts until the next heading. The "pending" hints become
            // the backfill window for the prompt we just emitted.
            backfill_target = emitted_index;
            pending_link = None;
            pending_image = None;
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
            let emitted_index = consume_prompt_block(
                block.trim(),
                current_section.as_deref(),
                current_subsection.as_deref(),
                pending_link.as_deref(),
                pending_image.as_deref(),
                &mut outcome,
            );
            backfill_target = emitted_index;
            pending_link = None;
            pending_image = None;
            continue;
        }

        // Empty / decorative lines just keep the backfill window open.
        if trimmed.is_empty() || trimmed.starts_with("---") || trimmed.starts_with("===") {
            continue;
        }
        // Any other non-trivial paragraph closes the backfill window so we
        // don't accidentally attach unrelated metadata from much later in
        // the document.
        if backfill_target.is_some() && trimmed.len() > 80 {
            backfill_target = None;
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
) -> Option<usize> {
    let cleaned = raw.trim().to_string();
    if cleaned.is_empty() || cleaned.len() < 16 {
        outcome.skipped_count += 1;
        return None;
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
        return None;
    }

    let upstream_category = subsection
        .map(String::from)
        .or_else(|| section.map(String::from));
    // Map using BOTH the subsection (specific) and section (broader) so a
    // prompt under e.g. `## Photography & Photorealism` → `### Studio
    // Lighting` still maps to `portrait`/`product` rather than falling
    // through to `other` when the sub-heading alone doesn't contain a
    // recognised keyword.
    let photonix_category = map_to_photonix_category_v2(subsection, section);
    let title = derive_title(&cleaned, subsection, section);

    let prompt = ParsedPrompt {
        external_id: stable_hash(&cleaned),
        title,
        prompt: cleaned,
        upstream_category,
        photonix_category,
        source_original_url: link.map(String::from),
        preview_image_url: image.map(String::from),
    };
    outcome.prompts.push(prompt);
    Some(outcome.prompts.len() - 1)
}

fn extract_image_url(line: &str) -> Option<String> {
    let t = line.trim();
    // Markdown form: `![alt](url)` — may be wrapped in a link.
    if let Some(idx) = t.find("![") {
        let rest = &t[idx + 2..];
        if let Some(close) = rest.find("](") {
            if let Some(end) = rest[close + 2..].find(')') {
                return Some(rest[close + 2..close + 2 + end].to_string());
            }
        }
    }
    // HTML form: `<img ... src="url" ...>` (or `src='url'`). ZeroLu README
    // uses HTML img tags for many entries.
    if t.contains("<img") || t.contains("<IMG") {
        if let Some(url) = pick_attr(t, "src") {
            return Some(url);
        }
    }
    None
}

/// Tolerant attribute extractor for HTML-style attributes inside a single
/// line. Accepts both `src="..."` and `src='...'`.
fn pick_attr(line: &str, attr: &str) -> Option<String> {
    let needle_eq = format!("{}=", attr.to_lowercase());
    let lower = line.to_lowercase();
    let pos = lower.find(&needle_eq)?;
    // Walk past any whitespace after `=` (defensive).
    let after = &line[pos + needle_eq.len()..];
    let after_trim = after.trim_start();
    let quote = after_trim.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let body = &after_trim[1..];
    let close = body.find(quote)?;
    Some(body[..close].to_string())
}

fn extract_link_url(line: &str) -> Option<String> {
    let t = line.trim();
    let lower = t.to_lowercase();
    if !lower.contains("http") {
        return None;
    }
    // Standard markdown link: `[text](url)`
    if let Some(start) = t.find('(') {
        if t[..start].contains('[') {
            if let Some(end) = t[start + 1..].find(')') {
                let candidate = t[start + 1..start + 1 + end].trim();
                if candidate.starts_with("http") {
                    return Some(candidate.to_string());
                }
            }
        }
    }
    // Bare-URL line: skip lines that are also captured by the source-label
    // path so we don't double up.
    if lower.starts_with("source:") || lower.starts_with("**source") {
        return None;
    }
    if let Some(http) = t.find("http") {
        let url: String = t[http..]
            .chars()
            .take_while(|c| !c.is_whitespace() && *c != ')' && *c != ']' && *c != ',')
            .collect();
        if url.len() > 8 {
            return Some(url);
        }
    }
    None
}

/// Match lines like `Source: https://x.com/...`, `**Source:** https://...`,
/// `源: https://...`, or `From: https://...` and return the URL.
fn extract_source_label_url(line: &str) -> Option<String> {
    let lower = line.to_lowercase();
    let labels = [
        "source:",
        "**source:**",
        "**source**:",
        "原文:",
        "原文：",
        "出处:",
        "出处：",
        "来源:",
        "来源：",
        "from:",
        "via:",
    ];
    let mut hit = false;
    for l in &labels {
        if lower.contains(l) {
            hit = true;
            break;
        }
    }
    if !hit {
        return None;
    }
    let http_idx = line.find("http")?;
    let url: String = line[http_idx..]
        .chars()
        .take_while(|c| !c.is_whitespace() && *c != ')' && *c != ']' && *c != ',')
        .collect();
    if url.len() > 8 {
        Some(url)
    } else {
        None
    }
}

/// Category mapper that consults BOTH the immediate sub-section and the
/// broader top-level section. The sub-section wins when it carries a
/// recognisable keyword; otherwise we fall back to the section's keywords;
/// otherwise `other`.
fn map_to_photonix_category_v2(
    subsection: Option<&str>,
    section: Option<&str>,
) -> String {
    if let Some(s) = subsection {
        let mapped = map_to_photonix_category(Some(s));
        if mapped != "other" {
            return mapped;
        }
    }
    map_to_photonix_category(section)
}

fn map_to_photonix_category(upstream: Option<&str>) -> String {
    let cat = upstream.unwrap_or("").to_lowercase();
    let buckets: &[(&[&str], &str)] = &[
        (
            &[
                "portrait",
                "headshot",
                "selfie",
                "face",
                "model shoot",
                "fashion",
                "人像",
                "肖像",
                "人物",
                "脸部",
            ],
            "portrait",
        ),
        (
            &[
                "landscape",
                "scenery",
                "nature",
                "outdoor",
                "wilderness",
                "mountain",
                "ocean",
                "forest",
                "sunset",
                "风景",
                "自然",
                "户外",
                "山",
                "海",
            ],
            "landscape",
        ),
        (
            &[
                "product",
                "commercial",
                "advert",
                "ad photo",
                "ecom",
                "ecommerce",
                "packshot",
                "studio product",
                "电商",
                "广告",
                "产品",
                "商品",
            ],
            "product",
        ),
        (
            &[
                "architecture",
                "building",
                "interior",
                "real estate",
                "exterior",
                "建筑",
                "室内",
                "indoor",
                "home",
                "房屋",
                "住宅",
            ],
            "architecture",
        ),
        (
            &[
                "food",
                "drink",
                "美食",
                "饮料",
                "beverage",
                "cuisine",
                "餐",
                "饭",
                "menu",
            ],
            "food",
        ),
        (
            &[
                "art",
                "illustration",
                "style",
                "painting",
                "anime",
                "watercolor",
                "oil paint",
                "pixel",
                "concept art",
                "艺术",
                "插画",
                "风格",
                "绘画",
                // Photography-related buckets that we treat as broad "art"
                // when they don't match anything more specific. Many ZeroLu
                // sections are like "Photography & Photorealism" — they
                // describe a photographic style overall.
                "photography",
                "photorealism",
                "photo realistic",
                "cinematic",
                "film look",
                "lighting study",
                "摄影",
                "电影感",
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

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Source attribution should still be captured when the link follows
    /// the prompt block, which is the most common ZeroLu README shape.
    #[test]
    fn parser_picks_up_source_after_prompt_block() {
        let md = r#"
## Photography & Photorealism

### Studio Lighting

```
Studio lighting, soft key light from 45 degrees, fill light,
professional portrait, shallow depth of field, bokeh background,
high-end photography
```

Source: https://x.com/example/status/1234567890
"#;
        let outcome = parse_zerolu_markdown(md);
        assert_eq!(outcome.prompts.len(), 1, "should detect one prompt");
        let p = &outcome.prompts[0];
        assert_eq!(
            p.source_original_url.as_deref(),
            Some("https://x.com/example/status/1234567890")
        );
        // The sub-section "Studio Lighting" alone doesn't match any bucket,
        // so the parent section "Photography & Photorealism" should drive
        // the category mapping.
        assert_eq!(p.photonix_category, "art");
    }

    /// Trailing `**Source:**` markdown bold variant should also work.
    #[test]
    fn parser_picks_up_bold_source_label() {
        let md = r#"
## Portrait

```
A natural studio portrait of an anonymous adult subject lit by soft
window light. Realistic skin texture with visible pores, natural skin
tone, subtle warm highlights, gentle background fall-off.
```

**Source:** https://twitter.com/another/status/9999
"#;
        let outcome = parse_zerolu_markdown(md);
        assert_eq!(outcome.prompts.len(), 1);
        let p = &outcome.prompts[0];
        assert_eq!(
            p.source_original_url.as_deref(),
            Some("https://twitter.com/another/status/9999")
        );
        assert_eq!(p.photonix_category, "portrait");
    }

    /// HTML <img src="..."> tags should be captured as preview images.
    #[test]
    fn parser_picks_up_html_img_preview() {
        let md = r#"
## Product

### Studio Product

<img src="https://cdn.example.com/preview.jpg" alt="preview" />

```
Pure white background, studio product photography, soft even lighting,
sharp focus, clean commercial style, e-commerce ready
```
"#;
        let outcome = parse_zerolu_markdown(md);
        assert_eq!(outcome.prompts.len(), 1);
        let p = &outcome.prompts[0];
        assert_eq!(
            p.preview_image_url.as_deref(),
            Some("https://cdn.example.com/preview.jpg")
        );
        assert_eq!(p.photonix_category, "product");
    }

    /// Markdown `![alt](url)` images should still work and be back-fillable
    /// when they appear AFTER the prompt block.
    #[test]
    fn parser_picks_up_markdown_image_after_prompt() {
        let md = r#"
## Landscape

```
Golden hour lighting, warm tones, dramatic sky, sun rays through clouds,
cinematic atmosphere, professional landscape photography
```

![preview](https://cdn.example.com/golden.jpg)
"#;
        let outcome = parse_zerolu_markdown(md);
        assert_eq!(outcome.prompts.len(), 1);
        let p = &outcome.prompts[0];
        assert_eq!(
            p.preview_image_url.as_deref(),
            Some("https://cdn.example.com/golden.jpg")
        );
        assert_eq!(p.photonix_category, "landscape");
    }

    /// Section-level keywords like "Photography & Photorealism" should drive
    /// category mapping when sub-section is too generic.
    #[test]
    fn category_falls_back_to_parent_section() {
        // No subsection at all
        assert_eq!(
            map_to_photonix_category_v2(None, Some("Photography & Photorealism")),
            "art"
        );
        // Sub-section "Studio Lighting" is generic; parent should win.
        assert_eq!(
            map_to_photonix_category_v2(Some("Studio Lighting"), Some("Portrait")),
            "portrait"
        );
        // Sub-section beats parent when both match.
        assert_eq!(
            map_to_photonix_category_v2(Some("Food"), Some("Portrait")),
            "food"
        );
        // Neither matches → other.
        assert_eq!(
            map_to_photonix_category_v2(Some("Misc"), Some("General Tips")),
            "other"
        );
    }

    /// Bare URL lines (no `Source:` label) should also be captured.
    #[test]
    fn parser_picks_up_bare_url_after_prompt() {
        let md = r#"
## Art

```
Loose watercolor illustration of a sunny everyday street scene with
soft washes of color and gentle pencil outlines.
```

https://x.com/illustrator/status/42
"#;
        let outcome = parse_zerolu_markdown(md);
        assert_eq!(outcome.prompts.len(), 1);
        let p = &outcome.prompts[0];
        assert_eq!(
            p.source_original_url.as_deref(),
            Some("https://x.com/illustrator/status/42")
        );
    }

    /// Code-sample fenced blocks should be skipped, not imported as prompts.
    #[test]
    fn parser_skips_obvious_code_samples() {
        let md = r#"
## Setup

```
npm install --save photonix
```

```
import { something } from "library";
const x = 1;
```
"#;
        let outcome = parse_zerolu_markdown(md);
        assert_eq!(outcome.prompts.len(), 0);
        assert_eq!(outcome.skipped_count, 2);
    }

    /// Stable hash should be deterministic so re-syncing the same prompt
    /// upserts the same row id.
    #[test]
    fn stable_hash_is_deterministic() {
        let a = stable_hash("hello world");
        let b = stable_hash("hello world");
        assert_eq!(a, b);
        assert_ne!(a, stable_hash("hello, world"));
        // Hash returns 16 hex chars (8 bytes).
        assert_eq!(a.len(), 16);
    }

    #[test]
    fn extract_image_handles_html_with_attributes() {
        assert_eq!(
            extract_image_url(r#"<img alt="x" src="https://a.b/c.png" width="200">"#),
            Some("https://a.b/c.png".to_string())
        );
        assert_eq!(
            extract_image_url(r#"<IMG SRC='https://a.b/d.jpg'>"#),
            Some("https://a.b/d.jpg".to_string())
        );
    }
}
