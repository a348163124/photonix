import { useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { isTauri } from "@/services/tauri/invoke";
import { loadVersionsForImage } from "@/services/loadVersionsForImage";

export function HistoryPanel() {
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
        <p className="text-xs text-neutral-500">No versions yet</p>
        <p className="text-[10px] text-neutral-600 text-center">
          Generate an edit to create the first version.
          Each accepted result becomes a version entry.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] text-neutral-500 mb-2">
        {versions.length} version{versions.length !== 1 ? "s" : ""}
      </p>
      {versions.map((v) => (
        <button
          key={v.id}
          onClick={() => setActiveVersion(v.id)}
          className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
            activeVersionId === v.id
              ? "bg-neutral-700 text-neutral-200 ring-1 ring-blue-500/50"
              : "text-neutral-400 hover:bg-neutral-800"
          }`}
        >
          <VersionIcon kind={v.versionKind} />
          <div className="flex-1 min-w-0">
            <span className="capitalize block truncate">{v.versionKind}</span>
            <span className="text-[9px] text-neutral-600">
              {v.width}×{v.height}
            </span>
          </div>
          {v.isCurrent && (
            <span className="text-[9px] text-green-500 shrink-0">current</span>
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
