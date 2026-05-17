// ─── Core Domain Types ───────────────────────────────────────────────────────

export interface ImageAsset {
  id: string;
  folderId: string | null;
  sourcePath: string;
  filename: string;
  extension: string;
  fileSizeBytes: number;
  width: number;
  height: number;
  checksum: string | null;
  importStatus: ImportStatus;
  createdAt: string;
  modifiedAt: string;
}

export type ImportStatus = "indexed" | "missing" | "error";

export interface ImageVersion {
  id: string;
  imageId: string;
  parentVersionId: string | null;
  versionKind: VersionKind;
  storagePath: string;
  width: number;
  height: number;
  fileSizeBytes: number | null;
  isCurrent: boolean;
  createdAt: string;
}

export type VersionKind = "original" | "draft" | "final" | "stitched" | "export_snapshot";

export interface EditJob {
  id: string;
  imageId: string;
  baseVersionId: string;
  resultVersionId: string | null;
  promptId: string;
  jobType: JobType;
  jobStatus: JobStatus;
  qualityMode: QualityMode;
  sourceKind: SourceKind;
  cropRectJson: string | null;
  maskPath: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export type JobType = "global_edit" | "local_mask_edit" | "proxy_render" | "thumbnail_render";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type QualityMode = "draft" | "final";
export type SourceKind = "preview_proxy" | "source_crop";

export interface Prompt {
  id: string;
  imageId: string;
  rawPrompt: string;
  compiledPromptJson: string | null;
  textModel: string;
  compileMode: string;
  createdAt: string;
}

// ─── Provider Types ──────────────────────────────────────────────────────────

/**
 * Non-secret provider configuration.
 *
 * The API key is intentionally NOT part of this type. It lives only in the
 * platform secret store (Windows Credential Manager via the Rust `keyring`
 * crate). The frontend only knows whether one is configured (see
 * `SettingsState.hasApiKey`).
 */
export interface ProviderConfig {
  baseUrl: string;
  imageModel: string;
  textModel: string;
  fallbackTextModel: string;
  /**
   * Vision-capable text model used for reference style analysis (MVP3 §33.8).
   * Falls back to `textModel` when empty. Many providers expose vision under
   * a different model id than the default chat model, so we let users
   * override it explicitly to avoid runtime "model does not support image
   * input" errors.
   */
  visionModel: string;
}

// ─── Prompt Compiler Types ───────────────────────────────────────────────────

export interface PromptCompileInput {
  userPrompt: string;
  imageType: "landscape" | "portrait" | "event" | "generic";
  editMode: "global" | "local_mask";
  preserveIdentity: boolean;
  preserveComposition: boolean;
  maskPresent: boolean;
  qualityMode: QualityMode;
}

export interface CompiledPrompt {
  editGoal: string;
  editScope: string;
  preserve: string[];
  styleConstraints: string[];
  negativeConstraints: string[];
  qualityMode: QualityMode;
}

// ─── Image Edit Types ────────────────────────────────────────────────────────

export interface ImageEditInput {
  imagePath: string;
  maskPath?: string;
  prompt: string;
  qualityMode: QualityMode;
  outputFormat: "png" | "jpeg";
  sourceKind: SourceKind;
  /** MVP2: upload proxy profile name; falls back to "recommended" in Rust if absent. */
  uploadProxyProfile?: UploadProxyProfile;
  metadata: {
    imageId: string;
    sourceWidth: number;
    sourceHeight: number;
    cropRect?: CropRect;
  };
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageEditResult {
  success: boolean;
  outputPath: string | null;
  error: string | null;
  /** Newly created version id when the edit succeeded. */
  versionId?: string;
}

// ─── Navigation ──────────────────────────────────────────────────────────────

export type AppView = "generate" | "library" | "editor" | "style" | "settings";

// ─── Image Generation ────────────────────────────────────────────────────────

export type GenerationSize = "auto" | "1024x1024" | "1792x1024" | "1024x1792";
export type GenerationQuality = "auto" | "standard" | "hd";

export interface GeneratedImage {
  id: string;
  storagePath: string;
  prompt: string;
  size: GenerationSize;
  quality: GenerationQuality;
  width: number;
  height: number;
  fileSizeBytes: number | null;
  createdAt: string;
}

// ─── MVP2: Upload Proxy and Export Profiles ─────────────────────────────────

export type UploadProxyProfile = "fast" | "recommended" | "high_quality";

export interface ProxyProfileMeta {
  id: UploadProxyProfile;
  label: string;
  description: string;
  longEdge: number;
  maxBytes: number;
  jpegQualityFloor: number;
}

export const PROXY_PROFILES: ProxyProfileMeta[] = [
  {
    id: "fast",
    label: "Fast",
    description: "Quick drafts and unstable networks",
    longEdge: 3072,
    maxBytes: 5 * 1024 * 1024,
    jpegQualityFloor: 68,
  },
  {
    id: "recommended",
    label: "Recommended",
    description: "Default landscape and social sharing",
    longEdge: 4096,
    maxBytes: 8 * 1024 * 1024,
    jpegQualityFloor: 78,
  },
  {
    id: "high_quality",
    label: "High Quality",
    description: "More detail, slower upload",
    longEdge: 5120,
    maxBytes: 12 * 1024 * 1024,
    jpegQualityFloor: 82,
  },
];

export type ExportPresetId =
  | "wechat_moments"
  | "high_quality_mobile"
  | "small_file"
  | "archive_png"
  | "custom";

export interface ExportPresetMeta {
  id: ExportPresetId;
  label: string;
  description: string;
  format: "jpeg" | "png";
  longEdge: number | null; // null = no resize
  quality: number; // 0..100; ignored for png
}

export const EXPORT_PRESETS: ExportPresetMeta[] = [
  {
    id: "wechat_moments",
    label: "WeChat Moments",
    description: "Good mobile quality, manageable size",
    format: "jpeg",
    longEdge: 4096,
    quality: 90,
  },
  {
    id: "high_quality_mobile",
    label: "High Quality Mobile",
    description: "More detail, larger file",
    format: "jpeg",
    longEdge: 5120,
    quality: 92,
  },
  {
    id: "small_file",
    label: "Small File",
    description: "Fast sharing",
    format: "jpeg",
    longEdge: 2560,
    quality: 85,
  },
  {
    id: "archive_png",
    label: "Archive PNG",
    description: "Lossless local keeping",
    format: "png",
    longEdge: null,
    quality: 100,
  },
  {
    id: "custom",
    label: "Custom",
    description: "Manual format and quality",
    format: "jpeg",
    longEdge: null,
    quality: 90,
  },
];

// ─── MVP2: Edit Presets ──────────────────────────────────────────────────────

export type EditPresetCategory = "landscape" | "portrait" | "custom";

export interface EditPreset {
  id: string;
  category: EditPresetCategory;
  name: string;
  description: string;
  promptTemplate: string;
  preserveIdentity: boolean;
  preserveComposition: boolean;
  isCustom: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ─── MVP2: Prompt History ────────────────────────────────────────────────────

export interface PromptHistoryEntry {
  id: string;
  rawPrompt: string;
  presetId: string | null;
  qualityMode: QualityMode;
  imageId: string | null;
  versionId: string | null;
  createdAt: string;
}

// ─── MVP3: Style Profiles ────────────────────────────────────────────────────

export type StyleCategory = "landscape" | "portrait" | "travel" | "custom";
export type StyleSource = "manual" | "reference_analysis" | "preset";
export type ColorTemperature = "cool" | "neutral" | "warm";
export type SaturationLevel = "low" | "natural" | "rich";
export type ContrastLevel = "soft" | "balanced" | "strong";

export interface ColorMood {
  temperature: ColorTemperature;
  saturation: SaturationLevel;
  contrast: ContrastLevel;
  shadowTint?: string;
  highlightTint?: string;
}

export interface StyleProfile {
  id: string;
  name: string;
  category: StyleCategory;
  source: StyleSource;
  referenceImagePath: string | null;
  description: string;
  styleSummary: string;
  positivePrompt: string;
  negativePrompt: string;
  colorMood: ColorMood | null;
  preserveIdentity: boolean;
  preserveComposition: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── MVP3: Reference Style Analysis ──────────────────────────────────────────

export interface LocalColorAnalysis {
  dominantPalette: string[]; // hex strings
  averageHsl: { h: number; s: number; l: number };
  warmCoolBalance: number; // -1 (cool) … +1 (warm)
  saturationMean: number;
  contrastEstimate: number;
}

export interface AiStyleAnalysis {
  summary: string;
  colorMood: string;
  temperature: ColorTemperature;
  saturation: SaturationLevel;
  contrast: ContrastLevel;
  shadowBehavior: string;
  highlightBehavior: string;
  dominantPalette: string[];
  landscapeGuidance: string[];
  portraitGuidance: string[];
  negativeConstraints: string[];
  reusablePromptFragment: string;
}

export interface ReferenceStyleAnalysis {
  localColor: LocalColorAnalysis;
  ai: AiStyleAnalysis;
  draftProfile: StyleProfile;
}

// ─── MVP3: Multi-Version Candidates ──────────────────────────────────────────

export type CandidateMode =
  | "natural"
  | "cinematic"
  | "clean_bright"
  | "moody"
  | "warm"
  | "cool"
  | "style_variants";

export interface CandidatePlan {
  id: string;
  label: string;
  promptModifier: string;
  negativeModifier: string;
}

export interface EditCandidate {
  id: string;
  imageId: string;
  versionId: string | null;
  candidateGroupId: string;
  label: string;
  promptModifier: string | null;
  styleProfileId: string | null;
  isFavorite: boolean;
  createdAt: string;
}

// ─── MVP3: Borders, Watermarks, Filename Templates ───────────────────────────

export type BorderTemplateId =
  | "none"
  | "thin_white"
  | "thin_black"
  | "gallery_mat"
  | "cinematic_letterbox"
  | "square_social";

export interface BorderTemplateMeta {
  id: BorderTemplateId;
  label: string;
  description: string;
  /** Border thickness in pixels. */
  thickness: number;
  /** Hex color. */
  color: string;
  /** When set, force the canvas to this aspect ratio (e.g. 1.0 for square). */
  forcedAspect?: number;
  /** Inner padding inside the colored border. */
  innerPadding?: number;
  /** Letterbox bars (top+bottom, no left/right) when true. */
  letterbox?: boolean;
}

export const BORDER_TEMPLATES: BorderTemplateMeta[] = [
  { id: "none", label: "No border", description: "Original image unchanged", thickness: 0, color: "#000000" },
  { id: "thin_white", label: "Thin white", description: "Subtle clean edge", thickness: 24, color: "#FFFFFF" },
  { id: "thin_black", label: "Thin black", description: "Editorial look", thickness: 24, color: "#000000" },
  { id: "gallery_mat", label: "Gallery mat", description: "Wide warm-white mat", thickness: 96, color: "#F5F1E8" },
  { id: "cinematic_letterbox", label: "Cinematic letterbox", description: "Top + bottom bars", thickness: 80, color: "#000000", letterbox: true },
  { id: "square_social", label: "Square social", description: "1:1 canvas with white margin", thickness: 64, color: "#FFFFFF", forcedAspect: 1.0 },
];

export type WatermarkPosition =
  | "bottom_right"
  | "bottom_left"
  | "bottom_center"
  | "top_right"
  | "top_left";

export interface WatermarkTemplate {
  enabled: boolean;
  text: string;
  position: WatermarkPosition;
  /** Font size in pixels at the source resolution. */
  fontSize: number;
  /** Hex color. */
  color: string;
  /** 0..1 */
  opacity: number;
  /** Distance from the edge in pixels. */
  margin: number;
}

export const DEFAULT_WATERMARK: WatermarkTemplate = {
  enabled: false,
  text: "",
  position: "bottom_right",
  fontSize: 28,
  color: "#FFFFFF",
  opacity: 0.7,
  margin: 28,
};

/**
 * Filename template tokens replaced at export time.
 * Supported: {original_name}, {style}, {preset}, {date}, {time}, {index},
 *            {version_kind}, {ext}
 */
export type FilenameTemplate = string;

export const DEFAULT_FILENAME_TEMPLATE: FilenameTemplate =
  "{original_name}_{preset}.{ext}";

// ─── MVP3: Batch Export ──────────────────────────────────────────────────────

export type OverwritePolicy = "skip" | "overwrite" | "rename";
