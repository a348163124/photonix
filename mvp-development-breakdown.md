# GPT-Image-2 Photo Editor

MVP Development Breakdown

Version: v0.1
Date: 2026-05-15

## 1. Purpose

This document breaks the MVP into implementation-ready workstreams, milestones, and engineering tasks. It is written so the project can move directly into execution.

## 2. MVP Goal

Ship a Windows-first desktop application that can:

- import local image folders
- browse large PNG photography assets efficiently
- open a single image in an editor
- paint a local mask
- submit prompt-based edits through BYOK configuration
- receive draft or final AI edit results
- store version history
- export edited results

## 3. Delivery Strategy

Recommended delivery order:

1. foundation and shell
2. local asset pipeline
3. editor UI
4. provider configuration and prompt compiler
5. image edit workflow
6. versioning and export
7. polish and stabilization

## 4. Suggested Team Lanes

Even if one person is building this, the work can be mentally split into these lanes:

- desktop shell and native bridge
- frontend UI and state
- image core and storage
- provider adapter and prompt compiler
- QA and hardening

## 5. Milestone 1: Foundation

### 5.1 Objective

Create the project scaffold and the minimum app shell.

### 5.2 Tasks

- initialize `Tauri 2 + React + TypeScript`
- add `Tailwind CSS`
- add `shadcn/ui`
- set up `Radix UI` primitives used by dialogs, tabs, and popovers
- define app layout shell
- set up linting and formatting
- define environment strategy for development
- define TypeScript path aliases
- create base folder structure

### 5.3 Deliverables

- app launches on Windows
- left nav, top bar, and placeholder content render
- design tokens and base theme exist

## 6. Milestone 2: Settings and Provider Configuration

### 6.1 Objective

Allow the user to configure the BYOK connection and local defaults.

### 6.2 Tasks

- build Settings screen shell
- add fields for `baseURL`, `API key`, image model, text model, fallback text model
- integrate secure secret storage
- store non-secret settings in SQLite or local settings store
- add provider validation action
- add compatibility status UI
- define provider adapter interfaces in TypeScript

### 6.3 Deliverables

- user can save settings
- API key is stored securely
- provider configuration can be validated

## 7. Milestone 3: Local Storage and Database

### 7.1 Objective

Stand up the local persistence layer.

### 7.2 Tasks

- add SQLite integration in Tauri/Rust
- create DB initialization logic
- apply `schema.sql`
- create repository layer for folders, images, versions, jobs, prompts, settings
- define application data root and cache paths
- implement startup directory initialization
- implement migration runner structure

### 7.3 Deliverables

- app initializes local database
- app initializes cache directory structure
- repository functions are available to the frontend bridge

## 8. Milestone 4: Folder Import and Asset Indexing

### 8.1 Objective

Allow users to import folders and build an image library.

### 8.2 Tasks

- add folder picker
- implement recursive and non-recursive scan options
- identify supported image extensions
- extract basic metadata from files
- persist folder and image rows
- detect updates and missing files on rescan
- add initial import status tracking

### 8.3 Deliverables

- user can import a folder
- imported images appear in the database
- re-scan updates metadata correctly

## 9. Milestone 5: Thumbnail and Proxy Pipeline

### 9.1 Objective

Generate fast local representations for browsing and editing.

### 9.2 Tasks

- integrate `libvips` into Rust image core
- generate thumbnail images
- generate preview proxies
- store generated artifact paths
- build lazy generation strategy
- add regeneration logic for missing cache entries
- surface generation progress to UI

### 9.3 Deliverables

- library thumbnails render
- editor can open preview proxies quickly

## 10. Milestone 6: Library Screen

### 10.1 Objective

Build the main browsing experience.

### 10.2 Tasks

- implement Library route
- build toolbar with import, refresh, sort, filter, search
- render virtualized thumbnail grid
- implement selection state
- build preview metadata rail
- add open-in-editor action
- show edited/unedited state badges

### 10.3 Deliverables

- user can browse imported images
- user can select and open an image in the editor

## 11. Milestone 7: Editor Shell and Canvas

### 11.1 Objective

Build the core single-image editing screen.

### 11.2 Tasks

- implement Editor route
- build three-column layout
- render selected image on canvas
- add zoom and pan
- add image fit modes
- add image info display
- add before/after toggle shell
- add split compare shell

### 11.3 Deliverables

- user can open image in editor
- canvas supports pan and zoom

## 12. Milestone 8: Mask Tools

### 12.1 Objective

Allow local-region selection for AI edits.

### 12.2 Tasks

- implement mask overlay layer
- add brush mode
- add erase mode
- add brush size and softness controls
- add show/hide mask
- add clear mask
- add invert mask
- persist working mask to temporary artifact path
- map preview coordinates to source coordinates

### 12.3 Deliverables

- user can paint and edit a mask
- app can save a same-size working mask representation

## 13. Milestone 9: Prompt Panel and Prompt Compiler

### 13.1 Objective

Transform user prompts into stable structured edit instructions.

### 13.2 Tasks

- build Prompt tab UI
- add prompt textarea
- add preserve toggles
- add prompt presets shell
- define `PromptCompileInput` and `CompiledPrompt` types
- implement text model client
- implement prompt compiler service with `gpt-5.4-mini`
- save raw and compiled prompts
- add fallback escalation path to `gpt-5.4`

### 13.3 Deliverables

- user can enter prompt and compile it
- compiled prompt output can be logged and persisted

## 14. Milestone 10: Image Edit Pipeline

### 14.1 Objective

Send AI edit requests and receive editable results.

### 14.2 Tasks

- define `ImageEditInput` and `ImageEditResult`
- implement image model client for `gpt-image-2`
- implement local mask edit flow
- implement global preview edit flow
- add draft and final quality modes
- add request serialization for debugging
- handle provider errors and timeouts
- support cancel UX where possible

### 14.3 Deliverables

- local mask edits can be submitted
- draft results return and display in app

## 15. Milestone 11: Crop Extraction and Stitching

### 15.1 Objective

Support source-crop editing for large images efficiently.

### 15.2 Tasks

- compute crop bounding box from preview mask
- add safety padding logic
- extract source crop with `libvips`
- generate same-size crop mask
- receive edited crop result
- blend crop result into current image version
- tune feathering and seam behavior

### 15.3 Deliverables

- app can complete crop-based local edit workflow on large images

## 16. Milestone 12: Version History

### 16.1 Objective

Track every accepted result and allow rollback/comparison.

### 16.2 Tasks

- create original version on first open or first edit
- create draft/final version records
- update `is_current`
- build History tab
- allow switching among versions
- show version metadata
- support before/after comparison between selected versions

### 16.3 Deliverables

- users can browse version history
- accepted results are durable

## 17. Milestone 13: Export

### 17.1 Objective

Allow edited output to be saved to user-selected destinations.

### 17.2 Tasks

- build Export tab
- add PNG and JPEG output options
- add output directory picker
- add filename suffix strategy
- write export artifact
- persist export status if needed

### 17.3 Deliverables

- user can export current version

## 18. Milestone 14: Error Handling and Recovery

### 18.1 Objective

Make failures recoverable and understandable.

### 18.2 Tasks

- define error types across provider, image core, storage, and UI
- add toast and inline error states
- preserve failed job metadata
- add retry action from failed job
- mark interrupted jobs on restart
- validate mask/image size mismatch cases

### 18.3 Deliverables

- failed edits can be retried
- errors are visible and actionable

## 19. Milestone 15: Performance and Polish

### 19.1 Objective

Prepare the MVP for real-world testing with large images.

### 19.2 Tasks

- optimize thumbnail and proxy loading
- optimize canvas redraw behavior
- test import on large folders
- test crop extraction and stitch latency
- tune settings defaults
- polish visual hierarchy
- polish status feedback

### 19.3 Deliverables

- app is stable enough for closed beta use

## 20. Cross-Cutting Technical Tasks

These tasks should be handled across milestones rather than left to the end.

### 20.1 Types and Contracts

- define shared types between frontend and native bridge
- keep provider interfaces stable

### 20.2 Logging

- structured local logs
- secret redaction
- job trace IDs

### 20.3 Testing

- unit tests for coordinate math and prompt formatting
- integration tests for repository and file lifecycle
- manual test cases for large-image editing

### 20.4 Accessibility

- keyboard navigation for major panels
- focus management in dialogs
- visible state for selected versions and active tool

## 21. Initial Backlog by Priority

### P0

- project scaffold
- settings and secure key storage
- SQLite initialization
- folder import
- thumbnail generation
- editor shell
- mask tools
- prompt compiler
- image edit client
- crop extraction and stitch
- version save
- export

### P1

- prompt presets
- provider compatibility tester
- improved compare modes
- retry UX
- cache cleanup controls

### P2

- tags
- batch queue
- reference image mode
- auto-mask hints

## 22. Suggested Sprint Breakdown

### Sprint 1

- foundation
- settings
- database
- import pipeline

### Sprint 2

- thumbnails and proxies
- library screen
- editor shell

### Sprint 3

- mask tools
- prompt panel
- prompt compiler

### Sprint 4

- image edit requests
- crop extraction
- stitch workflow

### Sprint 5

- version history
- export
- failure recovery
- polish

## 23. Definition of Done for MVP

The MVP is complete when:

- a user can configure `baseURL` and `API key`
- a user can import a folder of PNG images
- the library can display thumbnails for those images
- a user can open an image in the editor
- a user can paint a mask and enter a prompt
- the app can produce a draft AI edit from `gpt-image-2`
- the app can save the result as a version
- the app can export the selected version
- original images remain untouched

## 24. Suggested Next Build Step

The most efficient next implementation step is:

1. scaffold `Tauri + React`
2. land the app shell
3. add Settings and BYOK storage
4. stand up SQLite and folder import

