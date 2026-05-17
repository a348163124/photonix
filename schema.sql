PRAGMA foreign_keys = ON;

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

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS image_tags (
  image_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (image_id, tag_id),
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
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
CREATE INDEX IF NOT EXISTS idx_versions_parent_version_id ON image_versions(parent_version_id);
CREATE INDEX IF NOT EXISTS idx_versions_is_current ON image_versions(image_id, is_current);

CREATE INDEX IF NOT EXISTS idx_prompts_image_id ON prompts(image_id);
CREATE INDEX IF NOT EXISTS idx_prompts_created_at ON prompts(created_at);

CREATE INDEX IF NOT EXISTS idx_jobs_image_id ON edit_jobs(image_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON edit_jobs(job_status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON edit_jobs(created_at);

