# GPT-Image-2 Photo Editor

Storage and Database Design

Version: v0.1
Date: 2026-05-15

## 1. Purpose

This document defines the local storage architecture, SQLite schema design, cache strategy, naming conventions, and data lifecycle rules for the desktop application.

The storage design must support:

- local-first workflows
- large image proxies and crops
- edit version history
- retryable jobs
- secure secret handling
- future cross-platform support

## 2. Storage Principles

- original images remain at their source paths and are never silently overwritten
- the app stores metadata and derivative artifacts locally
- cache artifacts can be regenerated when safe
- version artifacts must be durable until explicitly deleted
- secrets are stored outside SQLite in secure storage

## 3. Storage Components

### 3.1 SQLite Database

Use SQLite for:

- imported image metadata
- versions
- jobs
- prompt history
- settings references

### 3.2 Filesystem Cache

Use the local app data folder for:

- thumbnails
- proxies
- masks
- temporary crops
- job outputs
- exports

### 3.3 Secure Storage

Use secure storage for:

- API key
- future provider tokens

## 4. Recommended Local Directory Structure

```text
app-data/
  db/
    app.sqlite
    migrations/
  cache/
    thumbs/
      <image-id>.webp
    proxies/
      <image-id>-preview.jpg
    masks/
      <job-id>.png
    temp/
      crops/
      stitched/
    jobs/
      <job-id>/
        request.json
        result.png
        debug.json
  versions/
    <image-id>/
      <version-id>.png
  exports/
    YYYY-MM-DD/
      ...
  logs/
    app.log
```

## 5. Path Strategy

### 5.1 Cross-Platform Requirements

- never hardcode Windows path separators in business logic
- use platform-safe path utilities from Rust and frontend adapters
- store normalized absolute source paths when possible

### 5.2 Naming Rules

- database IDs use UUIDs
- filenames for generated artifacts use stable IDs rather than user filenames
- human-readable names are stored in metadata, not relied upon for path safety

## 6. Data Domains

### 6.1 Imported Image

Represents a source asset referenced by path.

### 6.2 Image Version

Represents any saved working state derived from the source:

- original snapshot
- draft edit
- final edit
- stitched crop edit result

### 6.3 Edit Job

Represents an AI request lifecycle:

- queued
- running
- succeeded
- failed
- canceled

### 6.4 Prompt Entry

Represents either a raw user prompt or its compiled form used during a job.

### 6.5 App Setting

Represents local configuration excluding secrets.

## 7. SQLite Tables

### 7.1 folders

Purpose:

- track imported folders
- support refresh and re-indexing

Fields:

- `id`
- `path`
- `recursive`
- `created_at`
- `last_scanned_at`

### 7.2 images

Purpose:

- track source image metadata

Fields:

- `id`
- `folder_id`
- `source_path`
- `filename`
- `extension`
- `file_size_bytes`
- `width`
- `height`
- `checksum`
- `import_status`
- `created_at`
- `modified_at`
- `last_seen_at`

### 7.3 image_versions

Purpose:

- track all derived image states

Fields:

- `id`
- `image_id`
- `parent_version_id`
- `version_kind`
- `storage_path`
- `width`
- `height`
- `file_size_bytes`
- `is_current`
- `created_at`

### 7.4 prompts

Purpose:

- store user prompts and compiled prompts for reuse and auditability

Fields:

- `id`
- `image_id`
- `raw_prompt`
- `compiled_prompt_json`
- `text_model`
- `compile_mode`
- `created_at`

### 7.5 edit_jobs

Purpose:

- track each AI edit request and result lifecycle

Fields:

- `id`
- `image_id`
- `base_version_id`
- `result_version_id`
- `prompt_id`
- `job_type`
- `job_status`
- `quality_mode`
- `source_kind`
- `crop_rect_json`
- `mask_path`
- `provider_name`
- `provider_base_url`
- `image_model`
- `text_model`
- `request_payload_json`
- `error_message`
- `started_at`
- `finished_at`
- `created_at`

### 7.6 tags

Purpose:

- optional future tagging support

### 7.7 image_tags

Purpose:

- optional image-tag join table

### 7.8 app_settings

Purpose:

- store non-secret settings

Fields:

- `key`
- `value_json`
- `updated_at`

## 8. Recommended Enums

### 8.1 import_status

- `indexed`
- `missing`
- `error`

### 8.2 version_kind

- `original`
- `draft`
- `final`
- `stitched`
- `export_snapshot`

### 8.3 job_type

- `global_edit`
- `local_mask_edit`
- `proxy_render`
- `thumbnail_render`

### 8.4 job_status

- `queued`
- `running`
- `succeeded`
- `failed`
- `canceled`

### 8.5 source_kind

- `preview_proxy`
- `source_crop`

## 9. Artifact Lifecycle

### 9.1 Durable Artifacts

Must be preserved until user cleanup:

- saved image versions
- export files
- prompt history
- SQLite records

### 9.2 Regenerable Artifacts

Can be safely regenerated:

- thumbnails
- preview proxies
- temporary crops
- temporary stitched intermediates

### 9.3 Cleanup Rules

- user can clear thumbnails and proxies from Settings
- temporary job data older than retention window can be purged automatically
- versions must not be deleted without explicit user action

## 10. Versioning Model

### 10.1 Version Graph

Each image has:

- one original version
- zero or more child versions

The parent-child relationship enables:

- retry from a prior version
- compare historical outputs
- later branch visualization

### 10.2 Current Version

The active working version should be represented by `is_current = 1` on a single version per image.

When a new accepted version is created:

- old current version becomes `is_current = 0`
- new version becomes `is_current = 1`

## 11. Job Persistence Strategy

For each job:

- create DB row before request
- write request metadata to `cache/jobs/<job-id>/request.json`
- update status as processing progresses
- if successful, create version artifact and `result_version_id`
- if failed, preserve prompt and crop metadata for retry

## 12. Prompt Persistence Strategy

Prompt data should support:

- reuse
- auditing
- debugging failed edits

Store:

- original user prompt
- compiled JSON prompt
- text model name
- compile mode

## 13. Secrets Strategy

### 13.1 What Not to Store in SQLite

- API keys
- access tokens
- raw secure credentials

### 13.2 What to Store in SQLite

- provider display name
- selected model names
- base URL
- compatibility check result

## 14. Recommended Initialization Flow

1. resolve app data root
2. create directory structure if missing
3. create SQLite database if missing
4. run migrations
5. load settings
6. open secure storage bindings

## 15. Migration Strategy

- keep schema under versioned SQL migrations
- use monotonic migration numbering
- never mutate old migration files once released

Suggested naming:

- `001_initial_schema.sql`
- `002_add_provider_profiles.sql`

## 16. Performance Considerations

- index `images.source_path`
- index `images.folder_id`
- index `image_versions.image_id`
- index `edit_jobs.image_id`
- index `edit_jobs.job_status`
- avoid storing large binary data in SQLite

## 17. Recommended Defaults

- thumbnail format: `webp`
- preview proxy format: `jpeg`
- mask format: `png`
- saved version format: `png`
- default export format: `png`

## 18. Failure Recovery

On app restart:

- mark stale running jobs as failed or interrupted
- retain job metadata for inspection
- rebuild missing thumbnails lazily

## 19. Deliverables

This document is paired with:

- [schema.sql](C:/Users/Lai%20Xiang/Documents/Codex/2026-05-15/gpt-image-2-png-36m-windows/schema.sql)

