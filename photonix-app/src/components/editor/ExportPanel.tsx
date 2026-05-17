import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useStyleStore } from "@/stores/styleStore";
import { isTauri } from "@/services/tauri/invoke";
import { invoke } from "@/services/tauri/invoke";
import { toast } from "@/components/ui/Toast";
import { BorderPanel } from "@/components/export/BorderPanel";
import { WatermarkPanel } from "@/components/export/WatermarkPanel";
import { applyFilenameTemplate } from "@/services/export/filenameTemplate";
import {
  BORDER_TEMPLATES,
  DEFAULT_FILENAME_TEMPLATE,
  DEFAULT_WATERMARK,
  EXPORT_PRESETS,
  type BorderTemplateId,
  type ExportPresetId,
  type ExportPresetMeta,
  type WatermarkTemplate,
} from "@/types";

export function ExportPanel() {
  const defaultPreset = useSettingsStore((s) => s.defaultExportPreset);
  const [presetId, setPresetId] = useState<ExportPresetId>(defaultPreset);
  const [exporting, setExporting] = useState(false);

  // Custom-mode overrides
  const [customFormat, setCustomFormat] = useState<"jpeg" | "png">("jpeg");
  const [customQuality, setCustomQuality] = useState(90);
  const [customMaxEdge, setCustomMaxEdge] = useState<number | null>(null);

  // MVP3: border + watermark + filename template
  const [borderId, setBorderId] = useState<BorderTemplateId>("none");
  const [watermark, setWatermark] = useState<WatermarkTemplate>(DEFAULT_WATERMARK);
  const [filenameTemplate, setFilenameTemplate] = useState<string>(
    DEFAULT_FILENAME_TEMPLATE
  );

  const selectedImageId = useAppStore((s) => s.selectedImageId);
  const images = useAppStore((s) => s.images);
  const versions = useAppStore((s) => s.currentVersions);
  const activeVersionId = useAppStore((s) => s.activeVersionId);
  const selectedImage = images.find((img) => img.id === selectedImageId);

  const selectedStyle = useStyleStore((s) => s.selectedStyle());

  const activeVersion = versions.find((v) => v.id === activeVersionId);
  const currentVersion = versions.find((v) => v.isCurrent);
  const exportSource =
    activeVersion?.storagePath ?? currentVersion?.storagePath ?? selectedImage?.sourcePath;
  const sourceVersionKind = activeVersion?.versionKind ?? currentVersion?.versionKind ?? "original";

  const preset = EXPORT_PRESETS.find((p) => p.id === presetId)!;
  const isCustom = presetId === "custom";

  // Sync default preset from settings when it changes
  useEffect(() => {
    setPresetId(defaultPreset);
  }, [defaultPreset]);

  function effectiveFormat(): "jpeg" | "png" {
    return isCustom ? customFormat : preset.format;
  }
  function effectiveQuality(): number {
    return isCustom ? customQuality : preset.quality;
  }
  function effectiveMaxEdge(): number | null {
    return isCustom ? customMaxEdge : preset.longEdge;
  }

  // Build the suggested filename based on the current template + context
  const suggestedFilename = useMemo(() => {
    if (!selectedImage) return "";
    const fmt = effectiveFormat();
    const baseName = selectedImage.filename.replace(/\.[^.]+$/, "");
    return applyFilenameTemplate(filenameTemplate, {
      originalName: baseName,
      style: selectedStyle?.name ?? null,
      preset: presetId,
      versionKind: sourceVersionKind,
      index: 1,
      ext: fmt === "jpeg" ? "jpg" : fmt,
    });
  }, [
    selectedImage,
    filenameTemplate,
    selectedStyle?.name,
    presetId,
    sourceVersionKind,
    customFormat,
    isCustom,
  ]);

  async function handleExport() {
    if (!selectedImage || !exportSource) return;

    if (!isTauri()) {
      toast("Export requires the desktop app (Tauri)", "error");
      return;
    }

    setExporting(true);
    try {
      const fmt = effectiveFormat();
      const quality = effectiveQuality();
      const maxEdge = effectiveMaxEdge();

      const { save } = await import("@tauri-apps/plugin-dialog");

      const savePath = await save({
        defaultPath: suggestedFilename,
        filters: [
          {
            name: fmt === "jpeg" ? "JPEG" : "PNG",
            extensions: fmt === "jpeg" ? ["jpg", "jpeg"] : ["png"],
          },
        ],
      });
      if (!savePath) {
        setExporting(false);
        return;
      }

      // Build optional border config
      const borderMeta = BORDER_TEMPLATES.find((b) => b.id === borderId);
      const borderConfig =
        borderMeta && borderId !== "none"
          ? {
              thickness: borderMeta.thickness,
              color: borderMeta.color,
              inner_padding: borderMeta.innerPadding ?? null,
              letterbox: borderMeta.letterbox ?? false,
              forced_aspect: borderMeta.forcedAspect ?? null,
            }
          : null;

      // Build optional watermark config
      const watermarkConfig =
        watermark.enabled && watermark.text.trim()
          ? {
              text: watermark.text,
              position: watermark.position,
              font_size: watermark.fontSize,
              color: watermark.color,
              opacity: watermark.opacity,
              margin: watermark.margin,
            }
          : null;

      await invoke<string>("export_image", {
        sourcePath: exportSource,
        outputPath: savePath,
        format: fmt,
        quality,
        maxLongEdge: maxEdge,
        border: borderConfig,
        watermark: watermarkConfig,
      });

      toast(`Exported to: ${savePath}`, "success");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : JSON.stringify(err);
      toast(`Export failed: ${msg}`, "error");
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] text-neutral-500">
        Export the current version. Original files are never modified.
      </p>

      {/* Source info */}
      {exportSource && (
        <div className="rounded bg-neutral-800/50 p-2">
          <p className="text-[10px] text-neutral-500">
            Exporting:{" "}
            {activeVersion ? `${activeVersion.versionKind} version` : "original image"}
          </p>
        </div>
      )}

      {/* Preset selection */}
      <div>
        <label className="mb-1 block text-[11px] text-neutral-400">Preset</label>
        <div className="flex flex-col gap-1">
          {EXPORT_PRESETS.map((p) => (
            <PresetButton
              key={p.id}
              preset={p}
              selected={presetId === p.id}
              onClick={() => setPresetId(p.id)}
            />
          ))}
        </div>
      </div>

      {/* Custom controls */}
      {isCustom && (
        <div className="border-t border-neutral-800 pt-3">
          <div>
            <label className="mb-1 block text-[11px] text-neutral-400">Format</label>
            <div className="flex gap-1">
              <button
                onClick={() => setCustomFormat("jpeg")}
                className={`flex-1 rounded px-2 py-1 text-xs transition-colors ${
                  customFormat === "jpeg"
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                JPEG
              </button>
              <button
                onClick={() => setCustomFormat("png")}
                className={`flex-1 rounded px-2 py-1 text-xs transition-colors ${
                  customFormat === "png"
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                PNG
              </button>
            </div>
          </div>

          {customFormat === "jpeg" && (
            <div className="mt-3">
              <label className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
                <span>Quality</span>
                <span>{customQuality}%</span>
              </label>
              <input
                type="range"
                min={10}
                max={100}
                value={customQuality}
                onChange={(e) => setCustomQuality(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          )}

          <div className="mt-3">
            <label className="mb-1 block text-[11px] text-neutral-400">
              Long edge (optional resize)
            </label>
            <div className="flex gap-1">
              {[null, 2560, 4096, 5120].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => setCustomMaxEdge(v)}
                  className={`flex-1 rounded px-2 py-1 text-[10px] transition-colors ${
                    customMaxEdge === v
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                  }`}
                >
                  {v ? `${v}px` : "Original"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MVP3: Border */}
      <div className="border-t border-neutral-800 pt-3">
        <BorderPanel selected={borderId} onChange={setBorderId} />
      </div>

      {/* MVP3: Watermark */}
      <div className="border-t border-neutral-800 pt-3">
        <WatermarkPanel template={watermark} onChange={setWatermark} />
      </div>

      {/* MVP3: Filename template */}
      <div className="border-t border-neutral-800 pt-3">
        <label className="mb-1 block text-[11px] text-neutral-400">
          Filename template
        </label>
        <input
          value={filenameTemplate}
          onChange={(e) => setFilenameTemplate(e.target.value)}
          className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
        />
        <p className="mt-1 truncate text-[10px] text-neutral-500" title={suggestedFilename}>
          → {suggestedFilename || "(no image selected)"}
        </p>
        <p className="mt-1 text-[9px] text-neutral-600">
          Tokens: {"{"}original_name{"}"}, {"{"}style{"}"}, {"{"}preset{"}"},{" "}
          {"{"}version_kind{"}"}, {"{"}date{"}"}, {"{"}time{"}"}, {"{"}index{"}"},{" "}
          {"{"}ext{"}"}
        </p>
      </div>

      {/* Export button */}
      <button
        onClick={handleExport}
        disabled={exporting || !exportSource}
        className="mt-2 w-full rounded bg-green-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
      >
        {exporting ? "Exporting..." : "Export"}
      </button>
    </div>
  );
}

function PresetButton({
  preset,
  selected,
  onClick,
}: {
  preset: ExportPresetMeta;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1.5 text-left text-xs transition-colors ${
        selected
          ? "bg-blue-600/30 text-blue-200 ring-1 ring-blue-500/50"
          : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
      }`}
    >
      <div className="font-medium">{preset.label}</div>
      <div className="text-[10px] text-neutral-500">{preset.description}</div>
    </button>
  );
}
