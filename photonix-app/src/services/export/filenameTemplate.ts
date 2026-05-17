/**
 * Apply a filename template to a context. Empty / missing tokens fall back to
 * sensible placeholders. Tokens supported (PRD §33.6.3):
 *   {original_name}, {style}, {preset}, {date}, {time}, {index},
 *   {version_kind}, {ext}
 *
 * The template literal itself is also sanitized after substitution: any
 * characters that could be interpreted as path separators or drive specs are
 * replaced. This means a template like `..\{original_name}.{ext}` resolves
 * to a flat single-segment basename, never a path that escapes the output
 * directory. The Rust side enforces the same invariant as defense-in-depth.
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

  const substituted = template
    .replace(/{original_name}/g, sanitizeToken(ctx.originalName))
    .replace(/{style}/g, sanitizeToken(ctx.style ?? "default"))
    .replace(/{preset}/g, sanitizeToken(ctx.preset))
    .replace(/{date}/g, date)
    .replace(/{time}/g, time)
    .replace(/{index}/g, pad2(ctx.index))
    .replace(/{version_kind}/g, sanitizeToken(ctx.versionKind))
    .replace(/{ext}/g, sanitizeToken(ctx.ext));

  // Final basename hardening — applied to the substituted result so that
  // hostile literals in the template itself ("..\\foo", "C:foo") are
  // collapsed into a single safe segment.
  return sanitizeBasename(substituted);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Sanitize a single token value: strip path separators and reserved
 * characters, collapse whitespace.
 */
function sanitizeToken(s: string): string {
  return s.replace(/[\\/:*?"<>|\u0000]/g, "_").replace(/\s+/g, "_");
}

/**
 * Sanitize the final filename to ensure it stays a single basename.
 *
 *  - Removes path separators (`\` `/`) and drive specs (e.g. `C:`)
 *  - Strips leading dots so the result is never `.`, `..`, or hidden-only
 *  - Trims whitespace
 *  - Falls back to `export.bin` if everything is stripped away
 */
export function sanitizeBasename(name: string): string {
  // 1. Collapse path separators to underscores.
  let cleaned = name.replace(/[\\/:*?"<>|\u0000]/g, "_");
  // 2. Strip leading dots so we don't end up with "." / ".." / hidden files.
  cleaned = cleaned.replace(/^\.+/, "");
  // 3. Trim whitespace from both ends — Windows refuses trailing spaces/dots.
  cleaned = cleaned.trim().replace(/[. ]+$/, "");
  // 4. If everything was stripped, fall back to a safe default.
  if (cleaned.length === 0) return "export.bin";
  return cleaned;
}
