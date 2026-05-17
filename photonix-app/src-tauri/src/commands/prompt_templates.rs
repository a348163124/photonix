//! Prompt-template CRUD (MVP4 §34.6).
//!
//! Templates serve both Generate and Editor screens. The data is local-only
//! (no cloud sync). Built-in templates ship with `is_builtin = 1` and are
//! seeded on first run by `seed_builtin_prompt_templates`.

use crate::storage::database::Database;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplateRow {
    pub id: String,
    pub mode: String, // "generate" | "edit" | "both"
    pub category: String,
    pub title: String,
    pub description: Option<String>,
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub tags_json: Option<String>,
    pub language: String, // "en" | "zh-CN"
    pub source_name: Option<String>,
    pub source_url: Option<String>,
    pub is_builtin: bool,
    pub is_favorite: bool,
    pub created_at: String,
    pub updated_at: String,
    // ── MVP5 extensions ────────────────────────────────────────────────
    pub external_id: Option<String>,
    pub provider: Option<String>, // "zerolu", "user", null
    pub upstream_category: Option<String>,
    pub source_repository: Option<String>,
    pub source_original_url: Option<String>,
    pub preview_image_url: Option<String>,
    pub usage_count: i64,
    pub last_used_at: Option<String>,
    pub imported_at: Option<String>,
    pub synced_at: Option<String>,
    pub content_filter_status: String,
    pub content_filter_notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListPromptTemplatesArgs {
    pub mode: Option<String>,
    pub category: Option<String>,
    pub favorites_only: Option<bool>,
    pub query: Option<String>,
    /// MVP5: filter by provider ("zerolu", "user", or null for "any")
    pub provider: Option<String>,
    /// MVP5: only include rows where provider IS NULL (i.e. user/built-in templates)
    pub local_only: Option<bool>,
    /// MVP5: order by — "title" (default), "usage_count", "last_used_at", "imported_at"
    pub order_by: Option<String>,
    pub limit: Option<i64>,
}

const PROMPT_TEMPLATE_COLUMNS: &str = "id, mode, category, title, description, prompt, negative_prompt, tags_json,
    language, source_name, source_url, is_builtin, is_favorite, created_at, updated_at,
    external_id, provider, upstream_category, source_repository, source_original_url,
    preview_image_url, usage_count, last_used_at, imported_at, synced_at,
    content_filter_status, content_filter_notes";

fn map_prompt_template_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PromptTemplateRow> {
    Ok(PromptTemplateRow {
        id: row.get(0)?,
        mode: row.get(1)?,
        category: row.get(2)?,
        title: row.get(3)?,
        description: row.get(4)?,
        prompt: row.get(5)?,
        negative_prompt: row.get(6)?,
        tags_json: row.get(7)?,
        language: row.get(8)?,
        source_name: row.get(9)?,
        source_url: row.get(10)?,
        is_builtin: row.get::<_, i32>(11)? != 0,
        is_favorite: row.get::<_, i32>(12)? != 0,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
        external_id: row.get(15)?,
        provider: row.get(16)?,
        upstream_category: row.get(17)?,
        source_repository: row.get(18)?,
        source_original_url: row.get(19)?,
        preview_image_url: row.get(20)?,
        usage_count: row.get(21)?,
        last_used_at: row.get(22)?,
        imported_at: row.get(23)?,
        synced_at: row.get(24)?,
        content_filter_status: row.get(25)?,
        content_filter_notes: row.get(26)?,
    })
}

#[tauri::command]
pub fn list_prompt_templates(
    db: State<'_, Database>,
    args: Option<ListPromptTemplatesArgs>,
) -> Result<Vec<PromptTemplateRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = format!(
        "SELECT {cols} FROM prompt_templates WHERE 1=1",
        cols = PROMPT_TEMPLATE_COLUMNS
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut order_clause = " ORDER BY is_favorite DESC, is_builtin ASC, title COLLATE NOCASE ASC";

    if let Some(a) = &args {
        if let Some(mode) = &a.mode {
            // "both" should match templates flagged as "both" plus templates
            // whose mode equals the requested filter so the UI's "all" filter
            // works as the user expects.
            sql.push_str(&format!(" AND (mode = ?{i} OR mode = 'both')", i = params_vec.len() + 1));
            params_vec.push(Box::new(mode.clone()));
        }
        if let Some(category) = &a.category {
            let placeholder = format!(" AND category = ?{}", params_vec.len() + 1);
            sql.push_str(&placeholder);
            params_vec.push(Box::new(category.clone()));
        }
        if a.favorites_only.unwrap_or(false) {
            sql.push_str(" AND is_favorite = 1");
        }
        if let Some(provider) = &a.provider {
            sql.push_str(&format!(" AND provider = ?{i}", i = params_vec.len() + 1));
            params_vec.push(Box::new(provider.clone()));
        }
        if a.local_only.unwrap_or(false) {
            sql.push_str(" AND provider IS NULL");
        }
        if let Some(q) = &a.query {
            let trimmed = q.trim();
            if !trimmed.is_empty() {
                let like = format!("%{}%", trimmed.to_lowercase());
                let i = params_vec.len() + 1;
                sql.push_str(&format!(
                    " AND (LOWER(title) LIKE ?{i} OR LOWER(prompt) LIKE ?{i} \
                       OR LOWER(IFNULL(description,'')) LIKE ?{i} \
                       OR LOWER(IFNULL(tags_json,'')) LIKE ?{i})"
                ));
                params_vec.push(Box::new(like));
            }
        }

        if let Some(order) = &a.order_by {
            order_clause = match order.as_str() {
                "usage_count" => " ORDER BY usage_count DESC, is_favorite DESC, title COLLATE NOCASE ASC",
                "last_used_at" => " ORDER BY last_used_at DESC NULLS LAST, title COLLATE NOCASE ASC",
                "imported_at" => " ORDER BY imported_at DESC NULLS LAST, title COLLATE NOCASE ASC",
                _ => " ORDER BY is_favorite DESC, is_builtin ASC, title COLLATE NOCASE ASC",
            };
        }
    }

    sql.push_str(order_clause);
    if let Some(args_inner) = &args {
        if let Some(limit) = args_inner.limit {
            sql.push_str(&format!(" LIMIT {}", limit.max(0)));
        }
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    let rows = stmt
        .query_map(rusqlite::params_from_iter(param_refs.iter()), map_prompt_template_row)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn upsert_prompt_template(
    db: State<'_, Database>,
    template: PromptTemplateRow,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    upsert_prompt_template_inner(&conn, &template)
}

/// Internal helper used by both the public command and the sync importer.
/// When a row already exists with the same id, this preserves the user's
/// `is_favorite`, `usage_count`, and `last_used_at` so re-syncing the
/// upstream library doesn't reset their personal bookkeeping.
fn upsert_prompt_template_inner(
    conn: &rusqlite::Connection,
    template: &PromptTemplateRow,
) -> Result<(), String> {
    // Look for existing personal fields so we don't overwrite them.
    let existing: Option<(i32, i64, Option<String>)> = conn
        .query_row(
            "SELECT is_favorite, usage_count, last_used_at
             FROM prompt_templates WHERE id = ?1",
            params![template.id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .ok();

    let preserved_is_favorite = existing.as_ref().map(|e| e.0 != 0).unwrap_or(template.is_favorite);
    let preserved_usage_count = existing.as_ref().map(|e| e.1).unwrap_or(template.usage_count);
    let preserved_last_used_at = existing
        .as_ref()
        .and_then(|e| e.2.clone())
        .or_else(|| template.last_used_at.clone());

    conn.execute(
        "INSERT OR REPLACE INTO prompt_templates
         (id, mode, category, title, description, prompt, negative_prompt, tags_json,
          language, source_name, source_url, is_builtin, is_favorite, created_at, updated_at,
          external_id, provider, upstream_category, source_repository, source_original_url,
          preview_image_url, usage_count, last_used_at, imported_at, synced_at,
          content_filter_status, content_filter_notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
                 ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27)",
        params![
            template.id,
            template.mode,
            template.category,
            template.title,
            template.description,
            template.prompt,
            template.negative_prompt,
            template.tags_json,
            template.language,
            template.source_name,
            template.source_url,
            template.is_builtin as i32,
            preserved_is_favorite as i32,
            template.created_at,
            template.updated_at,
            template.external_id,
            template.provider,
            template.upstream_category,
            template.source_repository,
            template.source_original_url,
            template.preview_image_url,
            preserved_usage_count,
            preserved_last_used_at,
            template.imported_at,
            template.synced_at,
            template.content_filter_status,
            template.content_filter_notes,
        ],
    )
    .map_err(|e| format!("Failed to upsert prompt template: {}", e))?;
    Ok(())
}

/// Public façade exposed for the sync importer in `commands::prompt_library`.
/// Same body as `upsert_prompt_template_inner` — kept under a dedicated name
/// so cross-module callers don't depend on a private helper.
pub fn __internal_upsert(
    conn: &rusqlite::Connection,
    template: &PromptTemplateRow,
) -> Result<(), String> {
    upsert_prompt_template_inner(conn, template)
}

#[tauri::command]
pub fn delete_prompt_template(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    // Built-in templates can't be deleted via this command. They can be
    // hidden (we don't currently support "hidden") or unfavorited but not
    // removed; this avoids accidentally losing the ZeroLu-derived seed.
    conn.execute(
        "DELETE FROM prompt_templates WHERE id = ?1 AND is_builtin = 0",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_prompt_template_favorite(
    db: State<'_, Database>,
    id: String,
    is_favorite: bool,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE prompt_templates SET is_favorite = ?1, updated_at = ?2 WHERE id = ?3",
        params![is_favorite as i32, super::chrono_now(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Increment usage count and stamp last_used_at. Called when the user
/// applies a template via the Use button.
#[tauri::command]
pub fn record_prompt_template_use(
    db: State<'_, Database>,
    id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE prompt_templates
         SET usage_count = usage_count + 1, last_used_at = ?1, updated_at = ?1
         WHERE id = ?2",
        params![super::chrono_now(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Seed built-in templates if and only if they are missing. This is safe
/// to call on every boot — it skips ids that already exist in the table.
#[tauri::command]
pub fn seed_builtin_prompt_templates(db: State<'_, Database>) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = super::chrono_now();
    let mut inserted = 0;
    for row in builtin_seed(&now) {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM prompt_templates WHERE id = ?1",
                params![row.id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists > 0 {
            continue;
        }
        conn.execute(
            "INSERT INTO prompt_templates
             (id, mode, category, title, description, prompt, negative_prompt, tags_json,
              language, source_name, source_url, is_builtin, is_favorite, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                row.id,
                row.mode,
                row.category,
                row.title,
                row.description,
                row.prompt,
                row.negative_prompt,
                row.tags_json,
                row.language,
                row.source_name,
                row.source_url,
                row.is_builtin as i32,
                row.is_favorite as i32,
                row.created_at,
                row.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to seed prompt template: {}", e))?;
        inserted += 1;
    }
    Ok(inserted)
}

// ─── Built-in seed ───────────────────────────────────────────────────────────

/// Curated MVP4 built-in templates.
///
/// These are inspired by ZeroLu/awesome-gpt-image (PRD §34.4) but rewritten
/// in Photonix's own voice. They focus on photography, realistic generation,
/// commercial/social imagery, and image editing. We intentionally avoid any
/// prompt that would direct the model to copy living artists, brands, or
/// recognisable private individuals.
fn builtin_seed(now: &str) -> Vec<PromptTemplateRow> {
    fn t(
        id: &str,
        mode: &str,
        category: &str,
        title: &str,
        description: &str,
        prompt: &str,
        negative_prompt: &str,
        tags: &[&str],
        language: &str,
        source_name: Option<&str>,
        source_url: Option<&str>,
        now: &str,
    ) -> PromptTemplateRow {
        let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
        PromptTemplateRow {
            id: id.to_string(),
            mode: mode.to_string(),
            category: category.to_string(),
            title: title.to_string(),
            description: Some(description.to_string()),
            prompt: prompt.to_string(),
            negative_prompt: if negative_prompt.is_empty() {
                None
            } else {
                Some(negative_prompt.to_string())
            },
            tags_json: Some(tags_json),
            language: language.to_string(),
            source_name: source_name.map(String::from),
            source_url: source_url.map(String::from),
            is_builtin: true,
            is_favorite: false,
            created_at: now.to_string(),
            updated_at: now.to_string(),
            external_id: None,
            provider: None,
            upstream_category: None,
            source_repository: None,
            source_original_url: None,
            preview_image_url: None,
            usage_count: 0,
            last_used_at: None,
            imported_at: None,
            synced_at: None,
            content_filter_status: "unreviewed".to_string(),
            content_filter_notes: None,
        }
    }

    let zerolu = Some("ZeroLu/awesome-gpt-image (inspired)");
    let zerolu_url = Some("https://github.com/ZeroLu/awesome-gpt-image");

    vec![
        t(
            "tpl-builtin-landscape-golden-hour",
            "generate",
            "landscape",
            "Golden Hour Lake",
            "Calm lake at golden hour with realistic light.",
            "A wide cinematic photo of a calm mountain lake at golden hour. Warm golden highlights, cool blue shadows, soft atmospheric haze, realistic foliage greens, preserved cloud detail. Photographed on a full-frame camera, natural depth of field, no HDR halos.",
            "no neon saturation, no fake clouds, no plastic look",
            &["landscape", "golden hour", "lake", "photography"],
            "en",
            zerolu,
            zerolu_url,
            now,
        ),
        t(
            "tpl-builtin-landscape-blue-hour-city",
            "generate",
            "cinematic",
            "Blue Hour Cityscape",
            "Wide city skyline during blue hour.",
            "A wide cityscape photographed during blue hour, deep cool blue sky, warm city lights, balanced exposure with preserved highlight detail in windows, realistic reflections on wet pavement. Cinematic but believable.",
            "no over-saturated neon, no plastic look",
            &["cinematic", "blue hour", "city", "photography"],
            "en",
            zerolu,
            zerolu_url,
            now,
        ),
        t(
            "tpl-builtin-portrait-natural",
            "generate",
            "portrait",
            "Natural Window Light Portrait",
            "Soft window light portrait, identity-safe defaults.",
            "A natural studio portrait of an anonymous adult subject lit by soft window light. Realistic skin texture with visible pores, natural skin tone, subtle warm highlights, gentle background fall-off. Photography lens look, no plastic smoothing.",
            "no waxy skin, no face slimming, no expression change",
            &["portrait", "natural light", "studio"],
            "en",
            zerolu,
            zerolu_url,
            now,
        ),
        t(
            "tpl-builtin-product-clean-white",
            "generate",
            "product",
            "Clean White Product Shot",
            "E-commerce product hero on white.",
            "A clean studio product photograph on a seamless white background. Crisp, evenly lit subject with minimal soft shadow on the right, accurate color, sharp surface detail, neutral white balance. Suitable for an e-commerce hero image.",
            "no harsh shadows, no color cast",
            &["product", "ecommerce", "studio", "white background"],
            "en",
            zerolu,
            zerolu_url,
            now,
        ),
        t(
            "tpl-builtin-cinematic-rainy-night",
            "generate",
            "cinematic",
            "Rainy Night Street",
            "Cinematic rainy night street scene.",
            "A cinematic still of a quiet rainy street at night, wet asphalt with reflective puddles, warm street lamps, cool ambient blue, light atmospheric mist, anonymous silhouettes in the distance. Slight teal-and-amber grade kept restrained and natural.",
            "no over-saturated teal, no plastic look",
            &["cinematic", "night", "rain", "street"],
            "en",
            zerolu,
            zerolu_url,
            now,
        ),
        t(
            "tpl-builtin-social-square",
            "generate",
            "social",
            "Square Social Visual",
            "Eye-catching square 1:1 social visual.",
            "A clean 1:1 square social-media visual with bold composition, central subject, calm pastel backdrop, generous negative space at the top and bottom suitable for caption text overlays, soft natural light.",
            "no busy clutter, no clashing colors",
            &["social", "square", "1:1", "feed"],
            "en",
            zerolu,
            zerolu_url,
            now,
        ),
        t(
            "tpl-builtin-illustration-watercolor",
            "generate",
            "illustration",
            "Loose Watercolor Illustration",
            "Soft watercolor illustration of an everyday scene.",
            "A loose watercolor illustration of a sunny everyday street scene. Soft washes of color, visible paper texture, gentle pencil outlines, warm sunlight, calm and friendly mood. Anonymous figures, no portraits of real people.",
            "no photorealistic detail, no harsh outlines",
            &["illustration", "watercolor", "soft"],
            "en",
            zerolu,
            zerolu_url,
            now,
        ),
        t(
            "tpl-builtin-interior-scandi",
            "generate",
            "interior",
            "Scandinavian Living Room",
            "Bright minimal Scandinavian living room.",
            "A bright minimal Scandinavian living room photographed during the day. Warm wooden floor, soft cream sofa, indoor plants, large window with diffused daylight, calm neutral palette. Architectural photography style, realistic, generous depth.",
            "no clutter, no over-saturation",
            &["interior", "scandinavian", "minimal"],
            "en",
            zerolu,
            zerolu_url,
            now,
        ),
        t(
            "tpl-builtin-macro-water",
            "generate",
            "macro",
            "Macro Water Droplets",
            "High-detail macro of water droplets on a leaf.",
            "An ultra close-up macro photograph of water droplets resting on a leaf at sunrise. Each droplet refracts the soft warm light. Shallow depth of field, sharp on the central drops, gentle background bokeh. Realistic, no fake highlights.",
            "no plastic surface, no fake bokeh",
            &["macro", "water", "nature"],
            "en",
            zerolu,
            zerolu_url,
            now,
        ),
        t(
            "tpl-builtin-edit-remove-clutter",
            "edit",
            "editing",
            "Remove Background Clutter",
            "Remove distracting background objects, preserve subject.",
            "Remove distracting objects and clutter from the background of this photo while preserving the main subject completely. Keep the subject's pose, clothing, skin tone, and lighting unchanged. The new background should look natural, continuous, and consistent with the original lighting.",
            "no subject change, no recoloring, no expression change",
            &["edit", "cleanup", "background"],
            "en",
            None,
            None,
            now,
        ),
        t(
            "tpl-builtin-edit-soft-portrait",
            "edit",
            "editing",
            "Soft Portrait Retouch",
            "Identity-safe portrait retouch.",
            "Apply a soft natural portrait retouch. Reduce minor blemishes only, preserve skin texture, pores, age, expression, and identity. Slightly improve overall lighting balance with a subtle warm highlight and gently lifted shadows. Avoid waxy smoothing and any face reshaping.",
            "no slimming, no expression change, no waxy skin",
            &["edit", "portrait", "identity-safe"],
            "en",
            None,
            None,
            now,
        ),
        t(
            "tpl-builtin-edit-landscape-clarity",
            "edit",
            "landscape",
            "Landscape Natural Clarity",
            "Subtle clarity for landscape photos.",
            "Enhance natural clarity and atmosphere in this landscape photo. Improve micro-contrast in foliage, rocks, and clouds without any HDR halos. Keep sky color and tonal balance realistic. Preserve the original composition.",
            "no HDR halos, no neon saturation, no plastic textures",
            &["edit", "landscape", "clarity"],
            "en",
            None,
            None,
            now,
        ),
        t(
            "tpl-builtin-style-cool-travel",
            "both",
            "styleTransfer",
            "Cool Travel Mood",
            "Calm cool travel-photography mood.",
            "Apply a cool travel photography mood: subtle blue-cool shadow tone, soft balanced highlights, low-to-natural saturation, calm overall feel, clean sky gradients, preserved skin tones if any people are visible.",
            "no green or magenta cast, no over-saturated reds, no HDR",
            &["style", "travel", "cool", "calm"],
            "en",
            None,
            None,
            now,
        ),
        t(
            "tpl-builtin-style-warm-sunset",
            "both",
            "styleTransfer",
            "Warm Sunset Mood",
            "Warm golden-hour atmosphere without orange wash.",
            "Apply a warm sunset mood: golden highlights, preserved cloud detail, natural cool shadows, gentle global warmth, preserved color separation between sky and land.",
            "no orange overall wash, no blown highlights, no HDR halos",
            &["style", "warm", "sunset"],
            "en",
            None,
            None,
            now,
        ),
    ]
}
