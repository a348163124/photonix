import { useAppStore } from "@/stores/appStore";
import { useCandidateStore } from "@/stores/candidateStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { runEditPipeline } from "@/services/editPipeline";
import { recordCandidate } from "@/services/tauri/candidates";
import { getVersions } from "@/services/tauri/versions";
import { isTauri } from "@/services/tauri/invoke";
import { toast } from "@/components/ui/Toast";
import type { CandidatePlan, EditCandidate, ImageAsset, StyleProfile } from "@/types";

export interface CandidateRunInput {
  image: ImageAsset;
  basePrompt: string;
  style: StyleProfile | null;
  plans: CandidatePlan[];
  groupId: string;
}

/**
 * Run candidate plans sequentially through the same edit pipeline as a single
 * edit. Each successful run produces an `image_versions` row plus an
 * `edit_candidates` row tying it to the candidate group.
 *
 * Sequential by design (PRD §33.5.3) — image edit requests are expensive and
 * provider rate limits surprise users.
 */
export async function runCandidates(input: CandidateRunInput): Promise<void> {
  const candidateStore = useCandidateStore.getState();
  if (candidateStore.isRunning) return;

  const provider = useSettingsStore.getState().provider;
  const profile = useSettingsStore.getState().uploadProxyProfile;
  const hasKey = useSettingsStore.getState().hasApiKey;

  if (!hasKey) {
    toast("API key not configured. Set it in Settings.", "error");
    return;
  }

  // Seed the run-time queue
  const runItems = input.plans.map((plan) => ({
    id: crypto.randomUUID(),
    imageId: input.image.id,
    groupId: input.groupId,
    label: plan.label,
    promptModifier: plan.promptModifier,
    status: "queued" as const,
  }));
  candidateStore.setRunItems(runItems);
  candidateStore.setRunning(true);

  try {
    for (let i = 0; i < input.plans.length; i++) {
      const plan = input.plans[i];
      const item = runItems[i];
      if (!plan || !item) continue;

      candidateStore.updateRunItem(item.id, { status: "running" });

      const finalPrompt = mergePrompt(input.basePrompt, plan, input.style);

      try {
        const result = await runEditPipeline(
          {
            imageId: input.image.id,
            sourcePath: input.image.sourcePath,
            sourceWidth: input.image.width,
            sourceHeight: input.image.height,
            userPrompt: finalPrompt,
            maskDataUrl: "",
            qualityMode: "draft",
            preserveIdentity: input.style?.preserveIdentity ?? false,
            preserveComposition: input.style?.preserveComposition ?? true,
            imageType: input.style?.category === "portrait" ? "portrait" : "landscape",
            uploadProxyProfile: profile,
          },
          provider
        );

        const versionId = result.editResult.versionId ?? null;

        // Persist candidate metadata
        const candidate: EditCandidate = {
          id: crypto.randomUUID(),
          imageId: input.image.id,
          versionId,
          candidateGroupId: input.groupId,
          label: plan.label,
          promptModifier: plan.promptModifier,
          styleProfileId: input.style?.id ?? null,
          isFavorite: false,
          createdAt: new Date().toISOString(),
        };
        await recordCandidate(candidate).catch((err) =>
          console.error("Failed to persist candidate:", err)
        );
        useCandidateStore.getState().addForImage(input.image.id, candidate);

        candidateStore.updateRunItem(item.id, {
          status: "succeeded",
          versionId: versionId ?? undefined,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        candidateStore.updateRunItem(item.id, { status: "failed", error: msg });
      }
    }

    // After the run, refresh the version list so the editor reflects the new
    // versions. Activate the last successful one so the canvas shows
    // something meaningful.
    if (isTauri()) {
      try {
        const versions = await getVersions(input.image.id);
        useAppStore.getState().setCurrentVersions(versions);
        const lastSuccessful = useCandidateStore
          .getState()
          .runItems.slice()
          .reverse()
          .find((it) => it.status === "succeeded" && it.versionId);
        if (lastSuccessful?.versionId) {
          useAppStore.getState().setActiveVersion(lastSuccessful.versionId);
        }
      } catch (err) {
        console.error("Failed to refresh versions after candidates:", err);
      }
    }

    const succeeded = useCandidateStore
      .getState()
      .runItems.filter((it) => it.status === "succeeded").length;
    const failed = useCandidateStore
      .getState()
      .runItems.filter((it) => it.status === "failed").length;
    if (failed === 0) {
      toast(`Generated ${succeeded} candidate${succeeded === 1 ? "" : "s"}`, "success");
    } else {
      toast(`Candidates done: ${succeeded} ok, ${failed} failed`, "info");
    }
  } finally {
    candidateStore.setRunning(false);
  }
}

function mergePrompt(
  basePrompt: string,
  plan: CandidatePlan,
  style: StyleProfile | null
): string {
  const parts: string[] = [basePrompt.trim()];
  if (style) {
    parts.push(`Style: ${style.positivePrompt}`);
    if (style.negativePrompt) parts.push(`Avoid: ${style.negativePrompt}`);
  }
  parts.push(`Variant (${plan.label}): ${plan.promptModifier}`);
  if (plan.negativeModifier) parts.push(`Variant avoid: ${plan.negativeModifier}`);
  return parts.join(". ").replace(/\.+\s*\./g, ".");
}
