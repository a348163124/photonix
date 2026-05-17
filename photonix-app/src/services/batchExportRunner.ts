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

/**
 * Run the queue sequentially. Each item calls `export_image` with the
 * configured preset / border / watermark / filename template.
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

  const usedNames = new Set<string>();

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  // Re-read items each iteration so nothing gets stale
  for (let i = 0; i < store.items.length; i++) {
    const item = useBatchExportStore.getState().items[i];
    if (!item) break;
    const update = useBatchExportStore.getState().updateItem;

    update(item.id, { status: "running" });

    try {
      const baseName = item.imageFilename.replace(/\.[^.]+$/, "");
      const proposed = applyFilenameTemplate(store.filenameTemplate, {
        originalName: baseName,
        style: style?.name ?? null,
        preset: store.presetId,
        versionKind: item.sourceVersionKind,
        index: i + 1,
        ext,
      });

      const finalName = await reconcileOutputName(
        store.outputFolder!,
        proposed,
        store.overwritePolicy,
        usedNames
      );

      // Skipped — same-named file exists and policy is "skip"
      if (finalName === null) {
        update(item.id, { status: "skipped" });
        skipped++;
        continue;
      }
      usedNames.add(finalName);

      const outputPath = joinPath(store.outputFolder!, finalName);

      const borderConfig = buildBorderConfig(store.borderId);
      const watermarkConfig = buildWatermarkConfig(store.watermark);

      await invoke<string>("export_image", {
        sourcePath: item.sourceVersionPath,
        outputPath,
        format: fmt,
        quality: preset.quality,
        maxLongEdge: preset.longEdge,
        border: borderConfig,
        watermark: watermarkConfig,
      });

      update(item.id, { status: "succeeded", outputPath });
      succeeded++;
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

function joinPath(folder: string, filename: string): string {
  // Tauri returns Windows or POSIX paths verbatim — preserve the separator.
  const sep = folder.includes("\\") ? "\\" : "/";
  if (folder.endsWith("\\") || folder.endsWith("/")) return folder + filename;
  return folder + sep + filename;
}

async function reconcileOutputName(
  folder: string,
  proposed: string,
  policy: "skip" | "overwrite" | "rename",
  usedThisRun: Set<string>
): Promise<string | null> {
  if (policy === "overwrite") {
    return makeUniqueWithinRun(proposed, usedThisRun);
  }

  // Check disk for existence using a short Tauri fs plugin call
  const exists = await fileExists(joinPath(folder, proposed));
  if (!exists) {
    return makeUniqueWithinRun(proposed, usedThisRun);
  }

  if (policy === "skip") return null;

  // Rename: append _1, _2, ...
  const dot = proposed.lastIndexOf(".");
  const stem = dot >= 0 ? proposed.slice(0, dot) : proposed;
  const ext = dot >= 0 ? proposed.slice(dot) : "";
  for (let i = 1; i < 1000; i++) {
    const candidate = `${stem}_${i}${ext}`;
    const onDisk = await fileExists(joinPath(folder, candidate));
    if (!onDisk && !usedThisRun.has(candidate)) return candidate;
  }
  return makeUniqueWithinRun(proposed, usedThisRun);
}

/** When two queue items resolve to the same name in the same run, suffix _2, _3... */
function makeUniqueWithinRun(name: string, used: Set<string>): string {
  if (!used.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot >= 0 ? name.slice(0, dot) : name;
  const ext = dot >= 0 ? name.slice(dot) : "";
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem}_${i}${ext}`;
    if (!used.has(candidate)) return candidate;
  }
  return name;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const { exists } = await import("@tauri-apps/plugin-fs");
    return await exists(path);
  } catch {
    // If the plugin isn't available, default to "doesn't exist" so we don't
    // block the export. The Rust export call will surface any real error.
    return false;
  }
}

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
