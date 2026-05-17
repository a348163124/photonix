import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useStyleStore } from "@/stores/styleStore";
import { useCandidateStore } from "@/stores/candidateStore";
import { usePresetsStore, BUILT_IN_PRESETS } from "@/stores/promptPresets";
import { runEditPipeline } from "@/services/editPipeline";
import { getVersions } from "@/services/tauri/versions";
import { isTauri } from "@/services/tauri/invoke";
import { planCandidates } from "@/services/candidates/candidatePlanner";
import { runCandidates } from "@/services/candidates/candidateRunner";
import {
  deleteCustomPreset,
  listCustomPresets,
  listPromptHistory,
  recordPromptHistory,
  upsertCustomPreset,
} from "@/services/tauri/promptHistory";
import { toast } from "@/components/ui/Toast";
import type {
  CandidateMode,
  EditPreset,
  PromptHistoryEntry,
  QualityMode,
  StyleProfile,
} from "@/types";

export function PromptPanel() {
  const selectedImageId = useAppStore((s) => s.selectedImageId);
  const images = useAppStore((s) => s.images);
  const versions = useAppStore((s) => s.currentVersions);
  const activeVersionId = useAppStore((s) => s.activeVersionId);
  const setProcessing = useAppStore((s) => s.setProcessing);
  const setJobMessage = useAppStore((s) => s.setJobMessage);

  const prompt = useEditorStore((s) => s.prompt);
  const setPrompt = useEditorStore((s) => s.setPrompt);
  const preserveIdentity = useEditorStore((s) => s.preserveIdentity);
  const setPreserveIdentity = useEditorStore((s) => s.setPreserveIdentity);
  const preserveComposition = useEditorStore((s) => s.preserveComposition);
  const setPreserveComposition = useEditorStore((s) => s.setPreserveComposition);
  const maskDataUrl = useEditorStore((s) => s.maskDataUrl);
  const prependRecentPrompt = useEditorStore((s) => s.prependRecentPrompt);

  const provider = useSettingsStore((s) => s.provider);
  const hasApiKey = useSettingsStore((s) => s.hasApiKey);
  const uploadProxyProfile = useSettingsStore((s) => s.uploadProxyProfile);

  const styles = useStyleStore((s) => s.styles);
  const selectedStyleId = useStyleStore((s) => s.selectedStyleId);
  const defaultStyleId = useStyleStore((s) => s.defaultStyleId);
  const setSelectedStyleId = useStyleStore((s) => s.setSelectedStyleId);

  const candidateRunning = useCandidateStore((s) => s.isRunning);

  const addPreset = usePresetsStore((s) => s.addPreset);
  const setPresets = usePresetsStore((s) => s.setPresets);
  const removePresetLocal = usePresetsStore((s) => s.removePreset);
  const setRecentPrompts = useEditorStore((s) => s.setRecentPrompts);

  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [appliedPresetId, setAppliedPresetId] = useState<string | null>(null);

  const [candidateCount, setCandidateCount] = useState<2 | 3 | 4>(3);
  const [candidateMode, setCandidateMode] = useState<CandidateMode>("natural");

  const activeStyle: StyleProfile | null =
    styles.find((s) => s.id === (selectedStyleId ?? defaultStyleId)) ?? null;

  const selectedImage = images.find((img) => img.id === selectedImageId);

  // Load custom presets and prompt history once on mount
  useEffect(() => {
    if (!isTauri()) return;
    listCustomPresets()
      .then((custom) => {
        setPresets([...BUILT_IN_PRESETS, ...custom]);
      })
      .catch((err) => console.error("Failed to load custom presets:", err));
    listPromptHistory(30)
      .then(setRecentPrompts)
      .catch((err) => console.error("Failed to load prompt history:", err));
  }, []);

  function applyPreset(preset: EditPreset) {
    setPrompt(preset.promptTemplate);
    setPreserveIdentity(preset.preserveIdentity);
    setPreserveComposition(preset.preserveComposition);
    setAppliedPresetId(preset.id);
    toast(`Applied preset: ${preset.name}`, "info", 1500);
  }

  async function savePromptAsPreset() {
    if (!prompt.trim()) {
      toast("Type a prompt first, then save as preset.", "info");
      return;
    }
    const name = window.prompt("Name for this preset?");
    if (!name?.trim()) return;
    const newPreset: EditPreset = {
      id: `custom-${crypto.randomUUID()}`,
      category: "custom",
      name: name.trim(),
      description: "Custom preset",
      promptTemplate: prompt,
      preserveIdentity,
      preserveComposition,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    addPreset(newPreset);
    try {
      await upsertCustomPreset(newPreset);
      toast(`Saved preset: ${name.trim()}`, "success");
    } catch (err) {
      console.error("Failed to persist preset:", err);
      toast("Saved locally; failed to persist to disk.", "info");
    }
  }

  async function deleteCustomPresetById(id: string) {
    removePresetLocal(id);
    try {
      await deleteCustomPreset(id);
    } catch (err) {
      console.error("Failed to delete preset on disk:", err);
    }
  }

  async function handleGenerate(mode: QualityMode) {
    if (!selectedImage || !prompt.trim()) return;
    if (!hasApiKey) {
      setError("Please configure your API key in Settings first.");
      return;
    }

    setError(null);
    setLastResult(null);
    setProcessing(true);

    const activeVersion = versions.find((v) => v.id === activeVersionId);
    const currentVersion = versions.find((v) => v.isCurrent);
    const baseVersion = activeVersion ?? currentVersion;
    const inputPath = baseVersion?.storagePath ?? selectedImage.sourcePath;
    const inputWidth = baseVersion?.width ?? selectedImage.width;
    const inputHeight = baseVersion?.height ?? selectedImage.height;

    // Merge style profile into prompt when one is active.
    // User instruction wins over style defaults — we put the user prompt first.
    const finalPrompt = activeStyle
      ? buildStyledPrompt(prompt, activeStyle)
      : prompt;
    const effectivePreserveIdentity =
      preserveIdentity || (activeStyle?.preserveIdentity ?? false);
    const effectivePreserveComposition =
      preserveComposition && (activeStyle?.preserveComposition ?? true);

    try {
      const result = await runEditPipeline(
        {
          imageId: selectedImage.id,
          sourcePath: inputPath,
          sourceWidth: inputWidth,
          sourceHeight: inputHeight,
          userPrompt: finalPrompt,
          maskDataUrl,
          qualityMode: mode,
          preserveIdentity: effectivePreserveIdentity,
          preserveComposition: effectivePreserveComposition,
          imageType: detectImageType(selectedImage.filename),
          uploadProxyProfile,
        },
        provider,
        (msg) => setJobMessage(msg)
      );

      setLastResult(
        `✓ Edit complete (${mode}). Goal: "${result.compiledPrompt.editGoal}"`
      );
      toast(`Edit complete (${mode})`, "success");

      // Record into recent prompts (in-memory + persisted)
      const historyEntry: PromptHistoryEntry = {
        id: crypto.randomUUID(),
        rawPrompt: prompt,
        presetId: appliedPresetId,
        qualityMode: mode,
        imageId: selectedImage.id,
        versionId: null,
        createdAt: new Date().toISOString(),
      };
      prependRecentPrompt(historyEntry);
      void recordPromptHistory(historyEntry).catch((err) =>
        console.error("Failed to persist prompt history:", err)
      );

      // Refresh version list and activate the version that was just created.
      // We trust the version_id returned by submit_edit rather than guessing
      // from the order of the list.
      if (isTauri()) {
        const versions = await getVersions(selectedImage.id);
        useAppStore.getState().setCurrentVersions(versions);
        const newVersionId = result.editResult.versionId;
        const target =
          (newVersionId && versions.find((v) => v.id === newVersionId)) ||
          versions.find((v) => v.isCurrent) ||
          versions[versions.length - 1];
        if (target) {
          useAppStore.getState().setActiveVersion(target.id);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Edit failed";
      setError(msg);
      toast(msg, "error");
    } finally {
      setProcessing(false);
      setJobMessage(null);
    }
  }

  async function handleGenerateCandidates() {
    if (!selectedImage || !prompt.trim()) {
      toast("Type a prompt first.", "info");
      return;
    }
    if (!hasApiKey) {
      setError("Please configure your API key in Settings first.");
      return;
    }
    const plans = planCandidates({
      count: candidateCount,
      mode: candidateMode,
      style: activeStyle,
    });
    const groupId = `cand-${crypto.randomUUID()}`;

    void runCandidates({
      image: selectedImage,
      basePrompt: prompt,
      style: activeStyle,
      plans,
      groupId,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Prompt input */}
      <div>
        <label className="mb-1 block text-[11px] text-neutral-400">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the edit you want... e.g. 'Remove the people and keep the water reflection natural'"
          className="h-28 w-full resize-none rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600"
        />
      </div>

      {/* Mask indicator */}
      {maskDataUrl && (
        <div className="flex items-center gap-1.5 rounded bg-amber-900/20 px-2 py-1">
          <span className="text-[10px] text-amber-400">⬡ Mask active</span>
          <span className="text-[10px] text-neutral-500">— local region edit</span>
        </div>
      )}

      {/* Upload proxy profile indicator */}
      <div className="flex items-center justify-between rounded bg-neutral-800/50 px-2 py-1">
        <span className="text-[10px] text-neutral-500">Upload proxy</span>
        <span className="text-[10px] text-neutral-300 capitalize">
          {uploadProxyProfile.replace("_", " ")}
        </span>
      </div>

      {/* Preserve toggles */}
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-[11px] text-neutral-400">
          <input
            type="checkbox"
            checked={preserveIdentity}
            onChange={(e) => setPreserveIdentity(e.target.checked)}
            className="rounded accent-blue-500"
          />
          Preserve face & identity
        </label>
        <label className="flex items-center gap-2 text-[11px] text-neutral-400">
          <input
            type="checkbox"
            checked={preserveComposition}
            onChange={(e) => setPreserveComposition(e.target.checked)}
            className="rounded accent-blue-500"
          />
          Preserve composition
        </label>
      </div>

      {/* MVP3: Style profile selector */}
      <div className="rounded bg-neutral-800/50 p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500">
            Style profile
          </span>
          {activeStyle && (
            <button
              onClick={() => setSelectedStyleId(null)}
              className="text-[9px] text-neutral-500 hover:text-neutral-200"
            >
              Clear
            </button>
          )}
        </div>
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
        {activeStyle && (
          <p className="mt-1 line-clamp-2 text-[10px] text-neutral-500">
            {activeStyle.styleSummary}
          </p>
        )}
      </div>

      {/* MVP3: Candidate generation */}
      <div className="rounded bg-neutral-800/50 p-2">
        <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
          Multi-version candidates
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="mb-0.5 block text-[9px] text-neutral-500">Count</label>
            <div className="flex gap-0.5">
              {([2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setCandidateCount(n)}
                  className={`flex-1 rounded px-1 py-0.5 text-[10px] ${
                    candidateCount === n
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-0.5 block text-[9px] text-neutral-500">Mode</label>
            <select
              value={candidateMode}
              onChange={(e) => setCandidateMode(e.target.value as CandidateMode)}
              className="w-full rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-200"
            >
              <option value="natural">Natural</option>
              <option value="cinematic">Cinematic</option>
              <option value="clean_bright">Clean &amp; Bright</option>
              <option value="moody">Moody</option>
              <option value="warm">Warm</option>
              <option value="cool">Cool</option>
            </select>
          </div>
        </div>
        <button
          onClick={handleGenerateCandidates}
          disabled={!prompt.trim() || candidateRunning}
          className="mt-2 w-full rounded bg-purple-600 px-2 py-1 text-[10px] font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-40"
        >
          {candidateRunning ? "Running candidates..." : `Generate ${candidateCount} candidates`}
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => handleGenerate("draft")}
          disabled={!prompt.trim()}
          className="flex-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Generate Draft
        </button>
        <button
          onClick={() => handleGenerate("final")}
          disabled={!prompt.trim()}
          className="flex-1 rounded bg-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Final
        </button>
      </div>

      {/* Status */}
      {error && (
        <p className="text-xs text-red-400 mt-1">{error}</p>
      )}
      {lastResult && (
        <p className="text-xs text-green-400 mt-1">{lastResult}</p>
      )}

      {/* Quick presets */}
      <div className="mt-2 border-t border-neutral-800 pt-2">
        <label className="mb-1.5 block text-[11px] text-neutral-400">Presets</label>
        <PresetsList
          onApply={applyPreset}
          onSaveCustom={savePromptAsPreset}
          onDeleteCustom={deleteCustomPresetById}
        />
      </div>

      {/* Recent prompts */}
      <div className="mt-2 border-t border-neutral-800 pt-2">
        <label className="mb-1.5 block text-[11px] text-neutral-400">Recent</label>
        <RecentPromptsList onSelect={setPrompt} />
      </div>
    </div>
  );
}

function PresetsList({
  onApply,
  onSaveCustom,
  onDeleteCustom,
}: {
  onApply: (preset: import("@/types").EditPreset) => void;
  onSaveCustom: () => void;
  onDeleteCustom: (id: string) => void;
}) {
  const presets = usePresetsStore((s) => s.presets);
  const [category, setCategory] = useState<"landscape" | "portrait" | "custom">(
    "landscape"
  );

  const filtered = presets.filter((p) => p.category === category);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1 flex-wrap">
        {(["landscape", "portrait", "custom"] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`rounded px-1.5 py-0.5 text-[10px] capitalize transition-colors ${
              category === cat
                ? "bg-blue-600/30 text-blue-300"
                : "bg-neutral-800 text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {cat}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={onSaveCustom}
          className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 transition-colors"
          title="Save current prompt as a custom preset"
        >
          + Save
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5">
        {filtered.length === 0 && (
          <p className="text-[10px] text-neutral-600 px-1 py-2">
            {category === "custom"
              ? "No custom presets yet. Click + Save to add one."
              : "No presets in this category."}
          </p>
        )}
        {filtered.map((preset) => (
          <div
            key={preset.id}
            className="group flex items-start gap-1 rounded bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
          >
            <button
              onClick={() => onApply(preset)}
              className="flex-1 text-left"
              title={preset.promptTemplate}
            >
              <div className="text-[11px] text-neutral-200">{preset.name}</div>
              <div className="text-[9px] text-neutral-500 line-clamp-1">
                {preset.description}
              </div>
            </button>
            {preset.isCustom && (
              <button
                onClick={() => onDeleteCustom(preset.id)}
                className="hidden h-5 w-5 items-center justify-center rounded text-[10px] text-neutral-500 hover:bg-red-700 hover:text-white group-hover:flex"
                title="Delete custom preset"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentPromptsList({ onSelect }: { onSelect: (prompt: string) => void }) {
  const recent = useEditorStore((s) => s.recentPrompts);

  if (recent.length === 0) {
    return (
      <p className="text-[10px] text-neutral-600">
        Your recent prompts will appear here.
      </p>
    );
  }

  return (
    <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5">
      {recent.slice(0, 8).map((entry) => (
        <button
          key={entry.id}
          onClick={() => onSelect(entry.rawPrompt)}
          className="rounded bg-neutral-800 px-2 py-1 text-left text-[10px] text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 transition-colors line-clamp-2"
          title={entry.rawPrompt}
        >
          {entry.rawPrompt}
        </button>
      ))}
    </div>
  );
}

function detectImageType(filename: string): "landscape" | "portrait" | "event" | "generic" {
  const lower = filename.toLowerCase();
  if (lower.includes("portrait") || lower.includes("headshot")) return "portrait";
  if (lower.includes("wedding") || lower.includes("event")) return "event";
  if (lower.includes("landscape") || lower.includes("nature")) return "landscape";
  return "generic";
}

function buildStyledPrompt(userPrompt: string, style: StyleProfile): string {
  const parts = [userPrompt.trim()];
  if (style.positivePrompt) parts.push(`Style: ${style.positivePrompt}`);
  if (style.negativePrompt) parts.push(`Avoid: ${style.negativePrompt}`);
  return parts.join(". ").replace(/\.+\s*\./g, ".");
}
