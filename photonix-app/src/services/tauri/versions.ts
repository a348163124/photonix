import { invoke } from "./invoke";
import type { ImageVersion } from "@/types";

interface RawVersionRow {
  id: string;
  image_id: string;
  parent_version_id: string | null;
  version_kind: string;
  storage_path: string;
  width: number;
  height: number;
  file_size_bytes: number | null;
  is_current: boolean;
  created_at: string;
}

/**
 * Get all versions for an image.
 */
export async function getVersions(imageId: string): Promise<ImageVersion[]> {
  const rows = await invoke<RawVersionRow[]>("get_versions", { imageId });
  return rows.map(mapRowToVersion);
}

function mapRowToVersion(row: RawVersionRow): ImageVersion {
  return {
    id: row.id,
    imageId: row.image_id,
    parentVersionId: row.parent_version_id,
    versionKind: row.version_kind as ImageVersion["versionKind"],
    storagePath: row.storage_path,
    width: row.width,
    height: row.height,
    fileSizeBytes: row.file_size_bytes,
    isCurrent: row.is_current,
    createdAt: row.created_at,
  };
}
