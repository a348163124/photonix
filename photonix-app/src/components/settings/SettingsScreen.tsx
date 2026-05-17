import { useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useI18nStore, useTranslation, type Language } from "@/i18n";
import { isTauri } from "@/services/tauri/invoke";
import { saveSetting, saveApiKey, hasApiKey } from "@/services/tauri/settings";
import { checkProviderCompatibility } from "@/services/provider/compatibility";
import {
  EXPORT_PRESETS,
  PROXY_PROFILES,
  type ExportPresetId,
  type UploadProxyProfile,
} from "@/types";

interface StoredProviderConfig {
  baseUrl: string;
  imageModel: string;
  textModel: string;
  fallbackTextModel: string;
  visionModel: string;
}

interface StoredEditingPrefs {
  uploadProxyProfile: UploadProxyProfile;
  defaultExportPreset: ExportPresetId;
}

type SettingsCategory = "provider" | "editing" | "export" | "language";

const CATEGORY_KEYS: { id: SettingsCategory; tKey: string }[] = [
  { id: "provider", tKey: "settings.categories.provider" },
  { id: "editing", tKey: "settings.categories.editing" },
  { id: "export", tKey: "settings.categories.export" },
  { id: "language", tKey: "settings.categories.language" },
];

export function SettingsScreen() {
  const { t } = useTranslation();
  const provider = useSettingsStore((s) => s.provider);
  const hasKey = useSettingsStore((s) => s.hasApiKey);
  const uploadProxyProfile = useSettingsStore((s) => s.uploadProxyProfile);
  const defaultExportPreset = useSettingsStore((s) => s.defaultExportPreset);

  const [category, setCategory] = useState<SettingsCategory>("provider");

  // API key is held only in local component state, never in Zustand.
  // It is empty by default; the user types it in to (re)set, and it is
  // wiped on save. The actual key lives only in the OS secret store.
  const [apiKeyDraft, setApiKeyDraft] = useState("");

  const [saved, setSaved] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<string | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  /**
   * Persist current provider baseURL and model fields to SQLite.
   * Does NOT touch the API key (handled separately) and does NOT toggle
   * the "✓ Saved" indicator. Used by both Save and Validate so that
   * validating right after editing baseURL/models also persists those
   * changes for the next session.
   */
  async function persistProviderConfig() {
    if (!isTauri()) return;
    const config: StoredProviderConfig = {
      baseUrl: provider.baseUrl,
      imageModel: provider.imageModel,
      textModel: provider.textModel,
      fallbackTextModel: provider.fallbackTextModel,
      visionModel: provider.visionModel,
    };
    await saveSetting("provider_config", config);
  }

  async function handleSave() {
    if (isTauri()) {
      await persistProviderConfig();

      // Save API key only if the user typed something. Don't overwrite
      // an existing stored key with empty when the user is just adjusting
      // models or base URL.
      if (apiKeyDraft.length > 0) {
        await saveApiKey(apiKeyDraft);
        // Wipe local state immediately so it doesn't linger in memory.
        setApiKeyDraft("");
        // Update store flag.
        useSettingsStore.getState().setHasApiKey(true);
      } else {
        // Re-check whether one is currently stored, in case it was deleted.
        const has = await hasApiKey();
        useSettingsStore.getState().setHasApiKey(has);
      }

      const prefs: StoredEditingPrefs = {
        uploadProxyProfile,
        defaultExportPreset,
      };
      await saveSetting("editing_prefs", prefs);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleClearApiKey() {
    if (!isTauri()) return;
    const ok = window.confirm(t("settings.provider.clearKeyConfirm"));
    if (!ok) return;
    await saveApiKey(""); // empty string deletes the entry
    setApiKeyDraft("");
    useSettingsStore.getState().setHasApiKey(false);
  }

  async function handleValidate() {
    setValidating(true);
    setValidationResult(null);
    setValidationWarnings([]);

    // Persist whatever the user has typed BEFORE validating, so that
    // a successful validation can't be undone by a later restart that
    // reverts to the previously saved baseURL/models. This avoids the
    // "validated, but the next session uses old values" footgun.
    try {
      await persistProviderConfig();
    } catch (err) {
      setValidationResult(
        t("settings.provider.saveBeforeValidateFailed", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
      setValidating(false);
      return;
    }

    // If the user just typed a new key but hasn't saved yet, save it
    // first so validate_provider can find it in the secret store.
    if (apiKeyDraft.length > 0) {
      try {
        await saveApiKey(apiKeyDraft);
        setApiKeyDraft("");
        useSettingsStore.getState().setHasApiKey(true);
      } catch (err) {
        setValidationResult(
          t("settings.provider.saveKeyBeforeValidateFailed", {
            error: err instanceof Error ? err.message : String(err),
          })
        );
        setValidating(false);
        return;
      }
    }

    const result = await checkProviderCompatibility(provider);
    if (result.error) {
      setValidationResult(result.error);
    } else if (result.connected) {
      setValidationResult(t("settings.provider.connectionSuccess"));
      setValidationWarnings(result.warnings);
    }
    setValidating(false);
  }

  return (
    <div className="flex h-full" style={{ background: "var(--bg)" }}>
      <nav
        className="w-44 p-3"
        style={{
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <ul className="flex flex-col gap-1">
          {CATEGORY_KEYS.map((cat) => (
            <li key={cat.id}>
              <button
                onClick={() => setCategory(cat.id)}
                className="w-full rounded px-2 py-1 text-left text-xs transition-colors"
                style={{
                  background:
                    category === cat.id ? "var(--accent-soft)" : "transparent",
                  color:
                    category === cat.id ? "var(--accent-strong)" : "var(--muted)",
                }}
              >
                {t(cat.tKey)}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex-1 overflow-y-auto p-6" style={{ background: "var(--bg)" }}>
        {category === "provider" && (
          <ProviderSection
            apiKeyDraft={apiKeyDraft}
            setApiKeyDraft={setApiKeyDraft}
            hasKey={hasKey}
            onClearKey={handleClearApiKey}
            saved={saved}
            validating={validating}
            validationResult={validationResult}
            validationWarnings={validationWarnings}
            onSave={handleSave}
            onValidate={handleValidate}
          />
        )}
        {category === "editing" && (
          <EditingSection saved={saved} onSave={handleSave} />
        )}
        {category === "export" && <ExportSection saved={saved} onSave={handleSave} />}
        {category === "language" && <LanguageSection />}
      </div>
    </div>
  );
}

function ProviderSection({
  apiKeyDraft,
  setApiKeyDraft,
  hasKey,
  onClearKey,
  saved,
  validating,
  validationResult,
  validationWarnings,
  onSave,
  onValidate,
}: {
  apiKeyDraft: string;
  setApiKeyDraft: (v: string) => void;
  hasKey: boolean;
  onClearKey: () => void;
  saved: boolean;
  validating: boolean;
  validationResult: string | null;
  validationWarnings: string[];
  onSave: () => void;
  onValidate: () => void;
}) {
  const { t } = useTranslation();
  const provider = useSettingsStore((s) => s.provider);
  const setProvider = useSettingsStore((s) => s.setProvider);

  return (
    <div className="flex max-w-md flex-col gap-4">
      <h2 className="text-sm font-medium ">
        {t("settings.provider.heading")}
      </h2>

      <Field
        label={t("settings.provider.baseUrl")}
        value={provider.baseUrl}
        onChange={(v) => setProvider({ baseUrl: v })}
        placeholder="https://api.openai.com/v1"
      />

      {/* API key — local-only field */}
      <div>
        <label className="mb-1 flex items-center justify-between text-[11px] ">
          <span>{t("settings.provider.apiKey")}</span>
          {hasKey && (
            <span className="text-[10px] text-green-400">
              {t("settings.provider.apiKeySaved")}
            </span>
          )}
        </label>
        <input
          type="password"
          value={apiKeyDraft}
          onChange={(e) => setApiKeyDraft(e.target.value)}
          placeholder={
            hasKey
              ? t("settings.provider.apiKeyPlaceholderSaved")
              : t("settings.provider.apiKeyPlaceholderEmpty")
          }
          autoComplete="off"
          spellCheck={false}
          className="px-input"
        />
        {hasKey && (
          <button
            onClick={onClearKey}
            className="mt-1 text-[10px]  "
          >
            {t("settings.provider.clearKey")}
          </button>
        )}
      </div>

      <div className="border-t  pt-4">
        <h3 className="mb-3 text-xs font-medium ">
          {t("settings.provider.modelsHeading")}
        </h3>
      </div>

      <Field
        label={t("settings.provider.imageModel")}
        value={provider.imageModel}
        onChange={(v) => setProvider({ imageModel: v })}
      />
      <Field
        label={t("settings.provider.textModel")}
        value={provider.textModel}
        onChange={(v) => setProvider({ textModel: v })}
      />
      <Field
        label={t("settings.provider.fallbackTextModel")}
        value={provider.fallbackTextModel}
        onChange={(v) => setProvider({ fallbackTextModel: v })}
      />
      <div>
        <Field
          label={t("settings.provider.visionModel")}
          value={provider.visionModel}
          onChange={(v) => setProvider({ visionModel: v })}
          placeholder={t("settings.provider.visionModelPlaceholder")}
        />
        <p className="mt-1 text-[10px] ">
          {t("settings.provider.visionModelHelp")}
        </p>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={onSave}
          className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
        >
          {saved ? t("common.saved") : t("common.save")}
        </button>
        <button
          onClick={onValidate}
          disabled={validating || (!hasKey && !apiKeyDraft)}
          className="px-btn"
        >
          {validating ? t("settings.provider.validating") : t("settings.provider.validate")}
        </button>
      </div>

      {validationResult && (
        <p
          className={`text-xs ${
            validationResult === t("settings.provider.connectionSuccess")
              ? "text-green-400"
              : "text-red-400"
          }`}
        >
          {validationResult}
        </p>
      )}
      {validationWarnings.length > 0 && (
        <div className="rounded bg-amber-900/20 p-2">
          {validationWarnings.map((w, i) => (
            <p key={i} className="text-[10px] text-amber-400">
              {w}
            </p>
          ))}
        </div>
      )}

      <p className="text-[10px]  mt-2">
        {t("settings.provider.keyHelp")}
      </p>
    </div>
  );
}

function EditingSection({ saved, onSave }: { saved: boolean; onSave: () => void }) {
  const { t } = useTranslation();
  const uploadProxyProfile = useSettingsStore((s) => s.uploadProxyProfile);
  const setUploadProxyProfile = useSettingsStore((s) => s.setUploadProxyProfile);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h2 className="text-sm font-medium ">
        {t("settings.editing.heading")}
      </h2>
      <p className="text-[11px] ">{t("settings.editing.proxyHelp")}</p>

      <label className="block text-[11px] ">
        {t("settings.editing.proxyProfileLabel")}
      </label>
      <div className="flex flex-col gap-1">
        {PROXY_PROFILES.map((p) => (
          <button
            key={p.id}
            onClick={() => setUploadProxyProfile(p.id)}
            className={`rounded px-3 py-2 text-left text-xs transition-colors ${
              uploadProxyProfile === p.id
                ? "bg-blue-600/30 text-blue-200 ring-1 ring-blue-500/50"
                : "  hover:"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{p.label}</span>
              <span className="text-[10px] ">
                {p.longEdge}px · ≤{Math.round(p.maxBytes / (1024 * 1024))}MB
              </span>
            </div>
            <div className="mt-0.5 text-[10px] ">{p.description}</div>
          </button>
        ))}
      </div>

      <button
        onClick={onSave}
        className="mt-2 w-fit rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
      >
        {saved ? t("common.saved") : t("common.save")}
      </button>
    </div>
  );
}

function ExportSection({ saved, onSave }: { saved: boolean; onSave: () => void }) {
  const { t } = useTranslation();
  const defaultExportPreset = useSettingsStore((s) => s.defaultExportPreset);
  const setDefaultExportPreset = useSettingsStore((s) => s.setDefaultExportPreset);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h2 className="text-sm font-medium ">
        {t("settings.export.heading")}
      </h2>
      <p className="text-[11px] ">{t("settings.export.help")}</p>

      <label className="block text-[11px] ">
        {t("settings.export.defaultPresetLabel")}
      </label>
      <div className="flex flex-col gap-1">
        {EXPORT_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setDefaultExportPreset(p.id)}
            className={`rounded px-3 py-2 text-left text-xs transition-colors ${
              defaultExportPreset === p.id
                ? "bg-blue-600/30 text-blue-200 ring-1 ring-blue-500/50"
                : "  hover:"
            }`}
          >
            <div className="font-medium">{p.label}</div>
            <div className="mt-0.5 text-[10px] ">{p.description}</div>
          </button>
        ))}
      </div>

      <button
        onClick={onSave}
        className="mt-2 w-fit rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
      >
        {saved ? t("common.saved") : t("common.save")}
      </button>
    </div>
  );
}

function LanguageSection() {
  const { t } = useTranslation();
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const [savedToast, setSavedToast] = useState(false);

  async function pickLanguage(lang: Language) {
    setLanguage(lang);
    if (isTauri()) {
      try {
        await saveSetting("ui_language", lang);
      } catch (err) {
        console.warn("Failed to persist language:", err);
      }
    }
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  }

  const options: { id: Language; labelKey: string }[] = [
    { id: "en", labelKey: "settings.language.en" },
    { id: "zh-CN", labelKey: "settings.language.zh" },
  ];

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h2 className="text-sm font-medium ">
        {t("settings.language.heading")}
      </h2>
      <p className="text-[11px] ">{t("settings.language.help")}</p>

      <label className="block text-[11px] ">
        {t("settings.language.label")}
      </label>
      <div className="flex flex-col gap-1">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => pickLanguage(opt.id)}
            className={`rounded px-3 py-2 text-left text-xs transition-colors ${
              language === opt.id
                ? "bg-blue-600/30 text-blue-200 ring-1 ring-blue-500/50"
                : "  hover:"
            }`}
          >
            {t(opt.labelKey)}
          </button>
        ))}
      </div>

      {savedToast && (
        <p className="text-[11px] text-green-400">{t("common.saved")}</p>
      )}
      <p className="text-[10px] ">
        {t("settings.language.restartHint")}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] ">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-input"
      />
    </div>
  );
}

