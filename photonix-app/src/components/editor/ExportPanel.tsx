import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useStyleStore } from "@/stores/styleStore";
import { isTauri } from "@/services/tauri/invoke";
import { invoke } from "@/services/tauri/invoke";
import { toast } from "@/components/ui/Toast";
import { useTranslation } from "@/i18n";
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
  const { t } = useTranslation();
  const defaultPreset = useSettingsStore((s) => s.defaultExportPreset);
  const [presetId, setPresetId] = useState<ExportPresetId>(defaultPreset);
  const [exporting, setExporting] = useState(false);

  const [customFormat, setCustomFormat] = useState<"jpeg" | "png">("jpeg");
  const [customQuality, setCustomQuality] = useState(90);
  const [customMaxEdge, setCustomMaxEdge] = useState<number | null>(null);

  const [borderId, setBorderId] = useState<BorderTemplateId>("none");
  const [watermark, setWatermark] = useState<WatermarkTemplate>(DEFAULT_WATERMARK);
  const [filenameTemplate, setFilenameTemplate] = useState<string>(DEFAULT_FILENAME_TEMPLATE);

  const selectedImageId = useAppStore((s) => s.selectedImageId);
  const images = useAppStore((s) => s.images);
  const versions = useAppStore((s) => s.currentVersions);
  const activeVersionId = useAppStore((s) => s.activeVersionId);
  const selectedImage = images.find((img) => img.id === selectedImageId);
  const selectedStyle = useStyleStore((s) => s.selectedStyle());

  const activeVersion = versions.find((v) => v.id === activeVersionId);
  const currentVersion = versions.find((v) => v.isCurrent);
  const exportSource = activeVersion?.storagePath ?? currentVersion?.storagePath ?? selectedImage?.sourcePath;
  const sourceVersionKind = activeVersion?.versionKind ?? currentVersion?.versionKind ?? "original";

  const preset = EXPORT_PRESETS.find((p) => p.id === presetId)!;
  const isCustom = presetId === "custom";

  useEffect(() => { setPresetId(defaultPreset); }, [defaultPreset]);

  function effectiveFormat(): "jpeg" | "png" { return isCustom ? customFormat : preset.format; }
  function effectiveQuality(): number { return isCustom ? customQuality : preset.quality; }
  function effectiveMaxEdge(): number | null { return isCustom ? customMaxEdge : preset.longEdge; }

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
  }, [selectedImage, filenameTemplate, selectedStyle?.name, presetId, sourceVersionKind, customFormat, isCustom]);

  async function handleExport() {
    if (!selectedImage || !exportSource) return;
    if (!isTauri()) { toast(t("errors.desktopOnly"), "error"); return; }

    setExporting(true);
    try {
      const fmt = effectiveFormat();
      const quality = effectiveQuality();
      const maxEdge = effectiveMaxEdge();

      const { save } = await import("@tauri-apps/plugin-dialog");
      const savePath = await save({
        defaultPath: suggestedFilename,
        filters: [{ name: fmt === "jpeg" ? "JPEG" : "PNG", extensions: fmt === "jpeg" ? ["jpg", "jpeg"] : ["png"] }],
      });
      if (!savePath) { setExporting(false); return; }

      const borderMeta = BORDER_TEMPLATES.find((b) => b.id === borderId);
      const borderConfig = borderMeta && borderId !== "none"
        ? { thickness: borderMeta.thickness, color: borderMeta.color, inner_padding: borderMeta.innerPadding ?? null, letterbox: borderMeta.letterbox ?? false, forced_aspect: borderMeta.forcedAspect ?? null }
        : null;
      const watermarkConfig = watermark.enabled && watermark.text.trim()
        ? { text: watermark.text, position: watermark.position, font_size: watermark.fontSize, color: watermark.color, opacity: watermark.opacity, margin: watermark.margin }
        : null;

      await invoke<string>("export_image", { sourcePath: exportSource, outputPath: savePath, format: fmt, quality, maxLongEdge: maxEdge, border: borderConfig, watermark: watermarkConfig });
      toast(t("generate.preview.exportSuccess", { path: savePath }), "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      toast(t("generate.preview.exportFailed", { error: msg }), "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px]" style={{ color: "var(--muted)" }}>{t("export.introHelp")}</p>

      {exportSource && (
        <div className="rounded p-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <p className="text-[10px]" style={{ color: "var(--muted)" }}>
            {t("export.sourceInfoFmt", {
              label: activeVersion ? t("editor.canvasLabels.versionFmt", { kind: activeVersion.versionKind }) : t("editor.canvasLabels.original"),
            })}
          </p>
        </div>
      )}

      {/* Preset selection */}
      <div>
        <label className="mb-1 block text-[11px]" style={{ color: "var(--muted)" }}>{t("export.presetLabel")}</label>
        <div className="flex flex-col gap-1">
          {EXPORT_PRESETS.map((p) => (
            <PresetButton key={p.id} preset={p} selected={presetId === p.id} onClick={() => setPresetId(p.id)} />
          ))}
        </div>
      </div>

      {/* Custom controls */}
      {isCustom && (
        <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--muted)" }}>{t("export.formatLabel")}</label>
            <div className="flex gap-1">
              <button onClick={() => setCustomFormat("jpeg")} className={`px-btn flex-1 ${customFormat === "jpeg" ? "px-btn-primary" : ""}`}>JPEG</button>
              <button onClick={() => setCustomFormat("png")} className={`px-btn flex-1 ${customFormat === "png" ? "px-btn-primary" : ""}`}>PNG</button>
            </div>
          </div>
          {customFormat === "jpeg" && (
            <div className="mt-3">
              <label className="mb-1 flex items-center justify-between text-[11px]" style={{ color: "var(--muted)" }}>
                <span>{t("export.qualityLabel")}</span><span>{customQuality}%</span>
              </label>
              <input type="range" min={10} max={100} value={customQuality} onChange={(e) => setCustomQuality(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--accent)" }} />
            </div>
          )}
          <div className="mt-3">
            <label className="mb-1 block text-[11px]" style={{ color: "var(--muted)" }}>{t("export.longEdgeLabel")}</label>
            <div className="flex gap-1">
              {[null, 2560, 4096, 5120].map((v) => (
                <button key={String(v)} onClick={() => setCustomMaxEdge(v)} className={`px-btn flex-1 ${customMaxEdge === v ? "px-btn-primary" : ""}`} style={{ fontSize: 10 }}>
                  {v ? `${v}px` : t("export.longEdgeOriginal")}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
        <BorderPanel selected={borderId} onChange={setBorderId} />
      </div>
      <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
        <WatermarkPanel template={watermark} onChange={setWatermark} />
      </div>

      <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
        <label className="mb-1 block text-[11px]" style={{ color: "var(--muted)" }}>{t("export.filenameTemplateLabel")}</label>
        <input value={filenameTemplate} onChange={(e) => setFilenameTemplate(e.target.value)} className="px-input" />
        <p className="mt-1 truncate text-[10px]" style={{ color: "var(--muted)" }} title={suggestedFilename}>→ {suggestedFilename || "—"}</p>
        <p className="mt-1 text-[9px]" style={{ color: "var(--muted-2)" }}>{t("export.filenameTokensHint")}</p>
      </div>

      <button onClick={handleExport} disabled={exporting || !exportSource} className="px-btn px-btn-primary mt-2 w-full" style={{ padding: "10px 12px" }}>
        {exporting ? t("export.exporting") : t("export.exportButton")}
      </button>
    </div>
  );
}

function PresetButton({ preset, selected, onClick }: { preset: ExportPresetMeta; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-btn text-left"
      style={{
        display: "block",
        width: "100%",
        ...(selected ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent-strong)" } : {}),
      }}
    >
      <div className="font-medium" style={{ fontSize: 12 }}>{preset.label}</div>
      <div className="text-[10px]" style={{ color: selected ? "var(--accent)" : "var(--muted)" }}>{preset.description}</div>
    </button>
  );
}
