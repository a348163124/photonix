import { useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
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
}

interface StoredEditingPrefs {
  uploadProxyProfile: UploadProxyProfile;
  defaultExportPreset: ExportPresetId;
}

type SettingsCategory = "provider" | "editing" | "export";

const CATEGORIES: { id: SettingsCategory; label: string }[] = [
  { id: "provider", label: "Provider & Models" },
  { id: "editing", label: "Editing" },
  { id: "export", label: "Export" },
];

export function SettingsScreen() {
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
    const ok = window.confirm(
      "Remove the saved API key from this computer's secret store?"
    );
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
        `Failed to save settings before validating: ${err instanceof Error ? err.message : String(err)}`
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
          `Failed to save key before validating: ${err instanceof Error ? err.message : String(err)}`
        );
        setValidating(false);
        return;
      }
    }

    const result = await checkProviderCompatibility(provider);
    if (result.error) {
      setValidationResult(result.error);
    } else if (result.connected) {
      setValidationResult("Connection successful");
      setValidationWarnings(result.warnings);
    }
    setValidating(false);
  }

  return (
    <div className="flex h-full">
      <nav className="w-44 border-r border-neutral-800 p-3">
        <ul className="flex flex-col gap-1">
          {CATEGORIES.map((cat) => (
            <li key={cat.id}>
              <button
                onClick={() => setCategory(cat.id)}
                className={`w-full rounded px-2 py-1 text-left text-xs transition-colors ${
                  category === cat.id
                    ? "bg-neutral-800 text-neutral-200"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                }`}
              >
                {cat.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex-1 overflow-y-auto p-6">
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
  const provider = useSettingsStore((s) => s.provider);
  const setProvider = useSettingsStore((s) => s.setProvider);

  return (
    <div className="flex max-w-md flex-col gap-4">
      <h2 className="text-sm font-medium text-neutral-200">Provider Configuration</h2>

      <Field
        label="Base URL"
        value={provider.baseUrl}
        onChange={(v) => setProvider({ baseUrl: v })}
        placeholder="https://api.openai.com/v1"
      />

      {/* API key — local-only field */}
      <div>
        <label className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
          <span>API Key</span>
          {hasKey && (
            <span className="text-[10px] text-green-400">✓ Saved</span>
          )}
        </label>
        <input
          type="password"
          value={apiKeyDraft}
          onChange={(e) => setApiKeyDraft(e.target.value)}
          placeholder={hasKey ? "•••••••• (already saved — type to replace)" : "sk-..."}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:ring-1 focus:ring-neutral-600"
        />
        {hasKey && (
          <button
            onClick={onClearKey}
            className="mt-1 text-[10px] text-neutral-500 hover:text-red-400"
          >
            Clear saved key
          </button>
        )}
      </div>

      <div className="border-t border-neutral-800 pt-4">
        <h3 className="mb-3 text-xs font-medium text-neutral-300">Models</h3>
      </div>

      <Field
        label="Image Model"
        value={provider.imageModel}
        onChange={(v) => setProvider({ imageModel: v })}
      />
      <Field
        label="Text Model (Prompt Compiler)"
        value={provider.textModel}
        onChange={(v) => setProvider({ textModel: v })}
      />
      <Field
        label="Fallback Text Model"
        value={provider.fallbackTextModel}
        onChange={(v) => setProvider({ fallbackTextModel: v })}
      />

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={onSave}
          className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
        >
          {saved ? "✓ Saved" : "Save Settings"}
        </button>
        <button
          onClick={onValidate}
          disabled={validating || (!hasKey && !apiKeyDraft)}
          className="rounded bg-neutral-700 px-4 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-600 transition-colors disabled:opacity-40"
        >
          {validating ? "Validating..." : "Validate Connection"}
        </button>
      </div>

      {validationResult && (
        <p
          className={`text-xs ${
            validationResult.startsWith("Connection")
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

      <p className="text-[10px] text-neutral-600 mt-2">
        Your API key is stored in the Windows Credential Manager (or your platform's
        equivalent secret store). It is never written to the database, never logged,
        and is read only by the native layer when an edit, generation, or validation
        request needs it.
      </p>
    </div>
  );
}

function EditingSection({ saved, onSave }: { saved: boolean; onSave: () => void }) {
  const uploadProxyProfile = useSettingsStore((s) => s.uploadProxyProfile);
  const setUploadProxyProfile = useSettingsStore((s) => s.setUploadProxyProfile);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h2 className="text-sm font-medium text-neutral-200">Editing</h2>
      <p className="text-[11px] text-neutral-500">
        AI edit requests upload a compressed proxy of your photo. This profile
        controls how large that proxy can be. Original files are never modified.
      </p>

      <label className="block text-[11px] text-neutral-400">Upload Proxy Profile</label>
      <div className="flex flex-col gap-1">
        {PROXY_PROFILES.map((p) => (
          <button
            key={p.id}
            onClick={() => setUploadProxyProfile(p.id)}
            className={`rounded px-3 py-2 text-left text-xs transition-colors ${
              uploadProxyProfile === p.id
                ? "bg-blue-600/30 text-blue-200 ring-1 ring-blue-500/50"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{p.label}</span>
              <span className="text-[10px] text-neutral-500">
                {p.longEdge}px · ≤{Math.round(p.maxBytes / (1024 * 1024))}MB
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-neutral-500">{p.description}</div>
          </button>
        ))}
      </div>

      <button
        onClick={onSave}
        className="mt-2 w-fit rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
      >
        {saved ? "✓ Saved" : "Save Settings"}
      </button>
    </div>
  );
}

function ExportSection({ saved, onSave }: { saved: boolean; onSave: () => void }) {
  const defaultExportPreset = useSettingsStore((s) => s.defaultExportPreset);
  const setDefaultExportPreset = useSettingsStore((s) => s.setDefaultExportPreset);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h2 className="text-sm font-medium text-neutral-200">Export</h2>
      <p className="text-[11px] text-neutral-500">
        Choose the default export preset. You can still override it on each export.
      </p>

      <label className="block text-[11px] text-neutral-400">Default Export Preset</label>
      <div className="flex flex-col gap-1">
        {EXPORT_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setDefaultExportPreset(p.id)}
            className={`rounded px-3 py-2 text-left text-xs transition-colors ${
              defaultExportPreset === p.id
                ? "bg-blue-600/30 text-blue-200 ring-1 ring-blue-500/50"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}
          >
            <div className="font-medium">{p.label}</div>
            <div className="mt-0.5 text-[10px] text-neutral-500">{p.description}</div>
          </button>
        ))}
      </div>

      <button
        onClick={onSave}
        className="mt-2 w-fit rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
      >
        {saved ? "✓ Saved" : "Save Settings"}
      </button>
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
      <label className="mb-1 block text-[11px] text-neutral-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:ring-1 focus:ring-neutral-600"
      />
    </div>
  );
}
