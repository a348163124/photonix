import { invoke, isTauri } from "./invoke";
import type {
  PromptTemplate,
  PromptTemplateMode,
} from "@/types";

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
  };
}

export interface ListPromptTemplatesArgs {
  mode?: PromptTemplateMode;
  category?: string;
  favoritesOnly?: boolean;
  query?: string;
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

export async function seedBuiltinPromptTemplates(): Promise<number> {
  if (!isTauri()) return 0;
  return invoke<number>("seed_builtin_prompt_templates");
}
