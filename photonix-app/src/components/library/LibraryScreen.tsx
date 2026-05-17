import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";
import { useBatchStore } from "@/stores/batchStore";
import { importFolder, getAllImages, generateThumbnail } from "@/services/tauri/images";
import { isTauri } from "@/services/tauri/invoke";
import { BatchDialog } from "./BatchDialog";
import type { ImageAsset } from "@/types";

const THUMBNAIL_BATCH_SIZE = 50;
const THUMBNAIL_CONCURRENCY = 2;

export function LibraryScreen() {
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

  const [importError, setImportError] = useState<string | null>(null);
  const [thumbCache, setThumbCache] = useState<Record<string, string>>({});
  const [selectMode, setSelectMode] = useState(false);

  useEffect(() => {
    if (isTauri()) {
      loadImages();
    }
  }, []);

  // Generate thumbnails for visible images
  useEffect(() => {
    if (!isTauri() || images.length === 0) return;
    generateThumbnailsBatch(images.slice(0, THUMBNAIL_BATCH_SIZE));
  }, [images]);

  async function generateThumbnailsBatch(batch: ImageAsset[]) {
    const queue = batch.filter((img) => !thumbCache[img.id]);
    if (queue.length === 0) return;
    let index = 0;
    async function worker() {
      while (index < queue.length) {
        const i = index++;
        const img = queue[i];
        if (!img) continue;
        try {
          const result = await generateThumbnail(img.id, img.sourcePath);
          setThumbCache((prev) => ({ ...prev, [img.id]: result.thumb_path }));
        } catch (err) {
          console.warn(`Thumbnail failed for ${img.filename}:`, err);
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
    useAppStore.getState().setCurrentVersions([]);
    useAppStore.getState().setActiveVersion(null);
    selectImage(imageId);
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

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-2">
        <button
          onClick={handleImport}
          className="rounded bg-neutral-700 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-600 transition-colors"
        >
          Import Folder
        </button>
        <button
          onClick={loadImages}
          className="rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-400 hover:bg-neutral-700 transition-colors"
        >
          Refresh
        </button>
        <button
          onClick={toggleSelectMode}
          className={`rounded px-3 py-1 text-xs transition-colors ${
            selectMode
              ? "bg-blue-600 text-white"
              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
          }`}
        >
          {selectMode ? "Cancel Select" : "Select"}
        </button>
        {selectMode && (
          <>
            <button
              onClick={selectAllVisible}
              className="rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-400 hover:bg-neutral-700 transition-colors"
            >
              Select All
            </button>
            <button
              onClick={clearSelection}
              className="rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-400 hover:bg-neutral-700 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={openBatchDialog}
              disabled={selectedIds.size === 0}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500 transition-colors disabled:opacity-40"
            >
              Batch Edit ({selectedIds.size})
            </button>
          </>
        )}
        <div className="flex-1" />
        {importError && <span className="text-xs text-red-400">{importError}</span>}
        <span className="text-xs text-neutral-500">{images.length} images</span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {images.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-neutral-400">No images imported yet</p>
              <p className="mt-1 text-xs text-neutral-600">
                Click "Import Folder" to get started
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
      className={`group relative aspect-square overflow-hidden rounded-lg border transition-all hover:shadow-lg ${
        isSelected
          ? "border-blue-500 ring-2 ring-blue-500"
          : "border-neutral-800 hover:border-neutral-600"
      }`}
    >
      {thumbSrc ? (
        <img
          src={thumbSrc}
          alt={image.filename}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-neutral-900 text-neutral-600">
          <span className="text-3xl">🖼️</span>
        </div>
      )}

      {/* Selection checkbox */}
      {selectMode && (
        <div
          className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded border ${
            isSelected
              ? "border-blue-500 bg-blue-600 text-white"
              : "border-neutral-500 bg-black/40 text-transparent"
          }`}
        >
          {isSelected ? "✓" : ""}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <p className="truncate text-[10px] text-neutral-300">{image.filename}</p>
        <p className="text-[9px] text-neutral-500">
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
