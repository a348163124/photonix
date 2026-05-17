import { invoke, isTauri } from "./invoke";
import type { EditPreset, EditPresetCategory, PromptHistoryEntry, QualityMode } from "@/types";

interface RawPromptHistoryRow {
  id: string;
  raw_prompt: string;
  preset_id: string | null;
  quality_mode: string;
  image_id: string | null;
  version_id: string | null;
  created_at: string;
}

interface RawCustomPresetRow {
  id: string;
  category: string;
  name: string;
  description: string | null;
  prompt_template: string;
  preserve_identity: boolean;
  preserve_composition: boolean;
  created_at: string;
  updated_at: string | null;
}

export async function recordPromptHistory(entry: PromptHistoryEntry): Promise<void> {
  if (!isTauri()) return;
  await invoke("record_prompt_history", {
    entry: {
      id: entry.id,
      raw_prompt: entry.rawPrompt,
      preset_id: entry.presetId,
      quality_mode: entry.qualityMode,
      image_id: entry.imageId,
      version_id: entry.versionId,
      created_at: entry.createdAt,
    },
  });
}

export async function listPromptHistory(limit = 50): Promise<PromptHistoryEntry[]> {
  if (!isTauri()) return [];
  const rows = await invoke<RawPromptHistoryRow[]>("list_prompt_history", { limit });
  return rows.map((row) => ({
    id: row.id,
    rawPrompt: row.raw_prompt,
    presetId: row.preset_id,
    qualityMode: row.quality_mode as QualityMode,
    imageId: row.image_id,
    versionId: row.version_id,
    createdAt: row.created_at,
  }));
}

export async function deletePromptHistory(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_prompt_history", { id });
}

export async function upsertCustomPreset(preset: EditPreset): Promise<void> {
  if (!isTauri()) return;
  await invoke("upsert_custom_preset", {
    preset: {
      id: preset.id,
      category: preset.category,
      name: preset.name,
      description: preset.description,
      prompt_template: preset.promptTemplate,
      preserve_identity: preset.preserveIdentity,
      preserve_composition: preset.preserveComposition,
      created_at: preset.createdAt ?? new Date().toISOString(),
      updated_at: preset.updatedAt ?? null,
    },
  });
}

export async function listCustomPresets(): Promise<EditPreset[]> {
  if (!isTauri()) return [];
  const rows = await invoke<RawCustomPresetRow[]>("list_custom_presets");
  return rows.map((row) => ({
    id: row.id,
    category: row.category as EditPresetCategory,
    name: row.name,
    description: row.description ?? "Custom preset",
    promptTemplate: row.prompt_template,
    preserveIdentity: row.preserve_identity,
    preserveComposition: row.preserve_composition,
    isCustom: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  }));
}

export async function deleteCustomPreset(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_custom_preset", { id });
}
