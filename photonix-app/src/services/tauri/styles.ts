import { invoke, isTauri } from "./invoke";
import type {
  ColorMood,
  StyleCategory,
  StyleProfile,
  StyleSource,
} from "@/types";

interface RawStyleProfileRow {
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
}

function parseColorMood(raw: string | null): ColorMood | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ColorMood;
    return parsed;
  } catch {
    return null;
  }
}

function rowToProfile(row: RawStyleProfileRow): StyleProfile {
  return {
    id: row.id,
    name: row.name,
    category: row.category as StyleCategory,
    source: row.source as StyleSource,
    referenceImagePath: row.reference_image_path,
    description: row.description ?? "",
    styleSummary: row.style_summary,
    positivePrompt: row.positive_prompt,
    negativePrompt: row.negative_prompt ?? "",
    colorMood: parseColorMood(row.color_mood_json),
    preserveIdentity: row.preserve_identity,
    preserveComposition: row.preserve_composition,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function profileToRow(profile: StyleProfile): RawStyleProfileRow {
  return {
    id: profile.id,
    name: profile.name,
    category: profile.category,
    source: profile.source,
    reference_image_path: profile.referenceImagePath,
    description: profile.description,
    style_summary: profile.styleSummary,
    positive_prompt: profile.positivePrompt,
    negative_prompt: profile.negativePrompt,
    color_mood_json: profile.colorMood ? JSON.stringify(profile.colorMood) : null,
    preserve_identity: profile.preserveIdentity,
    preserve_composition: profile.preserveComposition,
    is_default: profile.isDefault,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  };
}

export async function upsertStyleProfile(profile: StyleProfile): Promise<void> {
  if (!isTauri()) return;
  await invoke("upsert_style_profile", { profile: profileToRow(profile) });
}

export async function listStyleProfiles(): Promise<StyleProfile[]> {
  if (!isTauri()) return [];
  const rows = await invoke<RawStyleProfileRow[]>("list_style_profiles");
  return rows.map(rowToProfile);
}

export async function deleteStyleProfile(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_style_profile", { id });
}

export async function setDefaultStyleProfile(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_default_style_profile", { id });
}
