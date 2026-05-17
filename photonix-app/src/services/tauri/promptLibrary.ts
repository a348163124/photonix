import { invoke, isTauri } from "./invoke";

export interface PromptLibrarySyncResult {
  success: boolean;
  provider: string;
  source_url: string;
  imported_count: number;
  skipped_count: number;
  warnings: string[];
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface PromptLibrarySyncStatus {
  provider: string;
  last_synced_at: string | null;
  last_status: string | null;
  last_error: string | null;
  imported_count: number;
  total_local_count: number;
}

/** Trigger a manual sync of the ZeroLu prompt library. */
export async function syncZeroluPromptLibrary(): Promise<PromptLibrarySyncResult> {
  if (!isTauri()) {
    throw new Error("Sync requires the desktop app.");
  }
  return invoke<PromptLibrarySyncResult>("sync_zerolu_prompt_library");
}

/** Read the most recent sync status for a given provider (e.g. "zerolu"). */
export async function getPromptLibrarySyncStatus(
  provider: string
): Promise<PromptLibrarySyncStatus> {
  if (!isTauri()) {
    return {
      provider,
      last_synced_at: null,
      last_status: null,
      last_error: null,
      imported_count: 0,
      total_local_count: 0,
    };
  }
  return invoke<PromptLibrarySyncStatus>("get_prompt_library_sync_status", { provider });
}
