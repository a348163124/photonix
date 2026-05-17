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
