# GPT-Image-2 Photo Editor

Information Architecture and Page Wireframes

Version: v0.1
Date: 2026-05-15

## 1. Purpose

This document defines the information architecture, navigation model, major screens, and low-fidelity wireframes for the Windows-first desktop application.

The goal is to provide a clear UI blueprint that can be used by product, design, and engineering during MVP implementation.

## 2. Design Principles

- prioritize editing flow over general browsing
- reduce friction from import to first AI edit
- keep the canvas visually dominant
- keep prompt and mask controls always nearby
- expose version history without burying it
- make large-image workflows feel lightweight

## 3. Top-Level Information Architecture

### 3.1 Primary Areas

- App Shell
- Library
- Editor
- Settings

### 3.2 Object Model

The primary content objects in the system are:

- source image
- image version
- edit job
- prompt history entry
- settings profile

### 3.3 Navigation Model

The app uses persistent left navigation plus context-sensitive panels inside the editor.

Top-level destinations:

- Library
- Editor
- Settings

Contextual editor tabs:

- Prompt
- Mask
- History
- Export

## 4. App Shell

### 4.1 Global Layout

```text
+-----------------------------------------------------------------------------------+
| Top Bar: App Name | Current Folder / Image | Job Status | Search | Window Actions |
+---------+-----------------------------------------------------------------+-------+
|         |                                                                 |       |
| Left    |                         Main Content                            | Right |
| Nav     |                                                                 | Panel |
|         |                                                                 |       |
|         |                                                                 |       |
+---------+-----------------------------------------------------------------+-------+
| Bottom Status Bar: provider | image info | cache status | zoom | background jobs |
+-----------------------------------------------------------------------------------+
```

### 4.2 Left Navigation

Sections:

- Library
- Editor
- Settings

Optional future sections:

- Presets
- Batch Queue

### 4.3 Top Bar

Contents:

- app title or project label
- current workspace context
- active image name when in editor
- search field for library
- job indicator

### 4.4 Bottom Status Bar

Contents:

- selected provider profile
- text model and image model
- current image resolution
- current zoom level
- background task status

## 5. Screen Map

### 5.1 Library Screen

Purpose:

- image browsing
- import management
- quick preview
- entry point into editor

Sub-areas:

- folder toolbar
- filter and sort controls
- image grid
- metadata preview rail

### 5.2 Editor Screen

Purpose:

- view selected image
- mask selected region
- input prompt
- run AI edit
- compare versions

Sub-areas:

- version strip
- canvas area
- right-side editing panel

### 5.3 Settings Screen

Purpose:

- provider configuration
- API key configuration
- local storage and cache settings
- default model and export settings

## 6. Library Screen

### 6.1 Functional Goals

- allow import from folder
- display many images efficiently
- support fast scanning of thumbnails
- show edit state and version count
- open any image in editor

### 6.2 Layout

```text
+-----------------------------------------------------------------------------------+
| Top Bar                                                                            |
+-----------------------------------------------------------------------------------+
| Left Nav | Toolbar: Import Folder | Refresh | Sort | Filter | Search              |
+----------+-----------------------------------------------------------------------+
|          |                                                                       |
|          | Thumbnail Grid                                                        |
|          |                                                                       |
|          | [img] [img] [img] [img] [img]                                        |
|          | [img] [img] [img] [img] [img]                                        |
|          | [img] [img] [img] [img] [img]                                        |
|          |                                                                       |
|          +---------------------------------------------------------------+       |
|          | Preview / Metadata Rail                                       |       |
|          | filename                                                      |       |
|          | resolution                                                    |       |
|          | file size                                                     |       |
|          | versions                                                      |       |
|          | last edited                                                   |       |
|          | [Open in Editor]                                              |       |
|          +---------------------------------------------------------------+       |
+-----------------------------------------------------------------------------------+
```

### 6.3 Key Components

- import button
- search input
- sort dropdown
- filter chips
- virtualized thumbnail grid
- metadata card

### 6.4 Interaction Notes

- double-click thumbnail opens editor
- single-click updates preview rail
- right-click opens context menu in later phase

## 7. Editor Screen

### 7.1 Functional Goals

- support focused single-image editing
- keep canvas central
- keep prompt, mask, and history easy to switch
- allow quick draft generation

### 7.2 Layout

```text
+-----------------------------------------------------------------------------------+
| Top Bar: Back to Library | Image Name | Compare Toggle | Job Status              |
+-----------------------------------------------------------------------------------+
| Left Rail                  | Main Canvas                       | Right Panel        |
|---------------------------+-----------------------------------+--------------------|
| Image Mini Browser        |                                   | Tabs               |
| - current folder images   |                                   | [Prompt] [Mask]    |
|                           |                                   | [History] [Export] |
| Versions                  |                                   |                    |
| - Original                |         Image / Compare View      | Prompt Tab         |
| - Draft 1                 |                                   | prompt textbox     |
| - Final 1                 |                                   | preset chips       |
| - Draft 2                 |                                   | preserve toggles   |
|                           |                                   | model info         |
|                           |                                   | [Generate Draft]   |
|                           |                                   | [Generate Final]   |
|                           |                                   |                    |
+-----------------------------------------------------------------------------------+
| Bottom Status Bar: zoom | cursor position | crop size | provider | image mode      |
+-----------------------------------------------------------------------------------+
```

### 7.3 Main Canvas States

- single-image view
- before/after split view
- before/after toggle view
- mask overlay view

### 7.4 Left Rail in Editor

Sections:

- mini browser for neighboring images
- version history list
- version metadata summary

### 7.5 Right Panel Tabs

#### Prompt Tab

Contains:

- prompt textarea
- recent prompts
- prompt presets
- advanced constraints
- draft/final actions

#### Mask Tab

Contains:

- brush size slider
- brush softness slider
- brush/erase toggle
- show mask toggle
- clear mask button
- invert mask button

#### History Tab

Contains:

- edit timeline
- version comparison metadata
- restore to selected version action

#### Export Tab

Contains:

- output format
- output directory
- filename suffix options
- export current version button

## 8. Settings Screen

### 8.1 Functional Goals

- make BYOK setup easy
- clarify provider compatibility
- give users control over local storage

### 8.2 Layout

```text
+-----------------------------------------------------------------------------------+
| Top Bar: Settings                                                                  |
+-----------------------------------------------------------------------------------+
| Left Nav | Settings Categories | Main Form                                        |
+----------+---------------------+--------------------------------------------------+
|          | Provider            | Provider Profile                                 |
|          | Models              | baseURL                                          |
|          | Storage             | API key                                          |
|          | Export              | Validate Connection                              |
|          | Advanced            | compatibility notice                             |
|          |                     |                                                  |
|          |                     | Default Models                                   |
|          |                     | text model                                       |
|          |                     | fallback text model                              |
|          |                     | image model                                      |
|          |                     |                                                  |
|          |                     | Storage                                          |
|          |                     | cache path                                       |
|          |                     | cache size limit                                 |
|          |                     | clear cache                                      |
+-----------------------------------------------------------------------------------+
```

### 8.3 Settings Categories

- Provider
- Models
- Storage
- Export
- Advanced

## 9. Dialogs and Overlays

### 9.1 Import Folder Dialog

Purpose:

- select image folder
- optionally enable recursive scan

### 9.2 Job Progress Dialog

Purpose:

- show edit progress
- show draft/final mode
- allow cancellation when possible

### 9.3 Provider Validation Dialog

Purpose:

- confirm baseURL connectivity
- show whether text and image endpoints are compatible

### 9.4 Confirm Export Dialog

Purpose:

- confirm output format and path

## 10. User Flows

### 10.1 First Run Flow

1. user opens app
2. user lands in setup-first Library screen
3. app prompts for provider configuration
4. user enters `baseURL`, `API key`, and models
5. user imports first folder
6. thumbnails generate
7. user opens an image into editor

### 10.2 First Edit Flow

1. user opens image
2. user paints mask
3. user enters prompt
4. user clicks `Generate Draft`
5. app shows job state
6. draft version appears
7. user compares result and accepts or retries

### 10.3 Export Flow

1. user selects version
2. user opens Export tab
3. user chooses PNG or JPEG
4. user exports to folder

## 11. Responsive Behavior

Although the app targets desktop first, it should handle different window widths gracefully.

### 11.1 Large Window

- full three-column editor layout

### 11.2 Medium Window

- left rail collapses to icons or drawer
- right panel remains docked

### 11.3 Small Window

- only one side panel docked at a time
- compare mode simplified

## 12. Visual Hierarchy Guidance

- canvas must have the most visual weight
- prompt actions must be easier to access than secondary settings
- version history should be visible but not dominant
- settings should feel utilitarian and clean

## 13. Component Suggestions

Suggested use of `shadcn/ui` and `Radix UI`:

- navigation shell: sidebar pattern
- settings forms: input, select, switch, label, card
- tabs: editor right-panel mode switching
- dialogs: provider validation, export
- dropdown menu: library item actions
- tooltip: provider warnings, edit mode hints
- toast: background job completion and failure

## 14. Hand-off Notes

The wireframes in this document are intentionally low fidelity. The implementation should preserve:

- the three-zone editor layout
- the central role of the canvas
- direct access to prompt and mask tools
- version visibility in the editor
- a clear separation between browsing and editing modes

