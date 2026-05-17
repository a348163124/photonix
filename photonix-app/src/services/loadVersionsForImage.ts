import { useAppStore } from "@/stores/appStore";
import { getVersions } from "@/services/tauri/versions";
import { isTauri } from "@/services/tauri/invoke";

/**
 * Load versions for `imageId` and commit to the app store, but only if the
 * user's current selection still matches when the request resolves. This
 * avoids a race when the user quickly switches between images: a slow
 * `get_versions` call for image A would otherwise overwrite the freshly
 * loaded versions for image B that the user just selected.
 *
 * Behaviour summary:
 *  - If we're not in Tauri we skip the call entirely (no source of truth).
 *  - If the selection has changed by the time we resolve, the response is
 *    silently discarded.
 *  - Otherwise we set `currentVersions` and pick a sensible
 *    `activeVersionId` (current → first → null).
 */
export async function loadVersionsForImage(imageId: string): Promise<void> {
  if (!isTauri()) {
    if (useAppStore.getState().selectedImageId === imageId) {
      useAppStore.getState().setCurrentVersions([]);
      useAppStore.getState().setActiveVersion(null);
    }
    return;
  }

  try {
    const versions = await getVersions(imageId);
    // Race guard: don't commit results that no longer match the user's
    // current selection.
    if (useAppStore.getState().selectedImageId !== imageId) return;

    useAppStore.getState().setCurrentVersions(versions);
    const current = versions.find((v) => v.isCurrent);
    useAppStore
      .getState()
      .setActiveVersion(current?.id ?? versions[0]?.id ?? null);
  } catch (err) {
    console.error(`Failed to load versions for ${imageId}:`, err);
    if (useAppStore.getState().selectedImageId !== imageId) return;
    useAppStore.getState().setCurrentVersions([]);
    useAppStore.getState().setActiveVersion(null);
  }
}
