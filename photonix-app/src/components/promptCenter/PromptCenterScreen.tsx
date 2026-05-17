import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/i18n";
import { useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";
import { useGenerateStore } from "@/stores/generateStore";
import { usePromptTemplateStore } from "@/stores/promptTemplateStore";
import {
  deletePromptTemplate,
  listPromptTemplates,
  recordPromptTemplateUse,
  setPromptTemplateFavorite,
  upsertPromptTemplate,
  type ListPromptTemplatesArgs,
} from "@/services/tauri/promptTemplates";
import {
  getPromptLibrarySyncStatus,
  syncZeroluPromptLibrary,
  type PromptLibrarySyncStatus,
} from "@/services/tauri/promptLibrary";
import { isTauri } from "@/services/tauri/invoke";
import { toast } from "@/components/ui/Toast";
import {
  CopyIcon,
  ExternalLinkIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  StarIcon,
} from "@/components/layout/NavIcons";
import {
  PROMPT_LIBRARY_CATEGORIES,
  type PromptLibraryCategory,
  type PromptTemplate,
  type PromptTemplateMode,
} from "@/types";

type TabId = "my" | "library" | "favorites" | "recents";

const TAB_DEFS: { id: TabId; tKey: string }[] = [
  { id: "my", tKey: "promptCenter.tabs.myTemplates" },
  { id: "library", tKey: "promptCenter.tabs.zeroluLibrary" },
  { id: "favorites", tKey: "promptCenter.tabs.favorites" },
  { id: "recents", tKey: "promptCenter.tabs.recents" },
];

export function PromptCenterScreen() {
  const { t } = useTranslation();

  const setView = useAppStore((s) => s.setView);
  const setEditorPrompt = useEditorStore((s) => s.setPrompt);
  const editorPrompt = useEditorStore((s) => s.prompt);
  const setGeneratePrompt = useGenerateStore((s) => s.setPrompt);
  const generatePrompt = useGenerateStore((s) => s.prompt);

  const applyTarget = usePromptTemplateStore((s) => s.applyTarget);
  const setApplyTarget = usePromptTemplateStore((s) => s.setApplyTarget);

  const [tab, setTab] = useState<TabId>("my");
  const [search, setSearch] = useState("");
  const [libraryCategory, setLibraryCategory] = useState<PromptLibraryCategory>("all");
  const [selected, setSelected] = useState<PromptTemplate | null>(null);
  const [editingDraft, setEditingDraft] = useState<PromptTemplate | null>(null);

  // ── Data loaders ────────────────────────────────────────────────────────
  const [myTemplates, setMyTemplates] = useState<PromptTemplate[]>([]);
  const [hotLibrary, setHotLibrary] = useState<PromptTemplate[]>([]);
  const [recentLibrary, setRecentLibrary] = useState<PromptTemplate[]>([]);
  const [favorites, setFavorites] = useState<PromptTemplate[]>([]);
  const [recents, setRecents] = useState<PromptTemplate[]>([]);

  const [syncStatus, setSyncStatus] = useState<PromptLibrarySyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    void refreshAll();
    void getPromptLibrarySyncStatus("zerolu")
      .then(setSyncStatus)
      .catch(() => setSyncStatus(null));
  }, []);

  // Reload the active tab whenever filters change
  useEffect(() => {
    if (!isTauri()) return;
    if (tab === "my") void loadMyTemplates();
    if (tab === "library") void loadLibrary();
    if (tab === "favorites") void loadFavorites();
    if (tab === "recents") void loadRecents();
  }, [tab, search, libraryCategory]);

  async function refreshAll() {
    await Promise.allSettled([
      loadMyTemplates(),
      loadLibrary(),
      loadFavorites(),
      loadRecents(),
    ]);
  }

  async function loadMyTemplates() {
    const list = await listPromptTemplates({
      localOnly: true,
      query: search || undefined,
      orderBy: "title",
    });
    setMyTemplates(list);
  }

  async function loadLibrary() {
    const args: ListPromptTemplatesArgs = {
      provider: "zerolu",
      query: search || undefined,
    };
    if (libraryCategory !== "all") {
      args.category = libraryCategory;
    }
    // Hot recommendations: top usage_count then favorited then most recently imported
    const hotArgs: ListPromptTemplatesArgs = {
      ...args,
      orderBy: "usage_count",
      limit: 12,
    };
    const recentArgs: ListPromptTemplatesArgs = {
      ...args,
      orderBy: "last_used_at",
      limit: 8,
    };

    const [hot, recent] = await Promise.all([
      listPromptTemplates(hotArgs),
      listPromptTemplates(recentArgs),
    ]);
    setHotLibrary(hot);
    setRecentLibrary(recent.filter((t) => !!t.lastUsedAt));
  }

  async function loadFavorites() {
    const list = await listPromptTemplates({
      favoritesOnly: true,
      query: search || undefined,
      orderBy: "title",
    });
    setFavorites(list);
  }

  async function loadRecents() {
    const list = await listPromptTemplates({
      orderBy: "last_used_at",
      query: search || undefined,
      limit: 30,
    });
    setRecents(list.filter((t) => !!t.lastUsedAt));
  }

  // ── Actions ────────────────────────────────────────────────────────────
  async function handleToggleFavorite(tpl: PromptTemplate) {
    const next = !tpl.isFavorite;
    const update = (t: PromptTemplate) =>
      t.id === tpl.id ? { ...t, isFavorite: next } : t;
    setMyTemplates((p) => p.map(update));
    setHotLibrary((p) => p.map(update));
    setRecentLibrary((p) => p.map(update));
    setFavorites((p) =>
      next ? [...p, { ...tpl, isFavorite: true }] : p.filter((x) => x.id !== tpl.id)
    );
    setRecents((p) => p.map(update));
    if (selected?.id === tpl.id) setSelected({ ...tpl, isFavorite: next });

    try {
      await setPromptTemplateFavorite(tpl.id, next);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
      void refreshAll();
    }
  }

  async function handleDelete(tpl: PromptTemplate) {
    if (tpl.isBuiltin || tpl.provider) return;
    if (!confirm(t("promptCenter.confirmDelete", { title: tpl.title }))) return;
    try {
      await deletePromptTemplate(tpl.id);
      toast(t("toast.deleted"), "info");
      if (selected?.id === tpl.id) setSelected(null);
      await refreshAll();
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

  async function applyToTarget(
    tpl: PromptTemplate,
    target: "generate" | "editor"
  ) {
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
    try {
      await recordPromptTemplateUse(tpl.id);
    } catch (err) {
      console.warn("Failed to record template use:", err);
    }
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
      usageCount: 0,
      contentFilterStatus: "unreviewed",
    };
    setEditingDraft(draft);
    setSelected(null);
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
      setEditingDraft(null);
      setSelected(next);
      await loadMyTemplates();
      toast(t("toast.saved"), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await syncZeroluPromptLibrary();
      if (result.success) {
        if (result.skipped_count > 0 || result.warnings.length > 0) {
          toast(
            t("promptCenter.library.syncWarning", {
              imported: result.imported_count,
              skipped: result.skipped_count + result.warnings.length,
            }),
            "info"
          );
        } else {
          toast(
            t("promptCenter.library.syncOk", { count: result.imported_count }),
            "success"
          );
        }
      } else {
        toast(
          t("promptCenter.library.syncFailed", {
            error: result.error ?? t("errors.generic"),
          }),
          "error"
        );
      }
      const status = await getPromptLibrarySyncStatus("zerolu").catch(() => null);
      setSyncStatus(status);
      await loadLibrary();
    } catch (err) {
      toast(
        t("promptCenter.library.syncFailed", {
          error: err instanceof Error ? err.message : String(err),
        }),
        "error"
      );
    } finally {
      setSyncing(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--fg)" }}>
          {t("promptCenter.heading")}
        </h1>
        <button
          onClick={startNewTemplate}
          className="px-btn"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          title={t("promptCenter.new")}
        >
          <PlusIcon width={14} height={14} />
          {t("promptCenter.new")}
        </button>
      </div>

      {/* Tabs + search */}
      <div className="flex items-center gap-3 px-6 py-4">
        <div className="px-tabs">
          {TAB_DEFS.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                setTab(d.id);
                setSelected(null);
                setEditingDraft(null);
              }}
              className={`px-tab ${tab === d.id ? "active" : ""}`}
            >
              {t(d.tKey)}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div
          className="flex items-center gap-2 px-3"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            height: 36,
            width: 280,
          }}
        >
          <SearchIcon width={14} height={14} style={{ color: "var(--muted)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("promptCenter.searchPlaceholder")}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              color: "var(--fg)",
            }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {tab === "my" && (
            <MyTemplatesPanel
              templates={myTemplates}
              onSelect={(tpl) => {
                setSelected(tpl);
                setEditingDraft(null);
              }}
              selectedId={selected?.id ?? null}
              onApplyGenerate={(tpl) => applyToTarget(tpl, "generate")}
              onApplyEditor={(tpl) => applyToTarget(tpl, "editor")}
              onToggleFavorite={handleToggleFavorite}
            />
          )}
          {tab === "library" && (
            <LibraryPanel
              hot={hotLibrary}
              recent={recentLibrary}
              category={libraryCategory}
              onCategoryChange={setLibraryCategory}
              syncStatus={syncStatus}
              syncing={syncing}
              onSync={handleSync}
              onSelect={(tpl) => {
                setSelected(tpl);
                setEditingDraft(null);
              }}
              selectedId={selected?.id ?? null}
              onApplyGenerate={(tpl) => applyToTarget(tpl, "generate")}
              onToggleFavorite={handleToggleFavorite}
            />
          )}
          {tab === "favorites" && (
            <SectionGrid
              title={t("promptCenter.favoritesSection")}
              templates={favorites}
              emptyText={t("promptCenter.empty")}
              onSelect={(tpl) => {
                setSelected(tpl);
                setEditingDraft(null);
              }}
              selectedId={selected?.id ?? null}
              onApplyGenerate={(tpl) => applyToTarget(tpl, "generate")}
              onToggleFavorite={handleToggleFavorite}
            />
          )}
          {tab === "recents" && (
            <SectionGrid
              title={t("promptCenter.recentUsage")}
              templates={recents}
              emptyText={t("promptCenter.empty")}
              onSelect={(tpl) => {
                setSelected(tpl);
                setEditingDraft(null);
              }}
              selectedId={selected?.id ?? null}
              onApplyGenerate={(tpl) => applyToTarget(tpl, "generate")}
              onToggleFavorite={handleToggleFavorite}
            />
          )}
        </div>

        {/* Detail drawer */}
        <aside
          className="overflow-y-auto"
          style={{
            width: 360,
            background: "var(--surface)",
            borderLeft: "1px solid var(--border)",
            padding: 20,
          }}
        >
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
              onToggleFavorite={() => handleToggleFavorite(selected)}
            />
          ) : (
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              {t("promptCenter.detail.noTemplate")}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Panels ──────────────────────────────────────────────────────────────────

function MyTemplatesPanel({
  templates,
  onSelect,
  selectedId,
  onApplyGenerate,
  onApplyEditor,
  onToggleFavorite,
}: {
  templates: PromptTemplate[];
  onSelect: (tpl: PromptTemplate) => void;
  selectedId: string | null;
  onApplyGenerate: (tpl: PromptTemplate) => void;
  onApplyEditor: (tpl: PromptTemplate) => void;
  onToggleFavorite: (tpl: PromptTemplate) => void;
}) {
  const { t } = useTranslation();
  if (templates.length === 0) {
    return <EmptyState text={t("promptCenter.empty")} />;
  }
  return (
    <CardGrid>
      {templates.map((tpl) => (
        <PromptCard
          key={tpl.id}
          template={tpl}
          selected={selectedId === tpl.id}
          onSelect={() => onSelect(tpl)}
          onApplyGenerate={
            tpl.mode === "generate" || tpl.mode === "both"
              ? () => onApplyGenerate(tpl)
              : undefined
          }
          onApplyEditor={
            tpl.mode === "edit" || tpl.mode === "both"
              ? () => onApplyEditor(tpl)
              : undefined
          }
          onToggleFavorite={() => onToggleFavorite(tpl)}
        />
      ))}
    </CardGrid>
  );
}

function LibraryPanel({
  hot,
  recent,
  category,
  onCategoryChange,
  syncStatus,
  syncing,
  onSync,
  onSelect,
  selectedId,
  onApplyGenerate,
  onToggleFavorite,
}: {
  hot: PromptTemplate[];
  recent: PromptTemplate[];
  category: PromptLibraryCategory;
  onCategoryChange: (c: PromptLibraryCategory) => void;
  syncStatus: PromptLibrarySyncStatus | null;
  syncing: boolean;
  onSync: () => void;
  onSelect: (tpl: PromptTemplate) => void;
  selectedId: string | null;
  onApplyGenerate: (tpl: PromptTemplate) => void;
  onToggleFavorite: (tpl: PromptTemplate) => void;
}) {
  const { t } = useTranslation();

  const lastSyncedLabel = useMemo(() => {
    if (!syncStatus?.last_synced_at) return t("promptCenter.library.neverSynced");
    return t("promptCenter.library.lastSynced", {
      time: formatRelativeTime(syncStatus.last_synced_at),
    });
  }, [syncStatus?.last_synced_at]);

  return (
    <div>
      {/* Sync toolbar */}
      <div
        className="mb-4 flex items-center gap-3 rounded-lg p-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <button
          onClick={onSync}
          disabled={syncing}
          className="px-btn px-btn-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <RefreshIcon width={14} height={14} className={syncing ? "animate-spin" : undefined} />
          {syncing ? t("promptCenter.library.syncing") : t("promptCenter.library.sync")}
        </button>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{lastSyncedLabel}</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {t("promptCenter.library.importedFmt", {
            count: syncStatus?.total_local_count ?? 0,
          })}
        </div>
        <a
          href="https://github.com/ZeroLu/awesome-gpt-image"
          target="_blank"
          rel="noopener noreferrer"
          className="px-btn"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          title={t("promptCenter.library.openSource")}
        >
          <ExternalLinkIcon width={14} height={14} />
          ZeroLu
        </a>
      </div>

      {/* Category chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {PROMPT_LIBRARY_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => onCategoryChange(c)}
            className={`px-chip ${category === c ? "active" : ""}`}
          >
            {t(`promptCenter.libraryCategories.${c}` as never)}
          </button>
        ))}
      </div>

      {/* Hot recommendations */}
      {hot.length === 0 && recent.length === 0 ? (
        syncStatus?.total_local_count === 0 ? (
          <EmptyState text={t("promptCenter.library.emptyBeforeSync")} />
        ) : (
          <EmptyState text={t("promptCenter.library.noResults")} />
        )
      ) : (
        <>
          {hot.length > 0 && (
            <Section title={t("promptCenter.hotRecommendations")}>
              <CardGrid>
                {hot.map((tpl) => (
                  <PromptCard
                    key={tpl.id}
                    template={tpl}
                    selected={selectedId === tpl.id}
                    onSelect={() => onSelect(tpl)}
                    onApplyGenerate={() => onApplyGenerate(tpl)}
                    onToggleFavorite={() => onToggleFavorite(tpl)}
                  />
                ))}
              </CardGrid>
            </Section>
          )}
          {recent.length > 0 && (
            <Section title={t("promptCenter.recentUsage")}>
              <CardGrid>
                {recent.map((tpl) => (
                  <PromptCard
                    key={tpl.id}
                    template={tpl}
                    selected={selectedId === tpl.id}
                    onSelect={() => onSelect(tpl)}
                    onApplyGenerate={() => onApplyGenerate(tpl)}
                    onToggleFavorite={() => onToggleFavorite(tpl)}
                  />
                ))}
              </CardGrid>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function SectionGrid({
  title,
  templates,
  emptyText,
  onSelect,
  selectedId,
  onApplyGenerate,
  onToggleFavorite,
}: {
  title: string;
  templates: PromptTemplate[];
  emptyText: string;
  onSelect: (tpl: PromptTemplate) => void;
  selectedId: string | null;
  onApplyGenerate: (tpl: PromptTemplate) => void;
  onToggleFavorite: (tpl: PromptTemplate) => void;
}) {
  if (templates.length === 0) {
    return <EmptyState text={emptyText} />;
  }
  return (
    <Section title={title}>
      <CardGrid>
        {templates.map((tpl) => (
          <PromptCard
            key={tpl.id}
            template={tpl}
            selected={selectedId === tpl.id}
            onSelect={() => onSelect(tpl)}
            onApplyGenerate={() => onApplyGenerate(tpl)}
            onToggleFavorite={() => onToggleFavorite(tpl)}
          />
        ))}
      </CardGrid>
    </Section>
  );
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
    >
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--fg)",
          margin: "16px 0 12px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      className="rounded-lg p-8 text-center"
      style={{
        background: "var(--surface)",
        border: "1px dashed var(--border-strong)",
        color: "var(--muted)",
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

function PromptCard({
  template,
  selected,
  onSelect,
  onApplyGenerate,
  onApplyEditor,
  onToggleFavorite,
}: {
  template: PromptTemplate;
  selected: boolean;
  onSelect: () => void;
  onApplyGenerate?: () => void;
  onApplyEditor?: () => void;
  onToggleFavorite: () => void;
}) {
  const { t } = useTranslation();
  const categoryLabel = t(
    template.provider === "zerolu"
      ? (`promptCenter.libraryCategories.${template.category}` as never)
      : (`promptCenter.categories.${template.category}` as never)
  );
  // If translation key fell through, the dotted key string is returned;
  // fall back to the raw category id for a friendlier label.
  const safeCategoryLabel = categoryLabel.startsWith("promptCenter.")
    ? template.category
    : categoryLabel;

  return (
    <button
      onClick={onSelect}
      className="px-card text-left"
      style={{
        cursor: "pointer",
        ...(selected
          ? {
              borderColor: "var(--accent)",
              boxShadow: "0 0 0 2px var(--accent-soft)",
            }
          : {}),
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: "var(--fg)",
            flex: 1,
          }}
        >
          {template.title || template.prompt.slice(0, 40)}
        </div>
        <span
          className="px-chip"
          style={{
            cursor: "default",
            padding: "2px 8px",
            fontSize: 10,
            color: "var(--muted)",
          }}
        >
          {safeCategoryLabel}
        </span>
      </div>
      {template.description && (
        <p
          style={{
            fontSize: 12,
            color: "var(--muted)",
            marginTop: 4,
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 1,
            overflow: "hidden",
          }}
        >
          {template.description}
        </p>
      )}
      <p
        style={{
          fontSize: 13,
          color: "var(--muted)",
          marginTop: 10,
          lineHeight: 1.5,
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 3,
          overflow: "hidden",
        }}
      >
        {template.prompt}
      </p>
      <div
        className="mt-3 flex items-center justify-between"
        style={{ fontSize: 11, color: "var(--muted)" }}
      >
        <span>{formatUsageCount(template.usageCount, t)}</span>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="px-btn"
            style={{
              padding: "4px 8px",
              fontSize: 11,
              ...(template.isFavorite
                ? { color: "var(--accent)", borderColor: "var(--accent)" }
                : {}),
            }}
            title={
              template.isFavorite
                ? t("promptCenter.unfavoriteAction")
                : t("promptCenter.favoriteAction")
            }
          >
            <StarIcon width={12} height={12} filled={template.isFavorite} />
            {template.isFavorite
              ? t("promptCenter.unfavoriteAction")
              : t("promptCenter.favoriteAction")}
          </button>
          {onApplyEditor && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onApplyEditor();
              }}
              className="px-btn"
              style={{ padding: "4px 8px", fontSize: 11 }}
            >
              {t("promptCenter.applyToEditor")}
            </button>
          )}
          {onApplyGenerate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onApplyGenerate();
              }}
              className="px-btn px-btn-primary"
              style={{ padding: "4px 10px", fontSize: 11 }}
            >
              {t("promptCenter.use")}
            </button>
          )}
        </div>
      </div>
    </button>
  );
}

function TemplateDetail({
  template,
  applyTarget,
  onCopy,
  onDelete,
  onApplyToGenerate,
  onApplyToEditor,
  onToggleFavorite,
}: {
  template: PromptTemplate;
  applyTarget: "generate" | "editor" | null;
  onCopy: () => void;
  onDelete: () => void;
  onApplyToGenerate: () => void;
  onApplyToEditor: () => void;
  onToggleFavorite: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>
          {template.title || "—"}
        </h2>
        <button
          onClick={onToggleFavorite}
          className="px-btn"
          style={{
            padding: "6px 10px",
            fontSize: 11,
            ...(template.isFavorite
              ? { color: "var(--accent)", borderColor: "var(--accent)" }
              : {}),
          }}
        >
          <StarIcon width={12} height={12} filled={template.isFavorite} />
          {template.isFavorite
            ? t("promptCenter.unfavoriteAction")
            : t("promptCenter.favoriteAction")}
        </button>
      </div>

      <DetailField label={t("promptCenter.detail.modeLabel")}>
        {t(`promptCenter.modes.${template.mode}` as never)}
      </DetailField>
      <DetailField label={t("promptCenter.detail.categoryLabel")}>
        {template.category}
      </DetailField>

      <DetailField label={t("promptCenter.detail.promptLabel")}>
        <pre
          className="whitespace-pre-wrap"
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: 10,
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--fg)",
            fontFamily: "var(--font-body)",
          }}
        >
          {template.prompt}
        </pre>
      </DetailField>

      {template.negativePrompt && (
        <DetailField label={t("promptCenter.detail.negativePromptLabel")}>
          <pre
            className="whitespace-pre-wrap"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: 10,
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            {template.negativePrompt}
          </pre>
        </DetailField>
      )}

      {template.tags.length > 0 && (
        <DetailField label={t("promptCenter.detail.tagsLabel")}>
          <div className="flex flex-wrap gap-1.5">
            {template.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  padding: "2px 8px",
                  fontSize: 11,
                  color: "var(--muted)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </DetailField>
      )}

      {(template.sourceName || template.sourceUrl || template.sourceOriginalUrl) && (
        <DetailField label={t("promptCenter.detail.sourceLabel")}>
          <div className="flex flex-col gap-1">
            {template.sourceName && (
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {template.sourceName}
              </span>
            )}
            {template.sourceUrl && (
              <a
                href={template.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: "var(--accent)" }}
              >
                {template.sourceUrl}
              </a>
            )}
            {template.sourceOriginalUrl && (
              <a
                href={template.sourceOriginalUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: "var(--accent)" }}
              >
                {template.sourceOriginalUrl}
              </a>
            )}
          </div>
        </DetailField>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <button onClick={onCopy} className="px-btn" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <CopyIcon width={12} height={12} />
          {t("promptCenter.copyPrompt")}
        </button>
        {!template.isBuiltin && !template.provider && (
          <button onClick={onDelete} className="px-btn px-btn-danger">
            {t("common.delete")}
          </button>
        )}
        <div className="flex-1" />
        {(template.mode === "edit" || template.mode === "both") && (
          <button
            onClick={onApplyToEditor}
            className={`px-btn ${applyTarget === "editor" ? "px-btn-primary" : ""}`}
          >
            {t("promptCenter.applyToEditor")}
          </button>
        )}
        {(template.mode === "generate" || template.mode === "both") && (
          <button
            onClick={onApplyToGenerate}
            className={`px-btn ${applyTarget !== "editor" ? "px-btn-primary" : ""}`}
          >
            {t("promptCenter.applyToGenerate")}
          </button>
        )}
      </div>
    </div>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "var(--muted-2)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
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
      <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>
        {t("promptCenter.new")}
      </h2>

      <input
        value={draft.title}
        onChange={(e) => onChange({ ...draft, title: e.target.value })}
        placeholder={t("promptCenter.newPlaceholders.title")}
        className="px-input"
      />
      <input
        value={draft.description ?? ""}
        onChange={(e) => onChange({ ...draft, description: e.target.value })}
        placeholder={t("promptCenter.newPlaceholders.description")}
        className="px-input"
      />

      <div className="grid grid-cols-2 gap-2">
        <select
          value={draft.mode}
          onChange={(e) =>
            onChange({ ...draft, mode: e.target.value as PromptTemplateMode })
          }
          className="px-select"
        >
          <option value="generate">{t("promptCenter.modes.generate")}</option>
          <option value="edit">{t("promptCenter.modes.edit")}</option>
          <option value="both">{t("promptCenter.modes.both")}</option>
        </select>
        <select
          value={draft.category}
          onChange={(e) => onChange({ ...draft, category: e.target.value })}
          className="px-select"
        >
          {[
            "landscape",
            "portrait",
            "product",
            "cinematic",
            "social",
            "illustration",
            "interior",
            "macro",
            "editing",
            "styleTransfer",
          ].map((c) => (
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
        className="px-textarea"
      />
      <textarea
        value={draft.negativePrompt ?? ""}
        onChange={(e) => onChange({ ...draft, negativePrompt: e.target.value })}
        rows={2}
        placeholder={t("promptCenter.newPlaceholders.negativePrompt")}
        className="px-textarea"
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
        className="px-input"
      />

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-btn">
          {t("common.cancel")}
        </button>
        <button onClick={onSave} className="px-btn px-btn-primary">
          {t("promptCenter.save")}
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUsageCount(
  count: number,
  t: (k: string, p?: Record<string, string | number>) => string
): string {
  if (count >= 1000) {
    const k = (count / 1000).toFixed(1).replace(/\.0$/, "");
    return t("promptCenter.usageCountKFmt", { count: k });
  }
  return t("promptCenter.usageCountFmt", { count });
}

function formatRelativeTime(iso: string): string {
  // The Rust backend writes a unix-second string. Try to parse both.
  const asNumber = Number(iso);
  let date: Date;
  if (Number.isFinite(asNumber) && asNumber > 0) {
    date = new Date(asNumber * 1000);
  } else {
    date = new Date(iso);
  }
  if (Number.isNaN(date.getTime())) return iso;
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return date.toLocaleDateString();
}
