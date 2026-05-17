import { useEffect, useState } from "react";
import { useGenerateStore } from "@/stores/generateStore";
import { isTauri } from "@/services/tauri/invoke";
import { deleteGeneratedImage } from "@/services/tauri/generate";
import { useTranslation } from "@/i18n";
import type { GeneratedImage } from "@/types";

export function GenerateGallery() {
  const { t } = useTranslation();
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
      <div
        className="flex h-full items-center justify-center"
        style={{
          background: "var(--surface-2)",
          borderTop: "1px solid var(--border)",
          color: "var(--muted-2)",
          fontSize: 12,
        }}
      >
        <p>{t("generate.galleryEmptyHint")}</p>
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-x-auto overflow-y-hidden px-3 py-3"
      style={{
        background: "var(--surface-2)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div className="flex h-full gap-2">
        {isGenerating && (
          <div
            className="flex aspect-square h-full shrink-0 animate-pulse items-center justify-center"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              color: "var(--muted-2)",
              fontSize: 11,
            }}
          >
            <span>{t("generate.galleryGenerating")}</span>
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
      className="group relative aspect-square h-full shrink-0 overflow-hidden transition-all"
      style={{
        background: "var(--surface)",
        border: isSelected
          ? "2px solid var(--accent)"
          : "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: isSelected ? "0 0 0 2px var(--accent-soft)" : undefined,
      }}
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
        <div
          className="flex h-full w-full items-center justify-center"
          style={{ background: "var(--surface-2)", color: "var(--muted-2)" }}
        >
          <span className="text-2xl">✨</span>
        </div>
      )}

      <span
        role="button"
        onClick={onDelete}
        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded text-[10px] group-hover:flex"
        style={{
          background: "rgb(255 255 255 / 92%)",
          color: "var(--muted)",
          border: "1px solid var(--border)",
        }}
        aria-label="Delete generation"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--danger)";
          e.currentTarget.style.color = "oklch(99% 0 0)";
          e.currentTarget.style.borderColor = "var(--danger)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgb(255 255 255 / 92%)";
          e.currentTarget.style.color = "var(--muted)";
          e.currentTarget.style.borderColor = "var(--border)";
        }}
      >
        ×
      </span>
    </button>
  );
}
