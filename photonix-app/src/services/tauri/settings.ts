import { invoke, isTauri } from "./invoke";

/**
 * Save a non-secret setting to SQLite.
 */
export async function saveSetting(key: string, value: unknown): Promise<void> {
  if (!isTauri()) return;
  await invoke("save_setting", { key, value: JSON.stringify(value) });
}

/**
 * Load a non-secret setting from SQLite.
 */
export async function loadSetting<T>(key: string): Promise<T | null> {
  if (!isTauri()) return null;
  const raw = await invoke<string | null>("load_setting", { key });
  if (raw === null) return null;
  return JSON.parse(raw) as T;
}

/**
 * Save API key to secure storage (NOT SQLite).
 */
export async function saveApiKey(apiKey: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("save_api_key", { apiKey });
}

/**
 * Load API key from secure storage.
 */
export async function loadApiKey(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("load_api_key");
}
