import { isTauri, invoke } from "@/services/tauri/invoke";
import { loadSetting } from "@/services/tauri/settings";
import { listStyleProfiles, loadDefaultStyleId } from "@/services/tauri/styles";
import { useSettingsStore } from "@/stores/settingsStore";
import { BUILT_IN_STYLES, useStyleStore } from "@/stores/styleStore";
import type { ExportPresetId, UploadProxyProfile } from "@/types";

/** Non-secret config persisted in SQLite. */
export interface StoredProviderConfig {
  baseUrl: string;
  imageModel: string;
  textModel: string;
  fallbackTextModel: string;
  visionModel?: string; // optional: existing installs won't have this set
}

export interface StoredEditingPrefs {
  uploadProxyProfile: UploadProxyProfile;
  defaultExportPreset: ExportPresetId;
}

/**
 * Initialize all persisted settings into the global store.
 * Runs once at app startup so the rest of the app sees correct values
 * regardless of whether the user has visited the Settings screen yet.
 *
 * IMPORTANT: API key is NEVER loaded into the JS layer here.
 * We only ask Rust whether one is configured and store a boolean flag.
 * Real edit/generate/validate calls have Rust load the key from secure
 * storage on demand.
 */
export async function bootstrapSettings(): Promise<void> {
  if (!isTauri()) return;

  const store = useSettingsStore.getState();

  // Provider config (non-secret)
  try {
    const config = await loadSetting<StoredProviderConfig>("provider_config");
    if (config) {
      store.setProvider({
        baseUrl: config.baseUrl,
        imageModel: config.imageModel,
        textModel: config.textModel,
        fallbackTextModel: config.fallbackTextModel,
        // Existing installs may not have a visionModel — keep the default in
        // that case rather than blanking it out.
        ...(config.visionModel ? { visionModel: config.visionModel } : {}),
      });
    }
  } catch (err) {
    console.warn("Failed to load provider config:", err);
  }

  // API key presence — boolean only, never loaded into JS state
  try {
    const has = await invoke<boolean>("has_api_key");
    store.setHasApiKey(has);
  } catch (err) {
    console.warn("Failed to check API key:", err);
  }

  // Editing / export preferences
  try {
    const prefs = await loadSetting<StoredEditingPrefs>("editing_prefs");
    if (prefs) {
      if (prefs.uploadProxyProfile) {
        store.setUploadProxyProfile(prefs.uploadProxyProfile);
      }
      if (prefs.defaultExportPreset) {
        store.setDefaultExportPreset(prefs.defaultExportPreset);
      }
    }
  } catch (err) {
    console.warn("Failed to load editing prefs:", err);
  }

  // MVP3: Style profiles — built-ins merged with persisted user styles.
  try {
    const userStyles = await listStyleProfiles();
    const styleStore = useStyleStore.getState();
    // Built-ins first, then user styles, dedup'd by id (user wins on collisions)
    const userIds = new Set(userStyles.map((s) => s.id));
    const merged = [
      ...userStyles,
      ...BUILT_IN_STYLES.filter((s) => !userIds.has(s.id)),
    ];
    styleStore.setStyles(merged);

    // Default style: prefer the explicit app_settings entry (works for
    // built-ins too), fall back to the is_default flag in the table.
    const persistedDefaultId = await loadDefaultStyleId();
    const tableDefault = userStyles.find((s) => s.isDefault);
    const resolvedDefault = persistedDefaultId ?? tableDefault?.id ?? null;
    if (resolvedDefault && merged.some((s) => s.id === resolvedDefault)) {
      styleStore.setDefaultStyleId(resolvedDefault);
    }
  } catch (err) {
    console.warn("Failed to load style profiles:", err);
  }
}
