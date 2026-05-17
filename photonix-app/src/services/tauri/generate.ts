import { invoke, isTauri } from "./invoke";
import type { GeneratedImage, GenerationQuality, GenerationSize } from "@/types";

interface RawGeneratedImage {
  id: string;
  storage_path: string;
  prompt: string;
  size: string;
  quality: string;
  width: number;
  height: number;
  file_size_bytes: number | null;
  created_at: string;
}

interface RawGenerateResult {
  success: boolean;
  image: RawGeneratedImage | null;
  error: string | null;
}

export interface GenerateInput {
  prompt: string;
  size: GenerationSize;
  quality: GenerationQuality;
  baseUrl: string;
  imageModel: string;
}

export interface GenerateOutput {
  success: boolean;
  image: GeneratedImage | null;
  error: string | null;
}

/**
 * Generate a new image from a text prompt.
 *
 * Rust handles reading the API key from the OS secret store and the
 * provider call. The plaintext key never enters JS.
 */
export async function generateImage(input: GenerateInput): Promise<GenerateOutput> {
  if (!isTauri()) {
    return {
      success: false,
      image: null,
      error: "Generation requires the desktop app (Tauri)",
    };
  }

  const result = await invoke<RawGenerateResult>("generate_image", {
    request: {
      prompt: input.prompt,
      size: input.size,
      quality: input.quality,
      base_url: input.baseUrl,
      image_model: input.imageModel,
    },
  });

  return {
    success: result.success,
    image: result.image ? mapRow(result.image) : null,
    error: result.error,
  };
}

export async function listGeneratedImages(): Promise<GeneratedImage[]> {
  if (!isTauri()) return [];
  const rows = await invoke<RawGeneratedImage[]>("list_generated_images");
  return rows.map(mapRow);
}

export async function deleteGeneratedImage(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_generated_image", { id });
}

function mapRow(row: RawGeneratedImage): GeneratedImage {
  return {
    id: row.id,
    storagePath: row.storage_path,
    prompt: row.prompt,
    size: row.size as GenerationSize,
    quality: row.quality as GenerationQuality,
    width: row.width,
    height: row.height,
    fileSizeBytes: row.file_size_bytes,
    createdAt: row.created_at,
  };
}
