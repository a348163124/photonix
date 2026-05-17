import { invoke, isTauri } from "./invoke";
import type {
  AiStyleAnalysis,
  ColorTemperature,
  ContrastLevel,
  LocalColorAnalysis,
  ReferenceStyleAnalysis,
  SaturationLevel,
  StyleCategory,
  StyleProfile,
  StyleSource,
} from "@/types";

interface RawAnalyzeReferenceStyleResult {
  success: boolean;
  error: string | null;
  local_color: {
    dominant_palette: string[];
    average_hsl: { h: number; s: number; l: number };
    warm_cool_balance: number;
    saturation_mean: number;
    contrast_estimate: number;
  } | null;
  ai: {
    summary: string;
    colorMood: string;
    temperature: string;
    saturation: string;
    contrast: string;
    shadowBehavior: string;
    highlightBehavior: string;
    dominantPalette: string[];
    landscapeGuidance: string[];
    portraitGuidance: string[];
    negativeConstraints: string[];
    reusablePromptFragment: string;
  } | null;
  draft_profile: {
    id: string;
    name: string;
    category: string;
    source: string;
    reference_image_path: string | null;
    description: string;
    style_summary: string;
    positive_prompt: string;
    negative_prompt: string;
    color_mood_json: string | null;
    preserve_identity: boolean;
    preserve_composition: boolean;
    is_default: boolean;
    created_at: string;
    updated_at: string;
  } | null;
}

export async function analyzeReferenceStyle(
  imagePath: string,
  baseUrl: string,
  textModel: string
): Promise<ReferenceStyleAnalysis> {
  if (!isTauri()) {
    throw new Error("Reference style analysis requires the desktop app.");
  }
  const result = await invoke<RawAnalyzeReferenceStyleResult>(
    "analyze_reference_style",
    {
      request: {
        image_path: imagePath,
        base_url: baseUrl,
        text_model: textModel,
      },
    }
  );

  if (!result.success || !result.local_color || !result.ai || !result.draft_profile) {
    throw new Error(result.error ?? "Reference style analysis failed");
  }

  const localColor: LocalColorAnalysis = {
    dominantPalette: result.local_color.dominant_palette,
    averageHsl: result.local_color.average_hsl,
    warmCoolBalance: result.local_color.warm_cool_balance,
    saturationMean: result.local_color.saturation_mean,
    contrastEstimate: result.local_color.contrast_estimate,
  };

  const ai: AiStyleAnalysis = {
    summary: result.ai.summary,
    colorMood: result.ai.colorMood,
    temperature: result.ai.temperature as ColorTemperature,
    saturation: result.ai.saturation as SaturationLevel,
    contrast: result.ai.contrast as ContrastLevel,
    shadowBehavior: result.ai.shadowBehavior,
    highlightBehavior: result.ai.highlightBehavior,
    dominantPalette: result.ai.dominantPalette,
    landscapeGuidance: result.ai.landscapeGuidance,
    portraitGuidance: result.ai.portraitGuidance,
    negativeConstraints: result.ai.negativeConstraints,
    reusablePromptFragment: result.ai.reusablePromptFragment,
  };

  const draftProfile: StyleProfile = {
    id: result.draft_profile.id,
    name: result.draft_profile.name,
    category: result.draft_profile.category as StyleCategory,
    source: result.draft_profile.source as StyleSource,
    referenceImagePath: result.draft_profile.reference_image_path,
    description: result.draft_profile.description,
    styleSummary: result.draft_profile.style_summary,
    positivePrompt: result.draft_profile.positive_prompt,
    negativePrompt: result.draft_profile.negative_prompt,
    colorMood: result.draft_profile.color_mood_json
      ? safeParseColorMood(result.draft_profile.color_mood_json)
      : null,
    preserveIdentity: result.draft_profile.preserve_identity,
    preserveComposition: result.draft_profile.preserve_composition,
    isDefault: result.draft_profile.is_default,
    createdAt: result.draft_profile.created_at,
    updatedAt: result.draft_profile.updated_at,
  };

  return { localColor, ai, draftProfile };
}

function safeParseColorMood(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
