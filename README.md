# Photonix

> Shape light. Repair detail. Direct the image.

A Windows-first AI photo editor built around `gpt-image-2`, designed for photographers who want fast, prompt-driven edits on large landscape PNG/JPG photos with predictable, local-first workflows.

Photonix is a desktop application — your originals stay on disk, your API key stays on your machine, and edits go directly from the desktop to the provider you configure.

---

## Highlights

- **BYOK provider config** — supply your own `baseURL` and API key for any OpenAI-compatible image model
- **Mask-based local edits** — paint a region, write a prompt, get a result that respects what you asked to preserve
- **Prompt compiler** — your free-text prompt is rewritten into a structured edit instruction with explicit preservation and negative constraints
- **Image generation mode** — separate text-to-image tab with its own gallery, persisted across restarts
- **Upload proxy profiles** — `fast / recommended / high_quality` so a 36MB landscape PNG never gets uploaded raw
- **Social export presets** — `WeChat Moments / High Quality Mobile / Small File / Archive PNG`, plus a custom mode
- **Built-in landscape and portrait presets** — 8 landscape + 4 portrait one-click starting points, plus your own custom presets
- **Persistent prompt history** — recent prompts stay around across sessions
- **Small batch queue** — multi-select in Library, run one preset over several photos with retry/cancel per item
- **Version history** — every accepted edit becomes a version; switch between draft/final/stitched/original; original files are never modified
- **Local-first storage** — SQLite for metadata; disk for thumbnails, proxies, masks, generations, and edited versions; secrets in a separate file outside the database

---

## Tech Stack

| Layer | Stack |
|---|---|
| Desktop shell | Tauri 2 |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4 |
| State | Zustand |
| Backend | Rust |
| Database | SQLite (via `rusqlite`, bundled) |
| HTTP | `reqwest` (Rust) |
| Image processing | `image` crate |
| File scanning | `walkdir` |

Provider integration:

- POST `/images/edits` for prompt+mask edits
- POST `/images/generations` for text-to-image
- POST `/chat/completions` for prompt compilation
- All HTTP calls happen in Rust to avoid CORS and keep the API key out of the JS layer

---

## Repository Layout

```
photonix-app/                 Desktop application (Tauri + React + Rust)
  src/                          Frontend
    components/{layout,library,editor,settings,generate,ui}/
    services/{tauri,prompt,provider}/
    stores/                     Zustand stores
  src-tauri/                    Rust backend
    src/commands/{edit,prompt,generate,library,secrets}.rs
    src/image_core/             Scan + thumbnail/proxy generation
    src/storage/                SQLite + migrations + repository

gpt-image-editor-prd-design.md   Full product + technical design (MVP1 + MVP2 + §31 Generate)
information-architecture-wireframes.md
storage-and-database-design.md
mvp-development-breakdown.md
schema.sql                       Initial database schema reference
BRAND.md                         Naming + tone direction (legacy: "LumaForge")
```

---

## Getting Started

### Prerequisites

- Windows 10/11 (primary target)
- [Node.js](https://nodejs.org/) 20+ (developed against 25)
- [Rust](https://www.rust-lang.org/tools/install) stable + Visual Studio Build Tools (C++ workload + Windows SDK)
- An API key for an OpenAI-compatible provider that supports `gpt-image-2` style image edit/generation

### Run in development

```cmd
cd photonix-app
npm install
npm run tauri dev
```

The first build pulls all Rust crates and may take 3–5 minutes. Subsequent builds are incremental.

### Build a release installer

```cmd
cd photonix-app
npm run tauri build
```

Output is in `photonix-app/src-tauri/target/release/bundle/`.

### First-run configuration

1. Open the **Settings** screen (gear icon in the left sidebar)
2. Provider tab: enter your `baseURL`, API key, and confirm the image/text models
3. Click **Save Settings**, then **Validate Connection**
4. Editing tab: choose an upload proxy profile (default: `Recommended`)
5. Export tab: pick a default export preset (default: `WeChat Moments`)

API keys are stored in an obfuscated file outside the SQLite database. Production-grade Windows Credential Manager integration is part of the §32.6.9 hardening pass before public beta.

---

## Workflows

### Edit an existing photo

1. **Library** → Import a folder of photos (PNG/JPG/WebP/TIFF/BMP)
2. Wait for thumbnails (background two-pass downscale; cached on disk)
3. Double-click an image → **Editor**
4. **Mask** tab: paint the region you want edited (`B` brush / `E` erase / `[` `]` adjust size)
5. **Prompt** tab: type a prompt or pick a Landscape/Portrait preset; toggle preserve identity / preserve composition
6. **Generate Draft** (Ctrl/Cmd + Enter) — Photonix uploads a compressed proxy, not the original
7. The new version becomes active; **History** tab lets you switch between versions
8. **Export** tab: pick a preset, choose a save location

### Generate from scratch

1. Sidebar → **Generate** (sparkle icon)
2. Type a prompt, pick size and quality, click **Generate** (or Ctrl/Cmd + Enter)
3. Result lands in the gallery and the preview area
4. Export PNG via the toolbar above the preview

### Batch edit

1. **Library** → click **Select** to enter multi-select mode
2. Pick the images you want to edit
3. **Batch Edit (N)** → choose a preset or write a prompt
4. **Start** — items run sequentially with status (queued / running / succeeded / failed / canceled)
5. Failed items can be retried individually; queued items can be canceled in bulk

---

## Status

**MVP1 — shipped:** library, mask, prompt compile, edit pipeline, version history, export, settings, BYOK, Generate tab.

**MVP2 — shipped:** upload proxy profiles, social export presets, 8 + 4 built-in edit presets, persistent prompt history, custom presets, small batch queue, Rust-side compatibility check.

**Coming next (M6 hardening):**

- Windows Credential Manager / `keyring` for API key storage
- Improved error logging and structured diagnostics
- Batch concurrency tuning
- Real-image tuning of the default proxy and export presets

See the design document for the full scope and roadmap:

- [Full PRD + Technical Design](./gpt-image-editor-prd-design.md) — covers product goals, MVP1/MVP2 milestones, prompt compiler, large-image strategy, image generation (§31), and MVP2 social landscape edition (§32)
- [Information Architecture & Wireframes](./information-architecture-wireframes.md)
- [Storage & Database Design](./storage-and-database-design.md)

---

## Privacy

- Original files are never modified.
- Edited results, generations, thumbnails, and proxies live in your local app data directory.
- Prompts and metadata live in a local SQLite database.
- The API key lives in a separate obfuscated file outside the database.
- Image content is sent only to the `baseURL` you configure, only when you trigger an edit or generation.

---

## License

Currently unlicensed (private development). A formal license will be added before any public release.
