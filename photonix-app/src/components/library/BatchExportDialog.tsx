import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useBatchStore } from "@/stores/batchStore";
import { useBatchExportStore } from "@/stores/batchExportStore";
import { useStyleStore } from "@/stores/styleStore";
import {
  buildBatchExportQueue,
  runBatchExport,
} from "@/services/batchExportRunner";
import { isTauri } from "@/services/tauri/invoke";
import { applyFilenameTemplate } from "@/services/export/filenameTemplate";
import { BorderPanel } from "@/components/export/BorderPanel";
import { WatermarkPanel } from "@/components/export/WatermarkPanel";
import { toast } from "@/components/ui/Toast";
import { useTranslation } from "@/i18n";
import { EXPORT_PRESETS, type ExportPresetId } from "@/types";

export function BatchExportDialog() {
  const { t } = useTranslation();
  const dialogOpen = useBatchExportStore((s) => s.dialogOpen);
  const setDialogOpen = useBatchExportStore((s) => s.setDialogOpen);

  const selectionMode = useBatchExportStore((s) => s.selectionMode);
  const setSelectionMode = useBatchExportStore((s) => s.setSelectionMode);

  const outputFolder = useBatchExportStore((s) => s.outputFolder);
  const setOutputFolder = useBatchExportStore((s) => s.setOutputFolder);

  const presetId = useBatchExportStore((s) => s.presetId);
  const setPresetId = useBatchExportStore((s) => s.setPresetId);

  const filenameTemplate = useBatchExportStore((s) => s.filenameTemplate);
  const setFilenameTemplate = useBatchExportStore((s) => s.setFilenameTemplate);

  const borderId = useBatchExportStore((s) => s.borderId);
  const setBorderId = useBatchExportStore((s) => s.setBorderId);

  const watermark = useBatchExportStore((s) => s.watermark);
  const setWatermark = useBatchExportStore((s) => s.setWatermark);

  const overwritePolicy = useBatchExportStore((s) => s.overwritePolicy);
  const setOverwritePolicy = useBatchExportStore((s) => s.setOverwritePolicy);

  const items = useBatchExportStore((s) => s.items);
  const setItems = useBatchExportStore((s) => s.setItems);
  const clearItems = useBatchExportStore((s) => s.clearItems);
  const isRunning = useBatchExportStore((s) => s.isRunning);

  const selectedIds = useBatchStore((s) => s.selectedImageIds);
  const images = useAppStore((s) => s.images);
  const selectedStyle = useStyleStore((s) => s.selectedStyle());

  const [previewing, setPreviewing] = useState(false);

  // Refresh queue preview whenever the dialog opens or selection mode changes
  useEffect(() => {
    if (!dialogOpen) return;
    void refreshPreview();
  }, [dialogOpen, selectionMode]);

  async function refreshPreview() {
    setPreviewing(true);
    try {
      const queue = await buildBatchExportQueue();
      setItems(queue);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setPreviewing(false);
    }
  }

  async function pickOutputFolder() {
    if (!isTauri()) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folder = await open({ directory: true, multiple: false });
    if (typeof folder === "string") setOutputFolder(folder);
  }

  function handleStart() {
    if (items.length === 0) {
      toast("Nothing to export. Try a different selection mode.", "info");
      return;
    }
    if (!outputFolder) {
      toast("Pick an output folder first.", "info");
      return;
    }
    void runBatchExport();
  }

  function handleClose() {
    if (isRunning) return;
    setDialogOpen(false);
  }

  if (!dialogOpen) return null;

  const preset = EXPORT_PRESETS.find((p) => p.id === presetId)!;
  const ext = preset.format === "jpeg" ? "jpg" : preset.format;

  // Show the first three filename previews so the user can sanity-check tokens
  const previewFilenames = items.slice(0, 3).map((it, i) => {
    const baseName = it.imageFilename.replace(/\.[^.]+$/, "");
    return applyFilenameTemplate(filenameTemplate, {
      originalName: baseName,
      style: selectedStyle?.name ?? null,
      preset: presetId,
      versionKind: it.sourceVersionKind,
      index: i + 1,
      ext,
    });
  });

  const succeeded = items.filter((it) => it.status === "succeeded").length;
  const failed = items.filter((it) => it.status === "failed").length;
  const running = items.filter((it) => it.status === "running").length;
  const queued = items.filter((it) => it.status === "queued").length;
  const skipped = items.filter((it) => it.status === "skipped").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="flex max-h-[90vh] w-[760px] flex-col rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
          <h2 className="text-sm font-medium text-neutral-200">{t("batch.export.title")}</h2>
          <button
            onClick={handleClose}
            disabled={isRunning}
            className="rounded text-neutral-500 hover:text-neutral-200 disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-4">
            {/* ── LEFT column: source + output ──────────────── */}
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-neutral-400">
                  {t("batch.export.sourceSelectionLabel")}
                </label>
                <div className="flex flex-col gap-1">
                  <SelectionRadio
                    label={t("batch.export.sourceCurrentVersions", {
                      count: selectedIds.size > 0 ? selectedIds.size : images.length,
                    })}
                    value="current_versions"
                    current={selectionMode}
                    onChange={setSelectionMode}
                  />
                  <SelectionRadio
                    label={t("batch.export.sourceFavorites")}
                    value="favorited_candidates"
                    current={selectionMode}
                    onChange={setSelectionMode}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-neutral-400">
                  {t("batch.export.outputFolderLabel")}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={pickOutputFolder}
                    className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
                  >
                    {outputFolder ? t("batch.export.changeFolder") : t("batch.export.pickFolder")}
                  </button>
                  <span className="flex-1 truncate text-[10px] text-neutral-500" title={outputFolder ?? ""}>
                    {outputFolder ?? t("batch.export.noneChosen")}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-neutral-400">
                  {t("batch.export.presetLabel")}
                </label>
                <select
                  value={presetId}
                  onChange={(e) => setPresetId(e.target.value as ExportPresetId)}
                  className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
                >
                  {EXPORT_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} — {p.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-neutral-400">
                  {t("batch.export.filenameLabel")}
                </label>
                <input
                  value={filenameTemplate}
                  onChange={(e) => setFilenameTemplate(e.target.value)}
                  className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
                />
                {previewFilenames.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {previewFilenames.map((f, i) => (
                      <li key={i} className="truncate text-[10px] text-neutral-500" title={f}>
                        → {f}
                      </li>
                    ))}
                    {items.length > previewFilenames.length && (
                      <li className="text-[10px] text-neutral-600">
                        {t("batch.export.moreItems", {
                          count: items.length - previewFilenames.length,
                        })}
                      </li>
                    )}
                  </ul>
                )}
                <p className="mt-1 text-[9px] text-neutral-600">
                  {t("batch.export.filenameTokensHint")}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-neutral-400">
                  {t("batch.export.onConflictLabel")}
                </label>
                <div className="flex gap-1">
                  {(["rename", "overwrite", "skip"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setOverwritePolicy(p)}
                      className={`flex-1 rounded px-2 py-1 text-[10px] capitalize transition-colors ${
                        overwritePolicy === p
                          ? "bg-blue-600 text-white"
                          : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                      }`}
                    >
                      {p === "rename"
                        ? t("batch.export.policyRename")
                        : p === "overwrite"
                          ? t("batch.export.policyOverwrite")
                          : t("batch.export.policySkip")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── RIGHT column: border + watermark ───────── */}
            <div className="flex flex-col gap-3">
              <BorderPanel selected={borderId} onChange={setBorderId} />
              <WatermarkPanel template={watermark} onChange={setWatermark} />
            </div>
          </div>

          {/* Queue preview */}
          <div className="mt-4 border-t border-neutral-800 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] text-neutral-400">
                {t("batch.export.queueSummary", {
                  total: items.length,
                  queued,
                  running,
                  succeeded,
                  failed,
                  skipped,
                })}
              </span>
              <button
                onClick={refreshPreview}
                disabled={previewing || isRunning}
                className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-700 disabled:opacity-40"
              >
                {previewing ? t("batch.export.refreshing") : t("batch.export.refresh")}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto rounded border border-neutral-800">
              {items.length === 0 && (
                <p className="px-3 py-4 text-center text-[10px] text-neutral-600">
                  {selectionMode === "favorited_candidates"
                    ? t("batch.export.emptyFavorites")
                    : t("batch.export.emptyImages")}
                </p>
              )}
              {items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center gap-2 border-b border-neutral-800 px-2 py-1 last:border-b-0"
                >
                  <StatusBadge status={it.status} />
                  <span className="flex-1 truncate text-[10px] text-neutral-300" title={it.imageFilename}>
                    {it.imageFilename}
                  </span>
                  <span className="shrink-0 truncate text-[9px] text-neutral-500" style={{ maxWidth: 120 }}>
                    {it.selectionLabel}
                  </span>
                  {it.error && (
                    <span
                      className="shrink-0 truncate text-[9px] text-red-400"
                      style={{ maxWidth: 180 }}
                      title={it.error}
                    >
                      {it.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-4 py-3">
          <button
            onClick={() => clearItems()}
            disabled={isRunning || items.length === 0}
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700 disabled:opacity-40"
          >
            {t("batch.export.clearQueue")}
          </button>
          <button
            onClick={handleClose}
            disabled={isRunning}
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700 disabled:opacity-40"
          >
            {t("common.close")}
          </button>
          <button
            onClick={handleStart}
            disabled={items.length === 0 || isRunning || !outputFolder}
            className="rounded bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-40"
          >
            {isRunning
              ? t("batch.export.exportingButton")
              : t("batch.export.exportCount", { count: items.length })}
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectionRadio<T extends string>({
  label,
  value,
  current,
  onChange,
}: {
  label: string;
  value: T;
  current: T;
  onChange: (v: T) => void;
}) {
  return (
    <button
      onClick={() => onChange(value)}
      className={`flex items-center gap-2 rounded px-2 py-1 text-left text-[11px] transition-colors ${
        current === value
          ? "bg-blue-600/30 text-blue-200 ring-1 ring-blue-500/50"
          : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
      }`}
    >
      <span
        className={`h-3 w-3 rounded-full border ${
          current === value ? "border-blue-300 bg-blue-400" : "border-neutral-500"
        }`}
      />
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: "bg-neutral-700 text-neutral-300",
    running: "bg-amber-700 text-amber-200 animate-pulse",
    succeeded: "bg-green-700 text-green-200",
    failed: "bg-red-700 text-red-200",
    skipped: "bg-neutral-600 text-neutral-400",
  };
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] capitalize ${
        styles[status] ?? "bg-neutral-700"
      }`}
    >
      {status}
    </span>
  );
}
