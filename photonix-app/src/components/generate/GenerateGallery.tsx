import { useEffect, useState } from "react";
import { useGenerateStore } from "@/stores/generateStore";
import { isTauri } from "@/services/tauri/invoke";
import { deleteGeneratedImage } from "@/services/tauri/generate";
import type { GeneratedImage } from "@/types";

export function GenerateGallery() {
  const images = useGenerateStore((s) => s.images);
  const selectedId = useGenerateStore((s) => s.selectedId);
  const selectImage = useGenerateStore((s) => s.selectImage);
  const isGenerating = useGenerateStore((s) => s.isGenerating);
  const removeImage = useGenerateStore((s) => s.removeImage);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteGeneratedImage(id);
      removeImage(id);
    } catch (err) {
      console.error("Failed to delete generation:", err);
    }
  }

  if (images.length === 0 && !isGenerating) {
    return (
      <div className="flex h-full items-center justify-center border-t border-neutral-800 bg-neutral-900/40">
        <p className="text-xs text-neutral-600">
          Generated images will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden border-t border-neutral-800 bg-neutral-900/40 px-3 py-3">
      <div className="flex h-full gap-2">
        {isGenerating && (
          <div className="aspect-square h-full shrink-0 animate-pulse rounded-lg border border-neutral-800 bg-neutral-800/60 flex items-center justify-center">
            <span className="text-[10px] text-neutral-500">Generating...</span>
          </div>
        )}
        {images.map((img) => (
          <GalleryThumb
            key={img.id}
            image={img}
            isSelected={img.id === selectedId}
            onClick={() => selectImage(img.id)}
            onDelete={(e) => handleDelete(img.id, e)}
          />
        ))}
      </div>
    </div>
  );
}

function GalleryThumb({
  image,
  isSelected,
  onClick,
  onDelete,
}: {
  image: GeneratedImage;
  isSelected: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/api/core").then(({ convertFileSrc }) => {
      setSrc(convertFileSrc(image.storagePath));
    });
  }, [image.storagePath]);

  return (
    <button
      onClick={onClick}
      className={`group relative aspect-square h-full shrink-0 overflow-hidden rounded-lg border transition-all ${
        isSelected
          ? "border-blue-500 ring-1 ring-blue-500"
          : "border-neutral-800 hover:border-neutral-600"
      }`}
      title={image.prompt}
    >
      {src ? (
        <img
          src={src}
          alt={image.prompt.slice(0, 40)}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-800 text-neutral-600">
          <span className="text-2xl">✨</span>
        </div>
      )}

      {/* Delete button */}
      <span
        role="button"
        onClick={onDelete}
        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded bg-black/70 text-[10px] text-neutral-300 hover:bg-red-700 hover:text-white group-hover:flex"
        aria-label="Delete generation"
      >
        ×
      </span>
    </button>
  );
}
