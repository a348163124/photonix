import {
  useBatchExportStore,
  type BatchExportItem,
} from "@/stores/batchExportStore";
import { useStyleStore } from "@/stores/styleStore";
import { useBatchStore } from "@/stores/batchStore";
import { useAppStore } from "@/stores/appStore";
import {
  listCandidatesForImage,
  listFavoriteCandidates,
} from "@/services/tauri/candidates";
import { getVersions } from "@/services/tauri/versions";
import { invoke, isTauri } from "@/services/tauri/invoke";
import { applyFilenameTemplate } from "@/services/export/filenameTemplate";
import { toast } from "@/components/ui/Toast";
import {
  BORDER_TEMPLATES,
  EXPORT_PRESETS,
  type BorderTemplateId,
  type ImageAsset,
  type ImageVersion,
  type WatermarkTemplate,
} from "@/types";

/**
 * Build the export queue from the current selection mode + library state.
 * Returns the items to enqueue; does not start the runner.
 */
export async function buildBatchExportQueue(): Promise<BatchExportItem[]> {
  const store = useBatchExportStore.getState();
  const images = useAppStore.getState().images;
  const selectedIds = useBatchStore.getState().selectedImageIds;

  if (store.selectionMode === "current_versions") {
    return buildFromCurrentVersions(images, selectedIds);
  }
  return buildFromFavorites(images);
}

async function buildFromCurrentVersions(
  images: ImageAsset[],
  selectedIds: Set<string>
): Promise<BatchExportItem[]> {
  // If the user has multi-selected, use that. Otherwise, export all images.
  const targets = selectedIds.size > 0
    ? images.filter((img) => selectedIds.has(img.id))
    : images;

  const items: BatchExportItem[] = [];
  for (const img of targets) {
    let versions: ImageVersion[] = [];
    try {
      versions = await getVersions(img.id);
    } catch (err) {
      console.warn(`Failed to load versions for ${img.filename}:`, err);
    }
    const current = versions.find((v) => v.isCurrent);
    const sourcePath = current?.storagePath ?? img.sourcePath;
    const versionKind = current?.versionKind ?? "original";

    items.push({
      id: crypto.randomUUID(),
      imageId: img.id,
      imageFilename: img.filename,
      sourceVersionPath: sourcePath,
      sourceVersionKind: versionKind,
      selectionLabel: current ? versionKind : "original",
      outputPath: "",
      status: "queued",
    });
  }
  return items;
}

async function buildFromFavorites(images: ImageAsset[]): Promise<BatchExportItem[]> {
  const favs = await listFavoriteCandidates();
  if (favs.length === 0) return [];

  // Group favorites by image so we can attach the right filename context
  const imageById = new Map(images.map((img) => [img.id, img]));
  const versionCache = new Map<string, ImageVersion[]>();

  const items: BatchExportItem[] = [];
  for (const cand of favs) {
    if (!cand.versionId) continue;
    const img = imageById.get(cand.imageId);
    if (!img) continue;

    let versions = versionCache.get(cand.imageId);
    if (!versions) {
      try {
        versions = await getVersions(cand.imageId);
        versionCache.set(cand.imageId, versions);
      } catch (err) {
        console.warn(`Failed to load versions for ${img.filename}:`, err);
        continue;
      }
    }
    const version = versions.find((v) => v.id === cand.versionId);
    if (!version) continue;

    items.push({
      id: crypto.randomUUID(),
      imageId: img.id,
      imageFilename: img.filename,
      sourceVersionPath: version.storagePath,
      sourceVersionKind: version.versionKind,
      selectionLabel: `★ ${cand.label}`,
      outputPath: "",
      status: "queued",
    });
  }
  return items;
}

interface BatchExportRpcResult {
  status: "succeeded" | "skipped" | "failed";
  output_path: string | null;
  final_filename: string | null;
  error: string | null;
}

/**
 * Run the queue sequentially. Each item calls the Rust `batch_export_image`
 * command, which performs filename safety checks, existence reconcile, and
 * source-vs-destination collision checks atomically. The JS layer only owns
 * queue state and the proposed filename.
 */
export async function runBatchExport(): Promise<void> {
  const store = useBatchExportStore.getState();
  if (store.isRunning) return;
  if (!isTauri()) {
    toast("Batch export requires the desktop app.", "error");
    return;
  }
  if (!store.outputFolder) {
    toast("Pick an output folder first.", "info");
    return;
  }

  store.setRunning(true);

  const preset = EXPORT_PRESETS.find((p) => p.id === store.presetId);
  if (!preset) {
    toast(`Unknown export preset: ${store.presetId}`, "error");
    store.setRunning(false);
    return;
  }

  const fmt = preset.format;
  const ext = fmt === "jpeg" ? "jpg" : fmt;
  const style = useStyleStore.getState().selectedStyle();

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < store.items.length; i++) {
    const item = useBatchExportStore.getState().items[i];
    if (!item) break;
    const update = useBatchExportStore.getState().updateItem;

    update(item.id, { status: "running" });

    try {
      const baseName = item.imageFilename.replace(/\.[^.]+$/, "");
      const proposedName = applyFilenameTemplate(store.filenameTemplate, {
        originalName: baseName,
        style: style?.name ?? null,
        preset: store.presetId,
        versionKind: item.sourceVersionKind,
        index: i + 1,
        ext,
      });

      const result = await invoke<BatchExportRpcResult>("batch_export_image", {
        request: {
          source_path: item.sourceVersionPath,
          output_dir: store.outputFolder!,
          filename: proposedName,
          format: fmt,
          quality: preset.quality,
          max_long_edge: preset.longEdge,
          border: buildBorderConfig(store.borderId),
          watermark: buildWatermarkConfig(store.watermark),
          overwrite_policy: store.overwritePolicy,
        },
      });

      if (result.status === "succeeded") {
        update(item.id, {
          status: "succeeded",
          outputPath: result.output_path ?? "",
        });
        succeeded++;
      } else if (result.status === "skipped") {
        update(item.id, { status: "skipped" });
        skipped++;
      } else {
        update(item.id, {
          status: "failed",
          error: result.error ?? "Unknown export error",
        });
        failed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useBatchExportStore.getState().updateItem(item.id, {
        status: "failed",
        error: msg,
      });
      failed++;
    }
  }

  store.setRunning(false);

  if (failed === 0 && skipped === 0) {
    toast(`Exported ${succeeded} files.`, "success");
  } else {
    toast(
      `Batch export done: ${succeeded} ok, ${failed} failed, ${skipped} skipped`,
      failed > 0 ? "info" : "success"
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildBorderConfig(borderId: BorderTemplateId) {
  if (borderId === "none") return null;
  const meta = BORDER_TEMPLATES.find((b) => b.id === borderId);
  if (!meta) return null;
  return {
    thickness: meta.thickness,
    color: meta.color,
    inner_padding: meta.innerPadding ?? null,
    letterbox: meta.letterbox ?? false,
    forced_aspect: meta.forcedAspect ?? null,
  };
}

function buildWatermarkConfig(template: WatermarkTemplate) {
  if (!template.enabled || !template.text.trim()) return null;
  return {
    text: template.text,
    position: template.position,
    font_size: template.fontSize,
    color: template.color,
    opacity: template.opacity,
    margin: template.margin,
  };
}

// Used by the dialog for the "current versions per selected image" preview path
export async function previewCurrentVersionItems(
  images: ImageAsset[],
  selectedIds: Set<string>
): Promise<BatchExportItem[]> {
  return buildFromCurrentVersions(images, selectedIds);
}

// Used by the dialog for the "all favorited candidates" preview path
export async function previewFavoriteCandidateItems(
  images: ImageAsset[]
): Promise<BatchExportItem[]> {
  return buildFromFavorites(images);
}

// We expose listCandidatesForImage via re-export so it can power richer UIs later.
export { listCandidatesForImage };
