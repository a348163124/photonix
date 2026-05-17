import { invoke, isTauri } from "./invoke";

/** Save a non-secret setting to SQLite. */
export async function saveSetting(key: string, value: unknown): Promise<void> {
  if (!isTauri()) return;
  await invoke("save_setting", { key, value: JSON.stringify(value) });
}

/** Load a non-secret setting from SQLite. */
export async function loadSetting<T>(key: string): Promise<T | null> {
  if (!isTauri()) return null;
  const raw = await invoke<string | null>("load_setting", { key });
  if (raw === null) return null;
  return JSON.parse(raw) as T;
}

/**
 * Save the API key to the OS secret store (Windows Credential Manager).
 * The key never persists in JS state after this call returns.
 */
export async function saveApiKey(apiKey: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("save_api_key", { apiKey });
}

/**
 * Check whether an API key is configured.
 *
 * Note: there is no public `loadApiKey()` wrapper. Reading the actual key
 * value happens only inside Rust commands. The frontend should never need
 * the plaintext key.
 */
export async function hasApiKey(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("has_api_key");
}
