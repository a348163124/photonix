/**
 * Normalize path separators to forward slashes for cross-platform consistency.
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Extract filename from a full path.
 */
export function getFilename(p: string): string {
  const normalized = normalizePath(p);
  return normalized.split("/").pop() ?? p;
}

/**
 * Extract file extension (lowercase, without dot).
 */
export function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? (parts.pop()?.toLowerCase() ?? "") : "";
}

/**
 * Check if a file extension is a supported image format.
 */
export function isSupportedImage(ext: string): boolean {
  const supported = new Set(["png", "jpg", "jpeg", "webp", "tiff", "tif", "bmp"]);
  return supported.has(ext.toLowerCase());
}
