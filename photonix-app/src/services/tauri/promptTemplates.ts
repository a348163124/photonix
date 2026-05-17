import { invoke, isTauri } from "./invoke";
import type { PromptTemplate, PromptTemplateMode } from "@/types";

interface RawPromptTemplateRow {
  id: string;
  mode: string;
  category: string;
  title: string;
  description: string | null;
  prompt: string;
  negative_prompt: string | null;
  tags_json: string | null;
  language: string;
  source_name: string | null;
  source_url: string | null;
  is_builtin: boolean;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  // MVP5 extensions
  external_id: string | null;
  provider: string | null;
  upstream_category: string | null;
  source_repository: string | null;
  source_original_url: string | null;
  preview_image_url: string | null;
  usage_count: number;
  last_used_at: string | null;
  imported_at: string | null;
  synced_at: string | null;
  content_filter_status: string;
  content_filter_notes: string | null;
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((t) => String(t)) : [];
  } catch {
    return [];
  }
}

function rowToTemplate(row: RawPromptTemplateRow): PromptTemplate {
  return {
    id: row.id,
    mode: row.mode as PromptTemplateMode,
    category: row.category,
    title: row.title,
    description: row.description ?? undefined,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt ?? undefined,
    tags: parseTags(row.tags_json),
    language: (row.language as PromptTemplate["language"]) ?? "en",
    sourceName: row.source_name ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    isBuiltin: row.is_builtin,
    isFavorite: row.is_favorite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    externalId: row.external_id ?? undefined,
    provider: row.provider ?? undefined,
    upstreamCategory: row.upstream_category ?? undefined,
    sourceRepository: row.source_repository ?? undefined,
    sourceOriginalUrl: row.source_original_url ?? undefined,
    previewImageUrl: row.preview_image_url ?? undefined,
    usageCount: row.usage_count,
    lastUsedAt: row.last_used_at ?? undefined,
    importedAt: row.imported_at ?? undefined,
    syncedAt: row.synced_at ?? undefined,
    contentFilterStatus: (row.content_filter_status as PromptTemplate["contentFilterStatus"]) ?? "unreviewed",
    contentFilterNotes: row.content_filter_notes ?? undefined,
  };
}

function templateToRow(t: PromptTemplate): RawPromptTemplateRow {
  return {
    id: t.id,
    mode: t.mode,
    category: t.category,
    title: t.title,
    description: t.description ?? null,
    prompt: t.prompt,
    negative_prompt: t.negativePrompt ?? null,
    tags_json: JSON.stringify(t.tags ?? []),
    language: t.language,
    source_name: t.sourceName ?? null,
    source_url: t.sourceUrl ?? null,
    is_builtin: t.isBuiltin,
    is_favorite: t.isFavorite,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    external_id: t.externalId ?? null,
    provider: t.provider ?? null,
    upstream_category: t.upstreamCategory ?? null,
    source_repository: t.sourceRepository ?? null,
    source_original_url: t.sourceOriginalUrl ?? null,
    preview_image_url: t.previewImageUrl ?? null,
    usage_count: t.usageCount ?? 0,
    last_used_at: t.lastUsedAt ?? null,
    imported_at: t.importedAt ?? null,
    synced_at: t.syncedAt ?? null,
    content_filter_status: t.contentFilterStatus ?? "unreviewed",
    content_filter_notes: t.contentFilterNotes ?? null,
  };
}

export interface ListPromptTemplatesArgs {
  mode?: PromptTemplateMode;
  category?: string;
  favoritesOnly?: boolean;
  query?: string;
  /** Filter to a specific provider (e.g. "zerolu"). */
  provider?: string;
  /** Only include rows where provider is null (user/built-in templates). */
  localOnly?: boolean;
  /** "title" (default), "usage_count", "last_used_at", "imported_at" */
  orderBy?: "title" | "usage_count" | "last_used_at" | "imported_at";
  limit?: number;
}

export async function listPromptTemplates(
  args?: ListPromptTemplatesArgs
): Promise<PromptTemplate[]> {
  if (!isTauri()) return [];
  const rows = await invoke<RawPromptTemplateRow[]>("list_prompt_templates", {
    args: args
      ? {
          mode: args.mode ?? null,
          category: args.category ?? null,
          favorites_only: args.favoritesOnly ?? null,
          query: args.query ?? null,
          provider: args.provider ?? null,
          local_only: args.localOnly ?? null,
          order_by: args.orderBy ?? null,
          limit: args.limit ?? null,
        }
      : null,
  });
  return rows.map(rowToTemplate);
}

export async function upsertPromptTemplate(t: PromptTemplate): Promise<void> {
  if (!isTauri()) return;
  await invoke("upsert_prompt_template", { template: templateToRow(t) });
}

export async function deletePromptTemplate(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_prompt_template", { id });
}

export async function setPromptTemplateFavorite(
  id: string,
  isFavorite: boolean
): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_prompt_template_favorite", { id, isFavorite });
}

export async function recordPromptTemplateUse(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("record_prompt_template_use", { id });
}

export async function seedBuiltinPromptTemplates(): Promise<number> {
  if (!isTauri()) return 0;
  return invoke<number>("seed_builtin_prompt_templates");
}
