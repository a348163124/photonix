import { invoke } from "./invoke";
import type { ImageAsset } from "@/types";

interface ImportResult {
  folder_id: string;
  images_found: number;
  images_imported: number;
}

interface RawImageRow {
  id: string;
  folder_id: string | null;
  source_path: string;
  filename: string;
  extension: string;
  file_size_bytes: number;
  width: number;
  height: number;
  checksum: string | null;
  import_status: string;
  created_at: string;
  modified_at: string;
  last_seen_at: string | null;
}

interface ThumbnailResult {
  image_id: string;
  thumb_path: string;
  width: number;
  height: number;
}

/**
 * Import a folder of images into the library.
 */
export async function importFolder(
  folderPath: string,
  recursive: boolean = false
): Promise<ImportResult> {
  return invoke<ImportResult>("import_folder", {
    folderPath,
    recursive,
  });
}

/**
 * Get all images from the database.
 */
export async function getAllImages(): Promise<ImageAsset[]> {
  const rows = await invoke<RawImageRow[]>("get_all_images");
  return rows.map(mapRowToAsset);
}

/**
 * Get images for a specific folder.
 */
export async function getImagesByFolder(folderId: string): Promise<ImageAsset[]> {
  const rows = await invoke<RawImageRow[]>("get_images_by_folder", { folderId });
  return rows.map(mapRowToAsset);
}

/**
 * Generate a thumbnail for an image.
 */
export async function generateThumbnail(
  imageId: string,
  sourcePath: string
): Promise<ThumbnailResult> {
  return invoke<ThumbnailResult>("generate_thumbnail", { imageId, sourcePath });
}

/**
 * Generate a preview proxy for an image.
 */
export async function generateProxy(
  imageId: string,
  sourcePath: string
): Promise<ThumbnailResult> {
  return invoke<ThumbnailResult>("generate_proxy", { imageId, sourcePath });
}

function mapRowToAsset(row: RawImageRow): ImageAsset {
  return {
    id: row.id,
    folderId: row.folder_id,
    sourcePath: row.source_path,
    filename: row.filename,
    extension: row.extension,
    fileSizeBytes: row.file_size_bytes,
    width: row.width,
    height: row.height,
    checksum: row.checksum,
    importStatus: row.import_status as ImageAsset["importStatus"],
    createdAt: row.created_at,
    modifiedAt: row.modified_at,
  };
}
