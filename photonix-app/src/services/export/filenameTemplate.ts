/**
 * Apply a filename template to a context. Empty / missing tokens fall back to
 * sensible placeholders. Tokens supported (PRD §33.6.3):
 *   {original_name}, {style}, {preset}, {date}, {time}, {index},
 *   {version_kind}, {ext}
 */
export interface FilenameContext {
  originalName: string;
  style: string | null;
  preset: string;
  versionKind: string;
  index: number;
  ext: string; // "jpg" | "png" | "jpeg"
}

export function applyFilenameTemplate(
  template: string,
  ctx: FilenameContext
): string {
  const now = new Date();
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;

  return template
    .replace(/{original_name}/g, sanitize(ctx.originalName))
    .replace(/{style}/g, sanitize(ctx.style ?? "default"))
    .replace(/{preset}/g, sanitize(ctx.preset))
    .replace(/{date}/g, date)
    .replace(/{time}/g, time)
    .replace(/{index}/g, pad2(ctx.index))
    .replace(/{version_kind}/g, sanitize(ctx.versionKind))
    .replace(/{ext}/g, ctx.ext);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}
