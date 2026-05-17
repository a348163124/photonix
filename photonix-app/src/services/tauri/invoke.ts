/**
 * Tauri invoke wrapper.
 * In development without Tauri, falls back to mock data.
 * In production Tauri app, uses the real invoke API.
 */

interface TauriWindow {
  __TAURI_INTERNALS__?: {
    invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
}

function isTauri(): boolean {
  return !!(window as unknown as TauriWindow).__TAURI_INTERNALS__;
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args);
  }
  // Fallback for browser dev mode
  console.warn(`[mock] invoke("${cmd}") - Tauri not available`);
  throw new Error(`Tauri not available. Command: ${cmd}`);
}

export { isTauri };
