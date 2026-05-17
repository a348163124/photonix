import { useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useBatchStore } from "@/stores/batchStore";
import { usePresetsStore } from "@/stores/promptPresets";
import { useStyleStore } from "@/stores/styleStore";
import { buildQueueFromSelection, retryItem, runBatch } from "@/services/batchRunner";
import type { EditPreset, QualityMode } from "@/types";

export function BatchDialog() {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="flex max-h-[85vh] w-[640px] flex-col rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
          <h2 className="text-sm font-medium text-neutral-200">Batch Edit</h2>
          <button
            onClick={() => setDialogOpen(false)}
            className="rounded text-neutral-500 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Prompt */}
          <div>
            <label className="mb-1 block text-[11px] text-neutral-400">
              Prompt for {selectedImages.length} image
              {selectedImages.length === 1 ? "" : "s"}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setPresetId(null);
              }}
              placeholder="Describe the edit to apply to every selected image..."
              rows={4}
              className="w-full resize-none rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600"
            />
          </div>

          {/* Preset shortcuts */}
          <div className="mt-3">
            <label className="mb-1 block text-[11px] text-neutral-400">
              Or pick a landscape preset
            </label>
            <div className="grid grid-cols-2 gap-1">
              {presets
                .filter((p) => p.category === "landscape")
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p)}
                    className={`rounded px-2 py-1 text-left text-[10px] transition-colors ${
                      presetId === p.id
                        ? "bg-blue-600/30 text-blue-200 ring-1 ring-blue-500/50"
                        : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
            </div>
          </div>

          {/* MVP3: Style profile selector */}
          <div className="mt-3">
            <label className="mb-1 block text-[11px] text-neutral-400">
              Style profile (applied to every image)
            </label>
            <select
              value={selectedStyleId ?? defaultStyleId ?? ""}
              onChange={(e) => setSelectedStyleId(e.target.value || null)}
              className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
            >
              <option value="">No style (raw prompt)</option>
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {defaultStyleId === s.id ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Quality */}
          <div className="mt-3">
            <label className="mb-1 block text-[11px] text-neutral-400">Quality</label>
            <div className="flex gap-1">
              {(["draft", "final"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setQualityMode(m)}
                  className={`flex-1 rounded px-2 py-1 text-xs capitalize transition-colors ${
                    qualityMode === m
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Queue status */}
          {items.length > 0 && (
            <div className="mt-4 border-t border-neutral-800 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] text-neutral-400">
                  Queue: {items.length} total · {queued} queued · {running} running ·{" "}
                  {succeeded} succeeded · {failed} failed
                </span>
                {queued > 0 && (
                  <button
                    onClick={cancelQueued}
                    className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-700"
                  >
                    Cancel pending
                  </button>
                )}
              </div>
              <div className="max-h-60 overflow-y-auto rounded border border-neutral-800">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 border-b border-neutral-800 px-2 py-1 last:border-b-0"
                  >
                    <StatusBadge status={it.status} />
                    <span className="flex-1 truncate text-[10px] text-neutral-300">
                      {it.imageFilename}
                    </span>
                    {it.error && (
                      <span
                        className="text-[9px] text-red-400 max-w-[180px] truncate"
                        title={it.error}
                      >
                        {it.error}
                      </span>
                    )}
                    {it.status === "failed" && (
                      <button
                        onClick={() => retryItem(it.id)}
                        className="rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] text-neutral-300 hover:bg-neutral-700"
                      >
                        Retry
                      </button>
                    )}
                    {(it.status === "succeeded" ||
                      it.status === "failed" ||
                      it.status === "canceled") && (
                      <button
                        onClick={() => removeItem(it.id)}
                        className="text-[10px] text-neutral-500 hover:text-neutral-200"
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

        <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-4 py-3">
          <button
            onClick={() => setDialogOpen(false)}
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700"
          >
            Close
          </button>
          <button
            onClick={handleStart}
            disabled={!prompt.trim() || selectedImages.length === 0 || isRunning}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {isRunning ? "Running..." : `Start (${selectedImages.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: "bg-neutral-700 text-neutral-300",
    running: "bg-amber-700 text-amber-200 animate-pulse",
    succeeded: "bg-green-700 text-green-200",
    failed: "bg-red-700 text-red-200",
    canceled: "bg-neutral-600 text-neutral-400",
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
