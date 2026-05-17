import { useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useStyleStore } from "@/stores/styleStore";
import { analyzeReferenceStyle } from "@/services/tauri/referenceStyle";
import { upsertStyleProfile } from "@/services/tauri/styles";
import { isTauri } from "@/services/tauri/invoke";
import { toast } from "@/components/ui/Toast";
import { useTranslation } from "@/i18n";
import type { ReferenceStyleAnalysis, StyleProfile } from "@/types";

export function ReferenceStyleAnalyzer({
  onSaved,
}: {
  onSaved: (savedId: string) => void;
}) {
  const { t } = useTranslation();
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
      toast(t("errors.desktopOnly"), "error");
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
    if (!imagePath) return;
    if (!hasApiKey) {
      toast(t("errors.apiKeyMissing"), "error");
      return;
    }
    setAnalyzing(true);
    try {
      const visionModelId = provider.visionModel?.trim() || provider.textModel;
      const result = await analyzeReferenceStyle(
        imagePath,
        provider.baseUrl,
        visionModelId
      );
      setAnalysis(result);
      setDraft(result.draftProfile);
      toast(t("style.analyzer.extractedHeading"), "success");
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
      toast(t("toast.saved"), "success");
      onSaved(finalProfile.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium ">
        {t("style.analyzer.heading")}
      </h2>

      {/* Picker */}
      <div className="flex items-center gap-2">
        <button
          onClick={pickImage}
          className="px-btn"
        >
          {imagePath ? t("style.analyzer.changeImage") : t("style.analyzer.pickImage")}
        </button>
        {imagePath && (
          <span className="truncate text-[10px] " title={imagePath}>
            {imagePath.split(/[\\/]/).pop()}
          </span>
        )}
      </div>

      {/* Privacy note */}
      <p className="rounded bg-amber-900/20 px-2 py-1 text-[10px] text-amber-300/80">
        {t("style.analyzer.privacyNote")}
      </p>

      {/* Vision model indicator */}
      <div className="flex items-center justify-between rounded  px-2 py-1">
        <span className="text-[10px] ">
          {t("style.analyzer.visionModelLabel")}
        </span>
        <span className="text-[10px] ">
          {provider.visionModel?.trim() ||
            t("style.analyzer.visionModelFallback", { model: provider.textModel })}
        </span>
      </div>
      <p className="text-[9px] ">{t("style.analyzer.visionModelHelp")}</p>

      <button
        onClick={runAnalysis}
        disabled={!imagePath || analyzing || !hasApiKey}
        className="px-btn px-btn-primary"
      >
        {analyzing ? t("style.analyzer.analyzing") : t("style.analyzer.analyze")}
      </button>

      {/* Results */}
      {analysis && draft && (
        <div className="border-t  pt-3 flex flex-col gap-3">
          <h3 className="text-xs font-medium ">
            {t("style.analyzer.extractedHeading")}
          </h3>

          {/* Palette */}
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide ">
              {t("style.analyzer.palette")}
            </div>
            <div className="flex flex-wrap gap-1">
              {(analysis.ai.dominantPalette.length > 0
                ? analysis.ai.dominantPalette
                : analysis.localColor.dominantPalette
              ).map((hex) => (
                <div
                  key={hex}
                  className="h-6 w-6 rounded"
                  style={{ backgroundColor: hex, border: "1px solid var(--border)" }}
                  title={hex}
                />
              ))}
            </div>
          </div>

          {/* Local stats */}
          <div className="grid grid-cols-3 gap-2 text-[10px] ">
            <Stat
              label={t("style.analyzer.warmCool")}
              value={analysis.localColor.warmCoolBalance.toFixed(2)}
            />
            <Stat
              label={t("style.analyzer.saturation")}
              value={analysis.localColor.saturationMean.toFixed(2)}
            />
            <Stat
              label={t("style.analyzer.contrast")}
              value={analysis.localColor.contrastEstimate.toFixed(2)}
            />
          </div>

          {/* AI summary */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide ">
              {t("style.analyzer.summary")}
            </label>
            <p className="rounded text-[11px] ">
              {analysis.ai.summary}
            </p>
          </div>

          {/* Editable draft */}
          <div className="border-t  pt-3">
            <h3 className="mb-2 text-xs font-medium ">
              {t("style.analyzer.saveHeading")}
            </h3>
            <div className="flex flex-col gap-2">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="px-input"
                placeholder={t("style.analyzer.stylePlaceholder")}
              />
              <textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={2}
                className="px-textarea"
                placeholder={t("style.analyzer.descPlaceholder")}
              />
              <textarea
                value={draft.positivePrompt}
                onChange={(e) =>
                  setDraft({ ...draft, positivePrompt: e.target.value })
                }
                rows={4}
                className="px-textarea"
                placeholder={t("style.analyzer.positivePlaceholder")}
              />
              <textarea
                value={draft.negativePrompt}
                onChange={(e) =>
                  setDraft({ ...draft, negativePrompt: e.target.value })
                }
                rows={2}
                className="px-textarea"
                placeholder={t("style.analyzer.negativePlaceholder")}
              />
              <button
                onClick={handleSave}
                disabled={saving || !draft.name.trim()}
                className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-40"
              >
                {saving ? t("style.analyzer.saving") : t("style.analyzer.saveAs")}
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
    <div className="rounded  px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide ">
        {label}
      </div>
      <div className="text-[11px] ">{value}</div>
    </div>
  );
}

