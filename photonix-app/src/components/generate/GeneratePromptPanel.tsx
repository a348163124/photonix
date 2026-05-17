import { useGenerateStore } from "@/stores/generateStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useAppStore } from "@/stores/appStore";
import { usePromptTemplateStore } from "@/stores/promptTemplateStore";
import { generateImage } from "@/services/tauri/generate";
import { toast } from "@/components/ui/Toast";
import { useTranslation } from "@/i18n";
import type { GenerationQuality, GenerationSize } from "@/types";

const SIZE_OPTIONS: { value: GenerationSize; tKey: string }[] = [
  { value: "1024x1024", tKey: "generate.sizes.square" },
  { value: "1792x1024", tKey: "generate.sizes.wide" },
  { value: "1024x1792", tKey: "generate.sizes.tall" },
  { value: "auto", tKey: "generate.sizes.auto" },
];

const QUALITY_OPTIONS: { value: GenerationQuality; tKey: string }[] = [
  { value: "standard", tKey: "generate.qualities.standard" },
  { value: "hd", tKey: "generate.qualities.hd" },
  { value: "auto", tKey: "generate.qualities.auto" },
];

const QUICK_PROMPTS = [
  "A serene mountain lake at golden hour, photorealistic, soft mist",
  "Cyberpunk city street at night, neon lights, rain-slicked pavement",
  "A minimalist modern living room with warm wood and soft natural light",
  "Aerial view of autumn forest with winding river, cinematic",
  "Macro shot of a dewdrop on a leaf, shallow depth of field",
];

export function GeneratePromptPanel() {
  const { t } = useTranslation();
  const prompt = useGenerateStore((s) => s.prompt);
  const setPrompt = useGenerateStore((s) => s.setPrompt);
  const size = useGenerateStore((s) => s.size);
  const setSize = useGenerateStore((s) => s.setSize);
  const quality = useGenerateStore((s) => s.quality);
  const setQuality = useGenerateStore((s) => s.setQuality);
  const isGenerating = useGenerateStore((s) => s.isGenerating);
  const setGenerating = useGenerateStore((s) => s.setGenerating);
  const lastError = useGenerateStore((s) => s.lastError);
  const setLastError = useGenerateStore((s) => s.setLastError);
  const prependImage = useGenerateStore((s) => s.prependImage);

  const provider = useSettingsStore((s) => s.provider);
  const hasApiKey = useSettingsStore((s) => s.hasApiKey);

  const setView = useAppStore((s) => s.setView);
  const setApplyTarget = usePromptTemplateStore((s) => s.setApplyTarget);

  async function handleGenerate() {
    if (!prompt.trim() || isGenerating) return;

    if (!hasApiKey) {
      const msg = t("generate.apiKeyMissing");
      setLastError(msg);
      return;
    }

    setLastError(null);
    setGenerating(true);

    try {
      const result = await generateImage({
        prompt,
        size,
        quality,
        baseUrl: provider.baseUrl,
        imageModel: provider.imageModel,
      });

      if (!result.success) {
        const msg = result.error ?? t("errors.generic");
        setLastError(msg);
        toast(msg, "error");
        return;
      }

      if (result.image) {
        prependImage(result.image);
        toast(t("toast.imageGenerated"), "success");
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : t("errors.generic");
      setLastError(msg);
      toast(msg, "error");
    } finally {
      setGenerating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleGenerate();
    }
  }

  function openPromptCenter() {
    setApplyTarget("generate");
    setView("promptCenter");
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h2
          className="text-xs font-medium"
          style={{ color: "var(--fg)" }}
        >
          {t("nav.generate")}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {/* Prompt */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label
                className="text-[11px]"
                style={{ color: "var(--muted)" }}
              >
                {t("generate.promptLabel")}
              </label>
              <button
                onClick={openPromptCenter}
                className="text-[10px] hover:underline"
                style={{ color: "var(--accent-strong)" }}
              >
                {t("generate.openPromptCenter")}
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("generate.promptPlaceholder")}
              rows={6}
              className="px-textarea"
              style={{ minHeight: 0 }}
            />
            <p className="mt-1 text-[9px]" style={{ color: "var(--muted-2)" }}>
              {t("generate.shortcutHint")}
            </p>
          </div>

          {/* Size */}
          <div>
            <label
              className="mb-1 block text-[11px]"
              style={{ color: "var(--muted)" }}
            >
              {t("generate.sizeLabel")}
            </label>
            <div className="grid grid-cols-2 gap-1">
              {SIZE_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSize(s.value)}
                  className={`px-btn ${size === s.value ? "px-btn-primary" : ""}`}
                  style={{ justifyContent: "center" }}
                >
                  {t(s.tKey)}
                  <span className="ml-1 text-[9px] opacity-60">{s.value}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quality */}
          <div>
            <label
              className="mb-1 block text-[11px]"
              style={{ color: "var(--muted)" }}
            >
              {t("generate.qualityLabel")}
            </label>
            <div className="flex gap-1">
              {QUALITY_OPTIONS.map((q) => (
                <button
                  key={q.value}
                  onClick={() => setQuality(q.value)}
                  className={`px-btn flex-1 ${
                    quality === q.value ? "px-btn-primary" : ""
                  }`}
                >
                  {t(q.tKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="px-btn px-btn-primary"
            style={{ padding: "10px 12px", fontSize: 13 }}
          >
            {isGenerating ? t("generate.generating") : t("generate.generateButton")}
          </button>

          {/* Error */}
          {lastError && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {lastError}
            </p>
          )}

          {/* Quick prompts — kept in English on purpose; they are seed
              examples for English generation, not UI chrome. */}
          <div
            className="pt-3"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <label
              className="mb-1.5 block text-[11px]"
              style={{ color: "var(--muted)" }}
            >
              {t("generate.quickPrompts")}
            </label>
            <div className="flex flex-col gap-1">
              {QUICK_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(p)}
                  className="px-btn"
                  style={{
                    justifyContent: "flex-start",
                    textAlign: "left",
                    fontSize: 11,
                    padding: "6px 10px",
                    color: "var(--muted)",
                  }}
                  title={p}
                >
                  {p.length > 60 ? `${p.slice(0, 60)}...` : p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
