import type { ImageEditInput, ImageEditResult, ProviderConfig } from "@/types";
import { invoke, isTauri } from "@/services/tauri/invoke";

interface SubmitEditResult {
  success: boolean;
  version_id: string | null;
  output_path: string | null;
  error: string | null;
}

/**
 * Submit an image edit via the Tauri backend.
 *
 * The Rust side handles:
 * - Reading the API key from the OS secret store
 * - Reading image bytes from disk
 * - Reading mask bytes from disk and adapting them to provider semantics
 * - Multipart upload to provider
 * - Saving returned image to versions directory
 * - Creating version record in SQLite
 */
export async function editImage(
  input: ImageEditInput,
  config: ProviderConfig
): Promise<ImageEditResult> {
  if (!isTauri()) {
    return {
      success: false,
      outputPath: null,
      error: "Image editing requires the desktop app (Tauri)",
    };
  }

  // If mask is a data URL, save it to disk first
  let maskPath: string | undefined;
  if (input.maskPath && input.maskPath.startsWith("data:")) {
    maskPath = await invoke<string>("save_mask_to_disk", {
      imageId: input.metadata.imageId,
      maskDataUrl: input.maskPath,
    });
  } else {
    maskPath = input.maskPath;
  }

  const result = await invoke<SubmitEditResult>("submit_edit", {
    request: {
      image_id: input.metadata.imageId,
      source_path: input.imagePath,
      mask_path: maskPath ?? null,
      prompt: input.prompt,
      quality_mode: input.qualityMode,
      upload_proxy_profile: input.uploadProxyProfile ?? null,
      base_url: config.baseUrl,
      image_model: config.imageModel,
    },
  });

  return {
    success: result.success,
    outputPath: result.output_path,
    error: result.error,
    versionId: result.version_id ?? undefined,
  };
}
