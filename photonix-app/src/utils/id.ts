/**
 * Generate a UUID v4 string.
 * Uses crypto.randomUUID when available (modern browsers and Tauri webview).
 */
export function generateId(): string {
  return crypto.randomUUID();
}
