import type { ProviderConfig } from "@/types";
import { invoke, isTauri } from "@/services/tauri/invoke";

export interface CompatibilityResult {
  connected: boolean;
  textModelAvailable: boolean;
  imageModelAvailable: boolean;
  warnings: string[];
  error: string | null;
}

interface RustValidateResult {
  connected: boolean;
  text_model_available: boolean;
  image_model_available: boolean;
  warnings: string[];
  error: string | null;
}

/**
 * Validate provider connectivity and model availability.
 * Runs entirely through Rust to avoid CORS/CSP restrictions in the WebView
 * and to keep the API key out of the JS request path.
 */
export async function checkProviderCompatibility(
  config: ProviderConfig
): Promise<CompatibilityResult> {
  if (!config.baseUrl || !config.apiKey) {
    return {
      connected: false,
      textModelAvailable: false,
      imageModelAvailable: false,
      warnings: [],
      error: "Base URL and API key are required",
    };
  }

  if (!isTauri()) {
    return {
      connected: false,
      textModelAvailable: false,
      imageModelAvailable: false,
      warnings: [],
      error: "Validation requires the desktop app (Tauri)",
    };
  }

  try {
    const result = await invoke<RustValidateResult>("validate_provider", {
      request: {
        base_url: config.baseUrl,
        api_key: config.apiKey,
        text_model: config.textModel,
        image_model: config.imageModel,
      },
    });

    return {
      connected: result.connected,
      textModelAvailable: result.text_model_available,
      imageModelAvailable: result.image_model_available,
      warnings: result.warnings,
      error: result.error,
    };
  } catch (err) {
    return {
      connected: false,
      textModelAvailable: false,
      imageModelAvailable: false,
      warnings: [],
      error: err instanceof Error ? err.message : "Validation failed",
    };
  }
}
