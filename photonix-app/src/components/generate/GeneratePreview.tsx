import { useEffect, useState } from "react";
import { isTauri } from "@/services/tauri/invoke";
import { invoke } from "@/services/tauri/invoke";
import { toast } from "@/components/ui/Toast";
import { useTranslation } from "@/i18n";
import type { GeneratedImage } from "@/types";

interface Props {
  image: GeneratedImage | null;
}

export function GeneratePreview({ image }: Props) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!image || !isTauri()) {
      setSrc(null);
      return;
    }
    import("@tauri-apps/api/core").then(({ convertFileSrc }) => {
      setSrc(convertFileSrc(image.storagePath));
    });
  }, [image?.storagePath]);

  async function handleExport() {
    if (!image || !isTauri()) return;
    setExporting(true);
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const defaultName = `generated_${image.id.slice(0, 8)}.png`;
      const savePath = await save({
        defaultPath: defaultName,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!savePath) {
        setExporting(false);
        return;
      }
      await invoke<string>("export_image", {
        sourcePath: image.storagePath,
        outputPath: savePath,
        format: "png",
        quality: 100,
        maxLongEdge: null,
      });
      toast(t("generate.preview.exportSuccess", { path: savePath }), "success");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : t("errors.generic");
      toast(t("generate.preview.exportFailed", { error: msg }), "error");
    } finally {
      setExporting(false);
    }
  }

  if (!image) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-neutral-400">{t("generate.preview.noImage")}</p>
          <p className="mt-1 text-xs text-neutral-600">
            {t("generate.preview.noImageHint")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1.5">
        <span className="text-xs text-neutral-300 truncate flex-1">
          {image.prompt}
        </span>
        <span className="text-[10px] text-neutral-600">
          {image.width}×{image.height} · {image.size} · {image.quality}
        </span>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-500 transition-colors disabled:opacity-50"
        >
          {exporting ? t("generate.preview.exporting") : t("generate.preview.exportPng")}
        </button>
      </div>

      {/* Image */}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
        {src ? (
          <img
            src={src}
            alt={image.prompt}
            className="max-h-full max-w-full object-contain rounded"
          />
        ) : (
          <div className="text-neutral-600 text-sm">{t("generate.preview.loading")}</div>
        )}
      </div>
    </div>
  );
}
