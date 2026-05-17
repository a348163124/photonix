import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/i18n";
import { usePromptTemplateStore } from "@/stores/promptTemplateStore";
import { useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";
import { useGenerateStore } from "@/stores/generateStore";
import {
  deletePromptTemplate,
  listPromptTemplates,
  setPromptTemplateFavorite,
  upsertPromptTemplate,
} from "@/services/tauri/promptTemplates";
import { isTauri } from "@/services/tauri/invoke";
import { toast } from "@/components/ui/Toast";
import {
  PROMPT_CENTER_CATEGORIES,
  type PromptTemplate,
  type PromptTemplateMode,
} from "@/types";

export function PromptCenterScreen() {
  const { t } = useTranslation();
  const templates = usePromptTemplateStore((s) => s.templates);
  const setTemplates = usePromptTemplateStore((s) => s.setTemplates);
  const addTemplate = usePromptTemplateStore((s) => s.addTemplate);
  const updateTemplate = usePromptTemplateStore((s) => s.updateTemplate);
  const removeTemplate = usePromptTemplateStore((s) => s.removeTemplate);

  const modeFilter = usePromptTemplateStore((s) => s.modeFilter);
  const setModeFilter = usePromptTemplateStore((s) => s.setModeFilter);
  const categoryFilter = usePromptTemplateStore((s) => s.categoryFilter);
  const setCategoryFilter = usePromptTemplateStore((s) => s.setCategoryFilter);
  const favoritesOnly = usePromptTemplateStore((s) => s.favoritesOnly);
  const setFavoritesOnly = usePromptTemplateStore((s) => s.setFavoritesOnly);
  const searchQuery = usePromptTemplateStore((s) => s.searchQuery);
  const setSearchQuery = usePromptTemplateStore((s) => s.setSearchQuery);

  const selectedId = usePromptTemplateStore((s) => s.selectedId);
  const setSelectedId = usePromptTemplateStore((s) => s.setSelectedId);
  const applyTarget = usePromptTemplateStore((s) => s.applyTarget);
  const setApplyTarget = usePromptTemplateStore((s) => s.setApplyTarget);

  const setView = useAppStore((s) => s.setView);
  const setEditorPrompt = useEditorStore((s) => s.setPrompt);
  const editorPrompt = useEditorStore((s) => s.prompt);
  const setGeneratePrompt = useGenerateStore((s) => s.setPrompt);
  const generatePrompt = useGenerateStore((s) => s.prompt);

  const [editingDraft, setEditingDraft] = useState<PromptTemplate | null>(null);

  // Initial load + reload when search/filters change. Server-side filtering
  // keeps the list small even with many user templates.
  useEffect(() => {
    if (!isTauri()) return;
    void loadTemplates();
  }, [modeFilter, categoryFilter, favoritesOnly, searchQuery]);

  async function loadTemplates() {
    try {
      const list = await listPromptTemplates({
        mode: modeFilter === "all" ? undefined : modeFilter,
        category: categoryFilter === "all" ? undefined : categoryFilter,
        favoritesOnly,
        query: searchQuery,
      });
      setTemplates(list);
      if (selectedId && !list.some((tpl) => tpl.id === selectedId)) {
        setSelectedId(list[0]?.id ?? null);
      } else if (!selectedId && list.length > 0) {
        setSelectedId(list[0]!.id);
      }
    } catch (err) {
      console.error("Failed to load prompt templates:", err);
    }
  }

  const selected = useMemo(
    () => templates.find((tpl) => tpl.id === selectedId) ?? null,
    [templates, selectedId]
  );

  async function handleToggleFavorite(tpl: PromptTemplate) {
    const next = !tpl.isFavorite;
    updateTemplate(tpl.id, { isFavorite: next });
    try {
      await setPromptTemplateFavorite(tpl.id, next);
    } catch (err) {
      updateTemplate(tpl.id, { isFavorite: tpl.isFavorite });
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  async function handleDelete(tpl: PromptTemplate) {
    if (tpl.isBuiltin) return;
    if (!confirm(t("promptCenter.confirmDelete", { title: tpl.title }))) return;
    try {
      await deletePromptTemplate(tpl.id);
      removeTemplate(tpl.id);
      toast(t("toast.deleted"), "info");
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  async function handleCopy(tpl: PromptTemplate) {
    try {
      await navigator.clipboard.writeText(tpl.prompt);
      toast(t("promptCenter.promptCopied"), "success", 1500);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  function applyToTarget(tpl: PromptTemplate, target: "generate" | "editor") {
    const existing = target === "generate" ? generatePrompt : editorPrompt;
    if (existing.trim().length > 0) {
      const ok = confirm(t("promptCenter.replaceConfirm"));
      if (!ok) return;
    }
    if (target === "generate") {
      setGeneratePrompt(tpl.prompt);
      setView("generate");
      toast(t("promptCenter.appliedToGenerate"), "success", 1500);
    } else {
      setEditorPrompt(tpl.prompt);
      setView("editor");
      toast(t("promptCenter.appliedToEditor"), "success", 1500);
    }
    setApplyTarget(null);
  }

  function startNewTemplate() {
    const now = new Date().toISOString();
    const draft: PromptTemplate = {
      id: `tpl-user-${crypto.randomUUID()}`,
      mode: "generate",
      category: "landscape",
      title: "",
      description: "",
      prompt: "",
      negativePrompt: "",
      tags: [],
      language: "en",
      isBuiltin: false,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    };
    setEditingDraft(draft);
  }

  async function saveDraft() {
    if (!editingDraft) return;
    if (!editingDraft.title.trim() || !editingDraft.prompt.trim()) {
      toast(t("promptCenter.validationRequired"), "info");
      return;
    }
    const next: PromptTemplate = {
      ...editingDraft,
      updatedAt: new Date().toISOString(),
    };
    try {
      await upsertPromptTemplate(next);
      addTemplate(next);
      setSelectedId(next.id);
      setEditingDraft(null);
      toast(t("toast.saved"), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  return (
    <div className="flex h-full">
      {/* Left rail: filters + list */}
      <div className="flex w-80 flex-col border-r border-neutral-800 bg-neutral-900">
        <div className="border-b border-neutral-800 px-3 py-2">
          <h2 className="text-sm font-medium text-neutral-200">
            {t("promptCenter.heading")}
          </h2>
        </div>

        {/* Search */}
        <div className="border-b border-neutral-800 px-3 py-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("promptCenter.searchPlaceholder")}
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 border-b border-neutral-800 px-3 py-2">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
              {t("promptCenter.modeFilter")}
            </label>
            <div className="flex flex-wrap gap-1">
              {(["all", "generate", "edit", "both"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setModeFilter(m)}
                  className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
                    modeFilter === m
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                  }`}
                >
                  {m === "all"
                    ? t("common.all")
                    : t(`promptCenter.modes.${m}` as never)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
              {t("promptCenter.categoryFilter")}
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded bg-neutral-800 px-2 py-1 text-[11px] text-neutral-200"
            >
              <option value="all">{t("common.all")}</option>
              {PROMPT_CENTER_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`promptCenter.categories.${c}` as never)}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-neutral-400">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(e) => setFavoritesOnly(e.target.checked)}
              className="rounded accent-blue-500"
            />
            {t("promptCenter.favoritesOnly")}
          </label>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-1">
          {templates.length === 0 ? (
            <p className="px-3 py-4 text-center text-[10px] text-neutral-600">
              {searchQuery || modeFilter !== "all" || categoryFilter !== "all" || favoritesOnly
                ? t("promptCenter.emptyFiltered")
                : t("promptCenter.empty")}
            </p>
          ) : (
            templates.map((tpl) => (
              <TemplateRow
                key={tpl.id}
                template={tpl}
                selected={selectedId === tpl.id}
                onSelect={() => setSelectedId(tpl.id)}
                onToggleFavorite={() => handleToggleFavorite(tpl)}
              />
            ))
          )}
        </div>

        <div className="border-t border-neutral-800 p-2">
          <button
            onClick={startNewTemplate}
            className="w-full rounded bg-neutral-800 px-2 py-1 text-[11px] text-neutral-300 hover:bg-neutral-700"
          >
            + {t("promptCenter.new")}
          </button>
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto p-4">
        {editingDraft ? (
          <TemplateEditor
            draft={editingDraft}
            onChange={setEditingDraft}
            onCancel={() => setEditingDraft(null)}
            onSave={saveDraft}
          />
        ) : selected ? (
          <TemplateDetail
            template={selected}
            applyTarget={applyTarget}
            onCopy={() => handleCopy(selected)}
            onDelete={() => handleDelete(selected)}
            onApplyToGenerate={() => applyToTarget(selected, "generate")}
            onApplyToEditor={() => applyToTarget(selected, "editor")}
          />
        ) : (
          <p className="text-xs text-neutral-500">
            {t("promptCenter.detail.noTemplate")}
          </p>
        )}
      </div>
    </div>
  );
}

function TemplateRow({
  template,
  selected,
  onSelect,
  onToggleFavorite,
}: {
  template: PromptTemplate;
  selected: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const { t } = useTranslation();
  const categoryLabel = PROMPT_CENTER_CATEGORIES.includes(template.category)
    ? t(`promptCenter.categories.${template.category}` as never)
    : template.category;

  return (
    <button
      onClick={onSelect}
      className={`group flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors ${
        selected ? "bg-neutral-700" : "hover:bg-neutral-800"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="truncate text-[12px] text-neutral-200">{template.title}</span>
          <ModeBadge mode={template.mode} />
          {template.isBuiltin ? (
            <span className="rounded bg-neutral-700 px-1 py-0 text-[8px] font-medium text-neutral-400">
              {t("promptCenter.builtInBadge")}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 line-clamp-1 text-[10px] text-neutral-500">
          {template.description || template.prompt}
        </div>
        <div className="mt-0.5 text-[9px] text-neutral-600">{categoryLabel}</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className="shrink-0 text-[12px]"
        aria-label={
          template.isFavorite ? t("promptCenter.unfavoriteAction") : t("promptCenter.favoriteAction")
        }
        title={
          template.isFavorite ? t("promptCenter.unfavoriteAction") : t("promptCenter.favoriteAction")
        }
      >
        {template.isFavorite ? "★" : "☆"}
      </button>
    </button>
  );
}

function ModeBadge({ mode }: { mode: PromptTemplateMode }) {
  const { t } = useTranslation();
  const styles: Record<PromptTemplateMode, string> = {
    generate: "bg-blue-700/40 text-blue-200",
    edit: "bg-green-700/40 text-green-200",
    both: "bg-purple-700/40 text-purple-200",
  };
  return (
    <span className={`rounded px-1 py-0 text-[8px] font-medium ${styles[mode]}`}>
      {t(`promptCenter.modes.${mode}` as never)}
    </span>
  );
}

function TemplateDetail({
  template,
  applyTarget,
  onCopy,
  onDelete,
  onApplyToGenerate,
  onApplyToEditor,
}: {
  template: PromptTemplate;
  applyTarget: "generate" | "editor" | null;
  onCopy: () => void;
  onDelete: () => void;
  onApplyToGenerate: () => void;
  onApplyToEditor: () => void;
}) {
  const { t } = useTranslation();
  const categoryLabel = PROMPT_CENTER_CATEGORIES.includes(template.category)
    ? t(`promptCenter.categories.${template.category}` as never)
    : template.category;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-neutral-100">
            {template.title}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-500">
            <span className="rounded bg-neutral-800 px-1.5 py-0.5">
              {t("promptCenter.detail.modeLabel")}:{" "}
              {t(`promptCenter.modes.${template.mode}` as never)}
            </span>
            <span className="rounded bg-neutral-800 px-1.5 py-0.5">
              {t("promptCenter.detail.categoryLabel")}: {categoryLabel}
            </span>
            {template.isBuiltin && (
              <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-neutral-300">
                {t("promptCenter.builtInBadge")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCopy}
            className="rounded bg-neutral-800 px-2 py-1 text-[11px] text-neutral-300 hover:bg-neutral-700"
          >
            {t("promptCenter.copyPrompt")}
          </button>
          {!template.isBuiltin && (
            <button
              onClick={onDelete}
              className="rounded bg-red-700/60 px-2 py-1 text-[11px] text-red-100 hover:bg-red-700"
              title={t("promptCenter.deleteCustom")}
            >
              {t("common.delete")}
            </button>
          )}
        </div>
      </div>

      {template.description && (
        <p className="text-xs text-neutral-400">{template.description}</p>
      )}

      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
          {t("promptCenter.detail.promptLabel")}
        </label>
        <pre className="whitespace-pre-wrap rounded bg-neutral-800 p-2 text-[12px] leading-relaxed text-neutral-200">
          {template.prompt}
        </pre>
      </div>

      {template.negativePrompt && (
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
            {t("promptCenter.detail.negativePromptLabel")}
          </label>
          <pre className="whitespace-pre-wrap rounded bg-neutral-800 p-2 text-[11px] text-neutral-300">
            {template.negativePrompt}
          </pre>
        </div>
      )}

      {template.tags.length > 0 && (
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
            {t("promptCenter.detail.tagsLabel")}
          </label>
          <div className="flex flex-wrap gap-1">
            {template.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {(template.sourceName || template.sourceUrl) && (
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
            {t("promptCenter.detail.sourceLabel")}
          </label>
          {template.sourceUrl ? (
            <a
              href={template.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-blue-400 hover:underline"
            >
              {template.sourceName ?? template.sourceUrl}
            </a>
          ) : (
            <span className="text-[11px] text-neutral-300">{template.sourceName}</span>
          )}
        </div>
      )}

      {/* Apply actions */}
      <div className="mt-2 flex items-center gap-2 border-t border-neutral-800 pt-3">
        {(template.mode === "generate" || template.mode === "both") && (
          <button
            onClick={onApplyToGenerate}
            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              applyTarget === "generate"
                ? "bg-blue-600 text-white hover:bg-blue-500"
                : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
            }`}
          >
            {t("promptCenter.applyToGenerate")}
          </button>
        )}
        {(template.mode === "edit" || template.mode === "both") && (
          <button
            onClick={onApplyToEditor}
            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              applyTarget === "editor"
                ? "bg-blue-600 text-white hover:bg-blue-500"
                : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
            }`}
          >
            {t("promptCenter.applyToEditor")}
          </button>
        )}
      </div>
    </div>
  );
}

function TemplateEditor({
  draft,
  onChange,
  onCancel,
  onSave,
}: {
  draft: PromptTemplate;
  onChange: (next: PromptTemplate) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-neutral-200">
        {t("promptCenter.new")}
      </h2>

      <input
        value={draft.title}
        onChange={(e) => onChange({ ...draft, title: e.target.value })}
        placeholder={t("promptCenter.newPlaceholders.title")}
        className="w-full rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-500"
      />
      <input
        value={draft.description ?? ""}
        onChange={(e) => onChange({ ...draft, description: e.target.value })}
        placeholder={t("promptCenter.newPlaceholders.description")}
        className="w-full rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-500"
      />

      <div className="grid grid-cols-2 gap-2">
        <select
          value={draft.mode}
          onChange={(e) =>
            onChange({ ...draft, mode: e.target.value as PromptTemplateMode })
          }
          className="rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200"
        >
          <option value="generate">{t("promptCenter.modes.generate")}</option>
          <option value="edit">{t("promptCenter.modes.edit")}</option>
          <option value="both">{t("promptCenter.modes.both")}</option>
        </select>
        <select
          value={draft.category}
          onChange={(e) => onChange({ ...draft, category: e.target.value })}
          className="rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200"
        >
          {PROMPT_CENTER_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`promptCenter.categories.${c}` as never)}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={draft.prompt}
        onChange={(e) => onChange({ ...draft, prompt: e.target.value })}
        rows={6}
        placeholder={t("promptCenter.newPlaceholders.prompt")}
        className="w-full resize-none rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-500"
      />
      <textarea
        value={draft.negativePrompt ?? ""}
        onChange={(e) => onChange({ ...draft, negativePrompt: e.target.value })}
        rows={2}
        placeholder={t("promptCenter.newPlaceholders.negativePrompt")}
        className="w-full resize-none rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-500"
      />
      <input
        value={draft.tags.join(", ")}
        onChange={(e) =>
          onChange({
            ...draft,
            tags: e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        placeholder={t("promptCenter.newPlaceholders.tags")}
        className="w-full rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 placeholder-neutral-500"
      />

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700"
        >
          {t("common.cancel")}
        </button>
        <button
          onClick={onSave}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
        >
          {t("promptCenter.save")}
        </button>
      </div>
    </div>
  );
}
