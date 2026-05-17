import { useBatchStore, type BatchEditItem } from "@/stores/batchStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { runEditPipeline } from "@/services/editPipeline";
import { recordPromptHistory } from "@/services/tauri/promptHistory";
import { toast } from "@/components/ui/Toast";

/**
 * Run all queued items in the batch sequentially.
 * Each item goes through the same edit pipeline as a single edit.
 * Failures do not block subsequent items.
 */
export async function runBatch(): Promise<void> {
  const store = useBatchStore.getState();
  if (store.isRunning) return;

  store.setRunning(true);

  const provider = useSettingsStore.getState().provider;
  const profile = useSettingsStore.getState().uploadProxyProfile;

  if (!provider.apiKey) {
    toast("API key not configured. Set it in Settings.", "error");
    store.setRunning(false);
    return;
  }

  try {
    // We re-read items each iteration so cancellations are picked up
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const items = useBatchStore.getState().items;
      const next = items.find((it) => it.status === "queued");
      if (!next) break;

      await runOneItem(next, provider, profile);
    }
  } finally {
    store.setRunning(false);
  }
}

async function runOneItem(
  item: BatchEditItem,
  provider: ReturnType<typeof useSettingsStore.getState>["provider"],
  profile: ReturnType<typeof useSettingsStore.getState>["uploadProxyProfile"]
): Promise<void> {
  const update = useBatchStore.getState().updateItem;
  update(item.id, { status: "running" });

  try {
    await runEditPipeline(
      {
        imageId: item.imageId,
        sourcePath: item.imageSourcePath,
        sourceWidth: item.imageWidth,
        sourceHeight: item.imageHeight,
        userPrompt: item.prompt,
        maskDataUrl: "", // batch mode = global edit, no mask
        qualityMode: item.qualityMode,
        preserveIdentity: false,
        preserveComposition: true,
        imageType: "landscape",
        uploadProxyProfile: profile,
      },
      provider
    );

    // Persist into prompt history
    void recordPromptHistory({
      id: crypto.randomUUID(),
      rawPrompt: item.prompt,
      presetId: item.presetId,
      qualityMode: item.qualityMode,
      imageId: item.imageId,
      versionId: null,
      createdAt: new Date().toISOString(),
    }).catch(() => {});

    update(item.id, { status: "succeeded" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    update(item.id, { status: "failed", error: msg });
  }
}

/** Build queue items from a list of selected images and a single prompt. */
export function buildQueueFromSelection(
  selectedImages: Array<{
    id: string;
    filename: string;
    sourcePath: string;
    width: number;
    height: number;
  }>,
  prompt: string,
  presetId: string | null,
  qualityMode: "draft" | "final"
): BatchEditItem[] {
  return selectedImages.map((img) => ({
    id: crypto.randomUUID(),
    imageId: img.id,
    imageFilename: img.filename,
    imageSourcePath: img.sourcePath,
    imageWidth: img.width,
    imageHeight: img.height,
    prompt,
    presetId,
    qualityMode,
    status: "queued" as const,
  }));
}

/** Retry a failed item by flipping its status back to queued. */
export function retryItem(id: string): void {
  useBatchStore.getState().updateItem(id, {
    status: "queued",
    error: undefined,
  });
  // Resume runner if not currently running
  const { isRunning } = useBatchStore.getState();
  if (!isRunning) void runBatch();
}
