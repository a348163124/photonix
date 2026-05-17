import type { CompiledPrompt, PromptCompileInput, ProviderConfig } from "@/types";
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
 *
 * The text-model HTTP call happens entirely in Rust, which also reads the
 * API key from the OS secret store. The plaintext key never enters JS.
 */
export async function compileEditPrompt(
  input: PromptCompileInput,
  config: ProviderConfig
): Promise<CompiledPrompt> {
  if (!isTauri()) {
    // Browser dev fallback: minimal pass-through
    return {
      editGoal: input.userPrompt,
      editScope: input.maskPresent ? "local_masked_region" : "global",
      preserve: input.preserveComposition ? ["composition"] : [],
      styleConstraints: ["realistic lighting"],
      negativeConstraints: [],
      qualityMode: input.qualityMode,
    };
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
