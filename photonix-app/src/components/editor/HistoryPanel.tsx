import { useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { isTauri } from "@/services/tauri/invoke";
import { loadVersionsForImage } from "@/services/loadVersionsForImage";
import { useTranslation } from "@/i18n";

export function HistoryPanel() {
  const { t } = useTranslation();
  const selectedImageId = useAppStore((s) => s.selectedImageId);
  const versions = useAppStore((s) => s.currentVersions);
  const activeVersionId = useAppStore((s) => s.activeVersionId);
  const setActiveVersion = useAppStore((s) => s.setActiveVersion);

  useEffect(() => {
    if (selectedImageId && isTauri()) {
      void loadVersionsForImage(selectedImageId);
    }
  }, [selectedImageId]);

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <p className="text-xs" style={{ color: "var(--muted)" }}>{t("editor.history.empty")}</p>
        <p className="text-[10px] text-center" style={{ color: "var(--muted-2)" }}>
          {t("editor.history.emptyHint")}
        </p>
      </div>
    );
  }

  const KIND_LABELS: Record<string, string> = {
    original: t("editor.history.kindOriginal"),
    draft: t("editor.history.kindDraft"),
    final: t("editor.history.kindFinal"),
    stitched: t("editor.history.kindStitched"),
    export_snapshot: t("editor.history.kindExportSnapshot"),
  };

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] mb-2" style={{ color: "var(--muted)" }}>
        {t("editor.history.versionsCount", { count: versions.length })}
      </p>
      {versions.map((v) => (
        <button
          key={v.id}
          onClick={() => setActiveVersion(v.id)}
          className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors"
          style={{
            background: activeVersionId === v.id ? "var(--accent-soft)" : "transparent",
            border: activeVersionId === v.id ? "1px solid var(--accent)" : "1px solid transparent",
            color: activeVersionId === v.id ? "var(--accent-strong)" : "var(--muted)",
          }}
        >
          <VersionIcon kind={v.versionKind} />
          <div className="flex-1 min-w-0">
            <span className="capitalize block truncate" style={{ color: activeVersionId === v.id ? "var(--accent-strong)" : "var(--fg)" }}>
              {KIND_LABELS[v.versionKind] ?? v.versionKind}
            </span>
            <span className="text-[9px]" style={{ color: "var(--muted-2)" }}>
              {v.width}×{v.height}
            </span>
          </div>
          {v.isCurrent && (
            <span className="text-[9px] shrink-0" style={{ color: "var(--accent-strong)" }}>
              {t("editor.history.currentBadge")}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function VersionIcon({ kind }: { kind: string }) {
  const icons: Record<string, string> = {
    original: "📄",
    draft: "✏️",
    final: "✅",
    stitched: "🧩",
    export_snapshot: "📦",
  };
  return <span className="text-sm">{icons[kind] ?? "📄"}</span>;
}
