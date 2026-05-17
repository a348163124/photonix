import type {
  CompiledPrompt,
  ImageEditResult,
  PromptCompileInput,
  ProviderConfig,
  QualityMode,
  UploadProxyProfile,
} from "@/types";
import { compileEditPrompt } from "@/services/prompt/promptCompiler";
import { editImage } from "@/services/provider/imageEditClient";
import { withRetry } from "@/services/retry";
import { toast } from "@/components/ui/Toast";

export interface EditRequest {
  imageId: string;
  sourcePath: string;
  sourceWidth: number;
  sourceHeight: number;
  userPrompt: string;
  maskDataUrl: string;
  qualityMode: QualityMode;
  preserveIdentity: boolean;
  preserveComposition: boolean;
  imageType: "landscape" | "portrait" | "event" | "generic";
  uploadProxyProfile?: UploadProxyProfile;
}

export interface EditPipelineResult {
  compiledPrompt: CompiledPrompt;
  editResult: ImageEditResult;
}

/**
 * Full edit pipeline:
 * 1. Compile user prompt into structured instruction
 * 2. Submit image edit request to provider
 * 3. Return result
 */
export async function runEditPipeline(
  request: EditRequest,
  config: ProviderConfig,
  onProgress?: (message: string) => void
): Promise<EditPipelineResult> {
  // Step 1: Compile prompt
  onProgress?.("Compiling prompt...");

  const hasMask = request.maskDataUrl.length > 0;
  const compileInput: PromptCompileInput = {
    userPrompt: request.userPrompt,
    imageType: request.imageType,
    editMode: hasMask ? "local_mask" : "global",
    preserveIdentity: request.preserveIdentity,
    preserveComposition: request.preserveComposition,
    maskPresent: hasMask,
    qualityMode: request.qualityMode,
  };

  const compiledPrompt = await withRetry(
    () => compileEditPrompt(compileInput, config),
    {
      maxAttempts: 2,
      onRetry: (attempt) => {
        onProgress?.(`Prompt compilation retry ${attempt}...`);
        toast("Retrying prompt compilation...", "info");
      },
    }
  );

  // Step 2: Build the final prompt string from compiled output
  onProgress?.("Submitting edit request...");

  const finalPrompt = buildFinalPrompt(compiledPrompt);

  // Step 3: Submit image edit with retry
  const editResult = await withRetry(
    () =>
      editImage(
        {
          imagePath: request.sourcePath,
          maskPath: hasMask ? request.maskDataUrl : undefined,
          prompt: finalPrompt,
          qualityMode: request.qualityMode,
          outputFormat: "png",
          sourceKind: "preview_proxy",
          uploadProxyProfile: request.uploadProxyProfile,
          metadata: {
            imageId: request.imageId,
            sourceWidth: request.sourceWidth,
            sourceHeight: request.sourceHeight,
          },
        },
        config
      ),
    {
      maxAttempts: 2,
      baseDelayMs: 2000,
      onRetry: (attempt) => {
        onProgress?.(`Image edit retry ${attempt}...`);
        toast("Retrying image edit...", "info");
      },
    }
  );

  if (!editResult.success) {
    throw new Error(editResult.error ?? "Edit failed with unknown error");
  }

  onProgress?.("Edit complete");

  return { compiledPrompt, editResult };
}

/**
 * Build a natural language prompt from the compiled structure.
 */
function buildFinalPrompt(compiled: CompiledPrompt): string {
  const parts: string[] = [];

  parts.push(compiled.editGoal);

  if (compiled.preserve.length > 0) {
    parts.push(`Preserve: ${compiled.preserve.join(", ")}.`);
  }

  if (compiled.styleConstraints.length > 0) {
    parts.push(`Style: ${compiled.styleConstraints.join(", ")}.`);
  }

  if (compiled.negativeConstraints.length > 0) {
    parts.push(`Avoid: ${compiled.negativeConstraints.join(", ")}.`);
  }

  return parts.join(" ");
}
