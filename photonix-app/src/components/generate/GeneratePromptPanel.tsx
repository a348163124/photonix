import { useGenerateStore } from "@/stores/generateStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useAppStore } from "@/stores/appStore";
import { usePromptTemplateStore } from "@/stores/promptTemplateStore";
import { generateImage } from "@/services/tauri/generate";
import { toast } from "@/components/ui/Toast";
import { useTranslation } from "@/i18n";
import type { GenerationQuality, GenerationSize } from "@/types";

const SIZES: { value: GenerationSize; label: string }[] = [
  { value: "1024x1024", label: "Square" },
  { value: "1792x1024", label: "Wide" },
  { value: "1024x1792", label: "Tall" },
  { value: "auto", label: "Auto" },
];

const QUALITIES: { value: GenerationQuality; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "hd", label: "HD" },
  { value: "auto", label: "Auto" },
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
        toast(t("toast.saved"), "success");
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
    // Ctrl/Cmd + Enter triggers generate
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
      <div className="border-b border-neutral-800 px-4 py-3">
        <h2 className="text-xs font-medium text-neutral-200">{t("nav.generate")}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {/* Prompt */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] text-neutral-400">
                {t("generate.promptLabel")}
              </label>
              <button
                onClick={openPromptCenter}
                className="text-[10px] text-blue-400 hover:underline"
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
              className="w-full resize-none rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600"
            />
            <p className="mt-1 text-[9px] text-neutral-600">
              Tip: Ctrl/Cmd + Enter
            </p>
          </div>

          {/* Size */}
          <div>
            <label className="mb-1 block text-[11px] text-neutral-400">
              {t("generate.sizeLabel")}
            </label>
            <div className="grid grid-cols-2 gap-1">
              {SIZES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSize(s.value)}
                  className={`rounded px-2 py-1 text-xs transition-colors ${
                    size === s.value
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                  }`}
                >
                  {s.label}
                  <span className="ml-1 text-[9px] opacity-60">{s.value}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quality */}
          <div>
            <label className="mb-1 block text-[11px] text-neutral-400">
              {t("generate.qualityLabel")}
            </label>
            <div className="flex gap-1">
              {QUALITIES.map((q) => (
                <button
                  key={q.value}
                  onClick={() => setQuality(q.value)}
                  className={`flex-1 rounded px-2 py-1 text-xs transition-colors ${
                    quality === q.value
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating ? t("generate.generating") : t("generate.generateButton")}
          </button>

          {/* Error */}
          {lastError && <p className="text-xs text-red-400">{lastError}</p>}

          {/* Quick prompts — kept English only on purpose; these are seed
              examples for English generation, not UI chrome. */}
          <div className="border-t border-neutral-800 pt-3">
            <label className="mb-1.5 block text-[11px] text-neutral-400">
              Quick Prompts
            </label>
            <div className="flex flex-col gap-1">
              {QUICK_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(p)}
                  className="rounded bg-neutral-800 px-2 py-1.5 text-left text-[10px] text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 transition-colors"
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
