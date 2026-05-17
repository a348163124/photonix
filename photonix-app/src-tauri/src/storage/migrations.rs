use rusqlite::Connection;

/// Run all database migrations in order.
pub fn run(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )
    .map_err(|e| format!("Failed to create migrations table: {}", e))?;

    let current_version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let migrations: Vec<(i64, &str)> = vec![
        (1, MIGRATION_001_INITIAL_SCHEMA),
        (2, MIGRATION_002_GENERATED_IMAGES),
        (3, MIGRATION_003_PROMPT_HISTORY_AND_PRESETS),
        (4, MIGRATION_004_STYLE_AND_CANDIDATES),
        (5, MIGRATION_005_PROMPT_TEMPLATES),
        (6, MIGRATION_006_PROMPT_LIBRARY),
    ];

    for (version, sql) in migrations {
        if version > current_version {
            conn.execute_batch(sql)
                .map_err(|e| format!("Migration {} failed: {}", version, e))?;
            conn.execute(
                "INSERT INTO schema_migrations (version) VALUES (?1)",
                [version],
            )
            .map_err(|e| format!("Failed to record migration {}: {}", version, e))?;
        }
    }

    Ok(())
}

const MIGRATION_001_INITIAL_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    recursive INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_scanned_at TEXT
);

CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    folder_id TEXT,
    source_path TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    extension TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    checksum TEXT,
    import_status TEXT NOT NULL DEFAULT 'indexed',
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    last_seen_at TEXT,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS image_versions (
    id TEXT PRIMARY KEY,
    image_id TEXT NOT NULL,
    parent_version_id TEXT,
    version_kind TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    file_size_bytes INTEGER,
    is_current INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_version_id) REFERENCES image_versions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    image_id TEXT NOT NULL,
    raw_prompt TEXT NOT NULL,
    compiled_prompt_json TEXT,
    text_model TEXT NOT NULL,
    compile_mode TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS edit_jobs (
    id TEXT PRIMARY KEY,
    image_id TEXT NOT NULL,
    base_version_id TEXT NOT NULL,
    result_version_id TEXT,
    prompt_id TEXT NOT NULL,
    job_type TEXT NOT NULL,
    job_status TEXT NOT NULL,
    quality_mode TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    crop_rect_json TEXT,
    mask_path TEXT,
    provider_name TEXT,
    provider_base_url TEXT NOT NULL,
    image_model TEXT NOT NULL,
    text_model TEXT NOT NULL,
    request_payload_json TEXT,
    error_message TEXT,
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY (base_version_id) REFERENCES image_versions(id) ON DELETE CASCADE,
    FOREIGN KEY (result_version_id) REFERENCES image_versions(id) ON DELETE SET NULL,
    FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_folder_id ON images(folder_id);
CREATE INDEX IF NOT EXISTS idx_images_source_path ON images(source_path);
CREATE INDEX IF NOT EXISTS idx_images_import_status ON images(import_status);
CREATE INDEX IF NOT EXISTS idx_versions_image_id ON image_versions(image_id);
CREATE INDEX IF NOT EXISTS idx_versions_is_current ON image_versions(image_id, is_current);
CREATE INDEX IF NOT EXISTS idx_prompts_image_id ON prompts(image_id);
CREATE INDEX IF NOT EXISTS idx_jobs_image_id ON edit_jobs(image_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON edit_jobs(job_status);
"#;

const MIGRATION_002_GENERATED_IMAGES: &str = r#"
CREATE TABLE IF NOT EXISTS generated_images (
    id TEXT PRIMARY KEY,
    storage_path TEXT NOT NULL,
    prompt TEXT NOT NULL,
    size TEXT NOT NULL,
    quality TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    file_size_bytes INTEGER,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generated_images_created_at ON generated_images(created_at);
"#;

const MIGRATION_003_PROMPT_HISTORY_AND_PRESETS: &str = r#"
CREATE TABLE IF NOT EXISTS prompt_history (
    id TEXT PRIMARY KEY,
    raw_prompt TEXT NOT NULL,
    preset_id TEXT,
    quality_mode TEXT NOT NULL,
    image_id TEXT,
    version_id TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompt_history_created_at ON prompt_history(created_at);

CREATE TABLE IF NOT EXISTS custom_edit_presets (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    prompt_template TEXT NOT NULL,
    preserve_identity INTEGER NOT NULL DEFAULT 0,
    preserve_composition INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT
);
"#;

const MIGRATION_004_STYLE_AND_CANDIDATES: &str = r#"
CREATE TABLE IF NOT EXISTS style_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    source TEXT NOT NULL,
    reference_image_path TEXT,
    description TEXT,
    style_summary TEXT NOT NULL,
    positive_prompt TEXT NOT NULL,
    negative_prompt TEXT,
    color_mood_json TEXT,
    preserve_identity INTEGER NOT NULL DEFAULT 0,
    preserve_composition INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_style_profiles_category ON style_profiles(category);
CREATE INDEX IF NOT EXISTS idx_style_profiles_is_default ON style_profiles(is_default);

CREATE TABLE IF NOT EXISTS edit_candidates (
    id TEXT PRIMARY KEY,
    image_id TEXT NOT NULL,
    version_id TEXT,
    candidate_group_id TEXT NOT NULL,
    label TEXT NOT NULL,
    prompt_modifier TEXT,
    style_profile_id TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY (version_id) REFERENCES image_versions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_edit_candidates_image_id ON edit_candidates(image_id);
CREATE INDEX IF NOT EXISTS idx_edit_candidates_group ON edit_candidates(candidate_group_id);

CREATE TABLE IF NOT EXISTS export_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    template_type TEXT NOT NULL,
    config_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"#;

const MIGRATION_005_PROMPT_TEMPLATES: &str = r#"
CREATE TABLE IF NOT EXISTS prompt_templates (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    prompt TEXT NOT NULL,
    negative_prompt TEXT,
    tags_json TEXT,
    language TEXT NOT NULL DEFAULT 'en',
    source_name TEXT,
    source_url TEXT,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_mode ON prompt_templates(mode);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_favorite ON prompt_templates(is_favorite);
"#;

const MIGRATION_006_PROMPT_LIBRARY: &str = r#"
ALTER TABLE prompt_templates ADD COLUMN external_id TEXT;
ALTER TABLE prompt_templates ADD COLUMN provider TEXT;
ALTER TABLE prompt_templates ADD COLUMN upstream_category TEXT;
ALTER TABLE prompt_templates ADD COLUMN source_repository TEXT;
ALTER TABLE prompt_templates ADD COLUMN source_original_url TEXT;
ALTER TABLE prompt_templates ADD COLUMN preview_image_url TEXT;
ALTER TABLE prompt_templates ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE prompt_templates ADD COLUMN last_used_at TEXT;
ALTER TABLE prompt_templates ADD COLUMN imported_at TEXT;
ALTER TABLE prompt_templates ADD COLUMN synced_at TEXT;
ALTER TABLE prompt_templates ADD COLUMN content_filter_status TEXT NOT NULL DEFAULT 'unreviewed';
ALTER TABLE prompt_templates ADD COLUMN content_filter_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_prompt_templates_provider ON prompt_templates(provider);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_external_id ON prompt_templates(provider, external_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_usage_count ON prompt_templates(usage_count);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_last_used ON prompt_templates(last_used_at);

CREATE TABLE IF NOT EXISTS prompt_library_syncs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    source_url TEXT NOT NULL,
    status TEXT NOT NULL,
    imported_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    warning_json TEXT,
    error_message TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_prompt_library_syncs_provider ON prompt_library_syncs(provider);
"#;
