import { useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useStyleStore } from "@/stores/styleStore";
import { analyzeReferenceStyle } from "@/services/tauri/referenceStyle";
import { upsertStyleProfile } from "@/services/tauri/styles";
import { isTauri } from "@/services/tauri/invoke";
import { toast } from "@/components/ui/Toast";
import type { ReferenceStyleAnalysis, StyleProfile } from "@/types";

export function ReferenceStyleAnalyzer({
  onSaved,
}: {
  onSaved: (savedId: string) => void;
}) {
  const provider = useSettingsStore((s) => s.provider);
  const hasApiKey = useSettingsStore((s) => s.hasApiKey);
  const addStyle = useStyleStore((s) => s.addStyle);

  const [imagePath, setImagePath] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ReferenceStyleAnalysis | null>(null);
  const [draft, setDraft] = useState<StyleProfile | null>(null);
  const [saving, setSaving] = useState(false);

  async function pickImage() {
    if (!isTauri()) {
      toast("Reference picker requires the desktop app.", "error");
      return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const result = await open({
      multiple: false,
      filters: [
        {
          name: "Image",
          extensions: ["png", "jpg", "jpeg", "webp", "tif", "tiff", "bmp"],
        },
      ],
    });
    if (typeof result === "string") {
      setImagePath(result);
      setAnalysis(null);
      setDraft(null);
    }
  }

  async function runAnalysis() {
    if (!imagePath) {
      toast("Pick a reference image first.", "info");
      return;
    }
    if (!hasApiKey) {
      toast("Configure your API key in Settings first.", "error");
      return;
    }
    setAnalyzing(true);
    try {
      const result = await analyzeReferenceStyle(
        imagePath,
        provider.baseUrl,
        provider.textModel
      );
      setAnalysis(result);
      setDraft(result.draftProfile);
      toast("Reference style extracted", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast(msg, "error");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      const finalProfile: StyleProfile = {
        ...draft,
        updatedAt: new Date().toISOString(),
      };
      await upsertStyleProfile(finalProfile);
      addStyle(finalProfile);
      toast(`Saved style "${finalProfile.name}"`, "success");
      onSaved(finalProfile.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-neutral-200">Analyze Reference Image</h2>

      {/* Picker */}
      <div className="flex items-center gap-2">
        <button
          onClick={pickImage}
          className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
        >
          {imagePath ? "Change image" : "Pick reference image"}
        </button>
        {imagePath && (
          <span className="truncate text-[10px] text-neutral-500" title={imagePath}>
            {imagePath.split(/[\\/]/).pop()}
          </span>
        )}
      </div>

      {/* Privacy note */}
      <p className="rounded bg-amber-900/20 px-2 py-1 text-[10px] text-amber-300/80">
        The reference is sent to your provider as a small JPEG proxy. Photonix
        instructs the model to describe only color, light, and tone — never
        people, places, or copyrighted content. The original file is not
        uploaded.
      </p>

      <button
        onClick={runAnalysis}
        disabled={!imagePath || analyzing || !hasApiKey}
        className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
      >
        {analyzing ? "Analyzing..." : "Analyze"}
      </button>

      {/* Results */}
      {analysis && draft && (
        <div className="border-t border-neutral-800 pt-3 flex flex-col gap-3">
          <h3 className="text-xs font-medium text-neutral-300">Extracted style</h3>

          {/* Palette */}
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">
              Palette
            </div>
            <div className="flex flex-wrap gap-1">
              {(analysis.ai.dominantPalette.length > 0
                ? analysis.ai.dominantPalette
                : analysis.localColor.dominantPalette
              ).map((hex) => (
                <div
                  key={hex}
                  className="h-6 w-6 rounded border border-neutral-700"
                  style={{ backgroundColor: hex }}
                  title={hex}
                />
              ))}
            </div>
          </div>

          {/* Local stats */}
          <div className="grid grid-cols-3 gap-2 text-[10px] text-neutral-400">
            <Stat
              label="Warm/Cool"
              value={analysis.localColor.warmCoolBalance.toFixed(2)}
            />
            <Stat
              label="Saturation"
              value={analysis.localColor.saturationMean.toFixed(2)}
            />
            <Stat
              label="Contrast"
              value={analysis.localColor.contrastEstimate.toFixed(2)}
            />
          </div>

          {/* AI summary */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
              AI summary
            </label>
            <p className="rounded bg-neutral-800 p-2 text-[11px] text-neutral-300">
              {analysis.ai.summary}
            </p>
          </div>

          {/* Editable draft */}
          <div className="border-t border-neutral-800 pt-3">
            <h3 className="mb-2 text-xs font-medium text-neutral-300">
              Save as style profile
            </h3>
            <div className="flex flex-col gap-2">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
                placeholder="Style name"
              />
              <textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={2}
                className="w-full resize-none rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
                placeholder="Description"
              />
              <textarea
                value={draft.positivePrompt}
                onChange={(e) =>
                  setDraft({ ...draft, positivePrompt: e.target.value })
                }
                rows={4}
                className="w-full resize-none rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
                placeholder="Positive prompt fragment"
              />
              <textarea
                value={draft.negativePrompt}
                onChange={(e) =>
                  setDraft({ ...draft, negativePrompt: e.target.value })
                }
                rows={2}
                className="w-full resize-none rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
                placeholder="Negative constraints"
              />
              <button
                onClick={handleSave}
                disabled={saving || !draft.name.trim()}
                className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-40"
              >
                {saving ? "Saving..." : "Save style profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-neutral-800 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="text-[11px] text-neutral-200">{value}</div>
    </div>
  );
}
