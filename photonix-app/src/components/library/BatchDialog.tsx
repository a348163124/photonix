import { useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useBatchStore } from "@/stores/batchStore";
import { usePresetsStore } from "@/stores/promptPresets";
import { useStyleStore } from "@/stores/styleStore";
import { buildQueueFromSelection, retryItem, runBatch } from "@/services/batchRunner";
import { useTranslation } from "@/i18n";
import type { EditPreset, QualityMode } from "@/types";

export function BatchDialog() {
  const { t } = useTranslation();
  const dialogOpen = useBatchStore((s) => s.dialogOpen);
  const setDialogOpen = useBatchStore((s) => s.setDialogOpen);
  const selectedIds = useBatchStore((s) => s.selectedImageIds);
  const items = useBatchStore((s) => s.items);
  const setItems = useBatchStore((s) => s.setItems);
  const isRunning = useBatchStore((s) => s.isRunning);
  const cancelQueued = useBatchStore((s) => s.cancelQueued);
  const removeItem = useBatchStore((s) => s.removeItem);

  const images = useAppStore((s) => s.images);
  const presets = usePresetsStore((s) => s.presets);

  const styles = useStyleStore((s) => s.styles);
  const selectedStyleId = useStyleStore((s) => s.selectedStyleId);
  const defaultStyleId = useStyleStore((s) => s.defaultStyleId);
  const setSelectedStyleId = useStyleStore((s) => s.setSelectedStyleId);

  const [prompt, setPrompt] = useState("");
  const [presetId, setPresetId] = useState<string | null>(null);
  const [qualityMode, setQualityMode] = useState<QualityMode>("draft");

  if (!dialogOpen) return null;

  const selectedImages = images.filter((img) => selectedIds.has(img.id));
  const succeeded = items.filter((it) => it.status === "succeeded").length;
  const failed = items.filter((it) => it.status === "failed").length;
  const queued = items.filter((it) => it.status === "queued").length;
  const running = items.filter((it) => it.status === "running").length;

  function applyPreset(preset: EditPreset) {
    setPrompt(preset.promptTemplate);
    setPresetId(preset.id);
  }

  function handleStart() {
    if (!prompt.trim() || selectedImages.length === 0) return;
    const queue = buildQueueFromSelection(
      selectedImages,
      prompt,
      presetId,
      qualityMode
    );
    setItems([...items, ...queue]);
    void runBatch();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgb(0 0 0 / 45%)" }}
    >
      <div
        className="flex max-h-[85vh] w-[640px] flex-col"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2
            className="text-sm font-medium"
            style={{ color: "var(--fg)" }}
          >
            {t("batch.edit.title")}
          </h2>
          <button
            onClick={() => setDialogOpen(false)}
            className="rounded"
            style={{
              color: "var(--muted)",
              background: "transparent",
              border: "none",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Prompt */}
          <div>
            <label
              className="mb-1 block text-[11px]"
              style={{ color: "var(--muted)" }}
            >
              {t("batch.edit.promptLabel", {
                count: selectedImages.length,
                plural: selectedImages.length === 1 ? "" : "s",
              })}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setPresetId(null);
              }}
              placeholder={t("batch.edit.promptPlaceholder")}
              rows={4}
              className="px-textarea"
            />
          </div>

          {/* Preset shortcuts */}
          <div className="mt-3">
            <label
              className="mb-1 block text-[11px]"
              style={{ color: "var(--muted)" }}
            >
              {t("batch.edit.pickPreset")}
            </label>
            <div className="grid grid-cols-2 gap-1">
              {presets
                .filter((p) => p.category === "landscape")
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p)}
                    className={`px-btn ${presetId === p.id ? "" : ""}`}
                    style={{
                      justifyContent: "flex-start",
                      textAlign: "left",
                      padding: "6px 10px",
                      fontSize: 11,
                      ...(presetId === p.id
                        ? {
                            background: "var(--accent-soft)",
                            borderColor: "var(--accent)",
                            color: "var(--accent-strong)",
                          }
                        : {}),
                    }}
                  >
                    {p.name}
                  </button>
                ))}
            </div>
          </div>

          {/* MVP3: Style profile selector */}
          <div className="mt-3">
            <label
              className="mb-1 block text-[11px]"
              style={{ color: "var(--muted)" }}
            >
              {t("batch.edit.styleLabel")}
            </label>
            <select
              value={
                selectedStyleId === null
                  ? "__none__"
                  : (selectedStyleId ?? defaultStyleId ?? "__none__")
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__none__") setSelectedStyleId(null);
                else setSelectedStyleId(v);
              }}
              className="px-select"
            >
              <option value="__none__">
                {t("editor.prompt.noStyleOption")}
              </option>
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {defaultStyleId === s.id ? t("editor.prompt.defaultSuffix") : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Quality */}
          <div className="mt-3">
            <label
              className="mb-1 block text-[11px]"
              style={{ color: "var(--muted)" }}
            >
              {t("batch.edit.qualityLabel")}
            </label>
            <div className="flex gap-1">
              {(["draft", "final"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setQualityMode(m)}
                  className={`px-btn flex-1 capitalize ${
                    qualityMode === m ? "px-btn-primary" : ""
                  }`}
                >
                  {m === "draft"
                    ? t("editor.prompt.generateDraft").replace(/^Generate /, "")
                    : t("editor.prompt.final")}
                </button>
              ))}
            </div>
          </div>

          {/* Queue status */}
          {items.length > 0 && (
            <div
              className="mt-4 pt-4"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className="text-[11px]"
                  style={{ color: "var(--muted)" }}
                >
                  {t("batch.edit.queueSummary", {
                    total: items.length,
                    queued,
                    running,
                    succeeded,
                    failed,
                  })}
                </span>
                {queued > 0 && (
                  <button onClick={cancelQueued} className="px-btn" style={{ padding: "2px 8px", fontSize: 10 }}>
                    {t("batch.edit.cancelPending")}
                  </button>
                )}
              </div>
              <div
                className="max-h-60 overflow-y-auto rounded"
                style={{ border: "1px solid var(--border)" }}
              >
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 px-2 py-1 last:border-b-0"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <StatusBadge status={it.status} />
                    <span
                      className="flex-1 truncate text-[10px]"
                      style={{ color: "var(--fg)" }}
                    >
                      {it.imageFilename}
                    </span>
                    {it.error && (
                      <span
                        className="max-w-[180px] truncate text-[9px]"
                        style={{ color: "var(--danger)" }}
                        title={it.error}
                      >
                        {it.error}
                      </span>
                    )}
                    {it.status === "failed" && (
                      <button
                        onClick={() => retryItem(it.id)}
                        className="px-btn"
                        style={{ padding: "2px 6px", fontSize: 9 }}
                      >
                        {t("common.retry")}
                      </button>
                    )}
                    {(it.status === "succeeded" ||
                      it.status === "failed" ||
                      it.status === "canceled") && (
                      <button
                        onClick={() => removeItem(it.id)}
                        className="text-[10px]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--muted-2)",
                          cursor: "pointer",
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 px-4 py-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button onClick={() => setDialogOpen(false)} className="px-btn">
            {t("common.close")}
          </button>
          <button
            onClick={handleStart}
            disabled={!prompt.trim() || selectedImages.length === 0 || isRunning}
            className="px-btn px-btn-primary"
          >
            {isRunning
              ? t("batch.edit.runningButton")
              : t("batch.edit.startCount", { count: selectedImages.length })}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, { bg: string; fg: string; pulse?: boolean }> = {
    queued: { bg: "var(--surface-2)", fg: "var(--muted)" },
    running: { bg: "oklch(95% 0.05 70)", fg: "oklch(40% 0.13 70)", pulse: true },
    succeeded: { bg: "var(--accent-soft)", fg: "var(--accent-strong)" },
    failed: { bg: "oklch(96% 0.04 25)", fg: "var(--danger)" },
    canceled: { bg: "var(--surface-2)", fg: "var(--muted-2)" },
  };
  const p = palette[status] ?? palette.queued!;
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] capitalize ${
        p.pulse ? "animate-pulse" : ""
      }`}
      style={{ background: p.bg, color: p.fg }}
    >
      {status}
    </span>
  );
}
