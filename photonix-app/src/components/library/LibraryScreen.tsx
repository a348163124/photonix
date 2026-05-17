import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";
import { useBatchStore } from "@/stores/batchStore";
import { importFolder, getAllImages, generateThumbnail } from "@/services/tauri/images";
import { loadVersionsForImage } from "@/services/loadVersionsForImage";
import { isTauri } from "@/services/tauri/invoke";
import { BatchDialog } from "./BatchDialog";
import { BatchExportDialog } from "./BatchExportDialog";
import { useBatchExportStore } from "@/stores/batchExportStore";
import { useTranslation } from "@/i18n";
import type { ImageAsset } from "@/types";

const THUMBNAIL_BATCH_SIZE = 50;
const THUMBNAIL_CONCURRENCY = 2;

export function LibraryScreen() {
  const { t } = useTranslation();
  const images = useAppStore((s) => s.images);
  const setImages = useAppStore((s) => s.setImages);
  const selectImage = useAppStore((s) => s.selectImage);
  const setView = useAppStore((s) => s.setView);
  const setProcessing = useAppStore((s) => s.setProcessing);
  const setJobMessage = useAppStore((s) => s.setJobMessage);
  const resetEditor = useEditorStore((s) => s.resetEditor);

  const selectedIds = useBatchStore((s) => s.selectedImageIds);
  const toggleSelect = useBatchStore((s) => s.toggleSelect);
  const clearSelection = useBatchStore((s) => s.clearSelection);
  const setBatchDialogOpen = useBatchStore((s) => s.setDialogOpen);
  const setBatchExportDialogOpen = useBatchExportStore((s) => s.setDialogOpen);

  const [importError, setImportError] = useState<string | null>(null);
  const [thumbCache, setThumbCache] = useState<Record<string, string>>({});
  // Refs mirror the cache and an in-flight set so the worker loop can read
  // them synchronously without re-running on every state update.
  const thumbCacheRef = useRef<Record<string, string>>({});
  const inFlightRef = useRef<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  useEffect(() => {
    if (isTauri()) {
      loadImages();
    }
  }, []);

  // Generate thumbnails for visible images
  useEffect(() => {
    if (!isTauri() || images.length === 0) return;
    void generateThumbnailsBatch(images.slice(0, THUMBNAIL_BATCH_SIZE));
  }, [images]);

  async function generateThumbnailsBatch(batch: ImageAsset[]) {
    const queue = batch.filter(
      (img) =>
        !thumbCacheRef.current[img.id] && !inFlightRef.current.has(img.id)
    );
    if (queue.length === 0) return;

    // Reserve all queued ids up front so concurrent re-renders won't
    // double-enqueue them.
    queue.forEach((img) => inFlightRef.current.add(img.id));

    let index = 0;
    async function worker() {
      while (index < queue.length) {
        const i = index++;
        const img = queue[i];
        if (!img) continue;
        try {
          const result = await generateThumbnail(img.id, img.sourcePath);
          thumbCacheRef.current = {
            ...thumbCacheRef.current,
            [img.id]: result.thumb_path,
          };
          setThumbCache(thumbCacheRef.current);
        } catch (err) {
          console.warn(`Thumbnail failed for ${img.filename}:`, err);
        } finally {
          inFlightRef.current.delete(img.id);
        }
      }
    }
    await Promise.all(Array.from({ length: THUMBNAIL_CONCURRENCY }, worker));
  }

  async function loadImages() {
    try {
      const imgs = await getAllImages();
      setImages(imgs);
    } catch (err) {
      console.error("Failed to load images:", err);
    }
  }

  const handleImport = useCallback(async () => {
    if (!isTauri()) {
      setImportError("Import requires the desktop app (Tauri)");
      return;
    }
    try {
      setImportError(null);
      setProcessing(true);
      setJobMessage("Selecting folder...");
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (!selected) {
        setProcessing(false);
        setJobMessage(null);
        return;
      }
      setJobMessage("Scanning images...");
      const result = await importFolder(selected as string, false);
      setJobMessage(`Imported ${result.images_imported} images`);
      await loadImages();
      setTimeout(() => {
        setProcessing(false);
        setJobMessage(null);
      }, 2000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
      setProcessing(false);
      setJobMessage(null);
    }
  }, [setProcessing, setJobMessage]);

  function openImageInEditor(imageId: string) {
    if (selectMode) {
      toggleSelect(imageId);
      return;
    }
    resetEditor();
    selectImage(imageId);
    // Load versions immediately so the editor (and candidate strip) can
    // resolve version_id → storage path on first render after reopening.
    // The helper guards against the race where the user switches images
    // again before this call resolves.
    void loadVersionsForImage(imageId);
    setView("editor");
  }

  function toggleSelectMode() {
    if (selectMode) {
      clearSelection();
    }
    setSelectMode(!selectMode);
  }

  function selectAllVisible() {
    images.forEach((img) => {
      if (!selectedIds.has(img.id)) toggleSelect(img.id);
    });
  }

  function openBatchDialog() {
    if (selectedIds.size === 0) return;
    setBatchDialogOpen(true);
  }

  function openBatchExportDialog() {
    setBatchExportDialogOpen(true);
  }

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg)" }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <button onClick={handleImport} className="px-btn px-btn-primary">
          {t("library.importFolder")}
        </button>
        <button onClick={loadImages} className="px-btn">
          {t("common.refresh")}
        </button>
        <button
          onClick={toggleSelectMode}
          className={`px-btn ${selectMode ? "px-btn-primary" : ""}`}
        >
          {selectMode ? t("library.cancelSelectMode") : t("library.selectMode")}
        </button>
        {selectMode && (
          <>
            <button onClick={selectAllVisible} className="px-btn">
              {t("library.selectAll")}
            </button>
            <button onClick={clearSelection} className="px-btn">
              {t("common.clear")}
            </button>
            <button
              onClick={openBatchDialog}
              disabled={selectedIds.size === 0}
              className="px-btn px-btn-primary"
            >
              {t("library.batchEditCount", { count: selectedIds.size })}
            </button>
            <button
              onClick={openBatchExportDialog}
              className="px-btn px-btn-primary"
              title={t("library.batchExport")}
            >
              {t("library.batchExport")}
            </button>
          </>
        )}
        {!selectMode && (
          <button
            onClick={openBatchExportDialog}
            className="px-btn"
            title={t("library.batchExport")}
          >
            {t("library.batchExport")}
          </button>
        )}
        <div className="flex-1" />
        {importError && (
          <span className="text-xs" style={{ color: "var(--danger)" }}>
            {importError}
          </span>
        )}
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {t("library.imageCount", { count: images.length })}
        </span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {images.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t("library.empty")}
              </p>
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--muted-2)" }}
              >
                {t("library.emptyHint")}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {images.map((img) => (
              <ThumbnailCard
                key={img.id}
                image={img}
                thumbPath={thumbCache[img.id]}
                selectMode={selectMode}
                isSelected={selectedIds.has(img.id)}
                onClick={() => openImageInEditor(img.id)}
              />
            ))}
          </div>
        )}
      </div>

      <BatchDialog />
      <BatchExportDialog />
    </div>
  );
}

function ThumbnailCard({
  image,
  thumbPath,
  selectMode,
  isSelected,
  onClick,
}: {
  image: ImageAsset;
  thumbPath?: string;
  selectMode: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!thumbPath || !isTauri()) return;
    import("@tauri-apps/api/core").then(({ convertFileSrc }) => {
      setThumbSrc(convertFileSrc(thumbPath));
    });
  }, [thumbPath]);

  return (
    <button
      onClick={onClick}
      className="group relative aspect-square overflow-hidden transition-all hover:shadow-lg"
      style={{
        background: "var(--surface)",
        border: isSelected
          ? "2px solid var(--accent)"
          : "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: isSelected ? "0 0 0 2px var(--accent-soft)" : undefined,
      }}
    >
      {thumbSrc ? (
        <img
          src={thumbSrc}
          alt={image.filename}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className="flex h-full items-center justify-center"
          style={{ background: "var(--bg)", color: "var(--muted-2)" }}
        >
          <span className="text-3xl">🖼️</span>
        </div>
      )}

      {/* Selection checkbox */}
      {selectMode && (
        <div
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded border"
          style={
            isSelected
              ? {
                  background: "var(--accent)",
                  borderColor: "var(--accent)",
                  color: "oklch(99% 0 0)",
                }
              : {
                  background: "rgb(255 255 255 / 80%)",
                  borderColor: "var(--border-strong)",
                  color: "transparent",
                }
          }
        >
          {isSelected ? "✓" : ""}
        </div>
      )}

      <div
        className="absolute inset-x-0 bottom-0 p-2"
        style={{
          background:
            "linear-gradient(180deg, rgb(0 0 0 / 0%) 0%, rgb(0 0 0 / 65%) 100%)",
          color: "oklch(99% 0 0)",
        }}
      >
        <p
          className="truncate text-[10px]"
          style={{ color: "rgb(255 255 255 / 90%)" }}
        >
          {image.filename}
        </p>
        <p className="text-[9px]" style={{ color: "rgb(255 255 255 / 65%)" }}>
          {image.width}×{image.height} · {formatFileSize(image.fileSizeBytes)}
        </p>
      </div>
    </button>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
