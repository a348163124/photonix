import { useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { isTauri } from "@/services/tauri/invoke";
import { saveSetting, loadSetting, saveApiKey, loadApiKey } from "@/services/tauri/settings";
import { checkProviderCompatibility } from "@/services/provider/compatibility";
import {
  EXPORT_PRESETS,
  PROXY_PROFILES,
  type ExportPresetId,
  type UploadProxyProfile,
} from "@/types";

interface StoredConfig {
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
  const setProvider = useSettingsStore((s) => s.setProvider);
  const uploadProxyProfile = useSettingsStore((s) => s.uploadProxyProfile);
  const setUploadProxyProfile = useSettingsStore((s) => s.setUploadProxyProfile);
  const defaultExportPreset = useSettingsStore((s) => s.defaultExportPreset);
  const setDefaultExportPreset = useSettingsStore((s) => s.setDefaultExportPreset);

  const [category, setCategory] = useState<SettingsCategory>("provider");
  const [saved, setSaved] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<string | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  // Load all settings on mount
  useEffect(() => {
    if (!isTauri()) return;
    loadSetting<StoredConfig>("provider_config").then((config) => {
      if (config) {
        setProvider({
          baseUrl: config.baseUrl,
          imageModel: config.imageModel,
          textModel: config.textModel,
          fallbackTextModel: config.fallbackTextModel,
        });
      }
    });
    loadApiKey().then((key) => {
      if (key) setProvider({ apiKey: key });
    });
    loadSetting<StoredEditingPrefs>("editing_prefs").then((prefs) => {
      if (prefs) {
        setUploadProxyProfile(prefs.uploadProxyProfile);
        setDefaultExportPreset(prefs.defaultExportPreset);
      }
    });
  }, []);

  async function handleSave() {
    if (isTauri()) {
      const config: StoredConfig = {
        baseUrl: provider.baseUrl,
        imageModel: provider.imageModel,
        textModel: provider.textModel,
        fallbackTextModel: provider.fallbackTextModel,
      };
      await saveSetting("provider_config", config);
      await saveApiKey(provider.apiKey);

      const prefs: StoredEditingPrefs = {
        uploadProxyProfile,
        defaultExportPreset,
      };
      await saveSetting("editing_prefs", prefs);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleValidate() {
    setValidating(true);
    setValidationResult(null);
    setValidationWarnings([]);
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
  saved,
  validating,
  validationResult,
  validationWarnings,
  onSave,
  onValidate,
}: {
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
      <Field
        label="API Key"
        value={provider.apiKey}
        onChange={(v) => setProvider({ apiKey: v })}
        type="password"
        placeholder="sk-..."
      />

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
          disabled={validating || !provider.apiKey}
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
        API keys are stored in a separate encrypted file outside the database.
        Model configuration is stored locally in SQLite. Keys are never logged or
        sent anywhere except the configured provider URL.
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
