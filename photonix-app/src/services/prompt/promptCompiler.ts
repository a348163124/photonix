import type { PromptCompileInput, CompiledPrompt, ProviderConfig } from "@/types";
import { invoke, isTauri } from "@/services/tauri/invoke";

interface RustCompiledPrompt {
  edit_goal: string;
  edit_scope: string;
  preserve: string[];
  style_constraints: string[];
  negative_constraints: string[];
  quality_mode: string;
}

/**
 * Compile a user prompt into a structured edit instruction.
 * Calls the Rust backend which handles the text model request —
 * no CORS issues, API key stays in native layer.
 */
export async function compileEditPrompt(
  input: PromptCompileInput,
  config: ProviderConfig
): Promise<CompiledPrompt> {
  if (!isTauri()) {
    // Fallback: return a simple pass-through for browser dev
    return {
      editGoal: input.userPrompt,
      editScope: input.maskPresent ? "local_masked_region" : "global",
      preserve: input.preserveComposition ? ["composition"] : [],
      styleConstraints: ["realistic lighting"],
      negativeConstraints: [],
      qualityMode: input.qualityMode,
    };
  }

  // Load API key from secure storage
  const apiKey = await invoke<string | null>("load_api_key");
  if (!apiKey) {
    throw new Error("No API key configured. Please set it in Settings.");
  }

  const result = await invoke<RustCompiledPrompt>("compile_prompt", {
    request: {
      user_prompt: input.userPrompt,
      image_type: input.imageType,
      edit_mode: input.editMode,
      preserve_identity: input.preserveIdentity,
      preserve_composition: input.preserveComposition,
      mask_present: input.maskPresent,
      quality_mode: input.qualityMode,
      base_url: config.baseUrl,
      api_key: apiKey,
      text_model: config.textModel,
    },
  });

  return {
    editGoal: result.edit_goal,
    editScope: result.edit_scope,
    preserve: result.preserve,
    styleConstraints: result.style_constraints,
    negativeConstraints: result.negative_constraints,
    qualityMode: result.quality_mode as CompiledPrompt["qualityMode"],
  };
}
