import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useCandidateStore } from "@/stores/candidateStore";
import {
  deleteCandidate,
  setCandidateFavorite,
} from "@/services/tauri/candidates";
import { isTauri } from "@/services/tauri/invoke";
import { toast } from "@/components/ui/Toast";
import { useTranslation } from "@/i18n";
import type { EditCandidate } from "@/types";

export function CandidateCard({
  candidate,
  imageId,
}: {
  candidate: EditCandidate;
  imageId: string;
}) {
  const { t } = useTranslation();
  const versions = useAppStore((s) => s.currentVersions);
  const activeVersionId = useAppStore((s) => s.activeVersionId);
  const setActiveVersion = useAppStore((s) => s.setActiveVersion);

  const updateForImage = useCandidateStore((s) => s.updateForImage);
  const removeForImage = useCandidateStore((s) => s.removeForImage);

  const [thumbSrc, setThumbSrc] = useState<string | null>(null);

  const version = versions.find((v) => v.id === candidate.versionId);

  useEffect(() => {
    if (!version?.storagePath) return;
    if (isTauri()) {
      import("@tauri-apps/api/core").then(({ convertFileSrc }) => {
        setThumbSrc(convertFileSrc(version.storagePath));
      });
    } else {
      setThumbSrc(version.storagePath);
    }
  }, [version?.storagePath]);

  async function toggleFavorite() {
    const next = !candidate.isFavorite;
    updateForImage(imageId, candidate.id, { isFavorite: next });
    try {
      await setCandidateFavorite(candidate.id, next);
    } catch (err) {
      updateForImage(imageId, candidate.id, { isFavorite: candidate.isFavorite });
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  async function makeCurrent() {
    if (!candidate.versionId) return;
    setActiveVersion(candidate.versionId);
    toast(candidate.label, "info", 1500);
  }

  async function handleDelete() {
    if (!confirm(t("promptCenter.confirmDelete", { title: candidate.label }))) return;
    removeForImage(imageId, candidate.id);
    try {
      await deleteCandidate(candidate.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  const isActive = candidate.versionId === activeVersionId;

  return (
    <div
      className="group relative flex shrink-0 flex-col gap-1 rounded p-1 transition-colors"
      style={{
        width: 120,
        background: "var(--surface)",
        border: isActive
          ? "2px solid var(--accent)"
          : "1px solid var(--border)",
        boxShadow: isActive ? "0 0 0 2px var(--accent-soft)" : undefined,
      }}
    >
      <button
        onClick={makeCurrent}
        className="block h-20 w-full overflow-hidden rounded"
        style={{ background: "var(--bg)" }}
        title={`${t("editor.candidates.show")}: ${candidate.label}`}
      >
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt={candidate.label}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-[9px]"
            style={{ color: "var(--muted-2)" }}
          >
            —
          </div>
        )}
      </button>
      <div className="flex items-center gap-1">
        <span
          className="flex-1 truncate text-[10px]"
          style={{ color: "var(--fg)" }}
          title={candidate.label}
        >
          {candidate.label}
        </span>
        <button
          onClick={toggleFavorite}
          className="text-[10px]"
          style={{ color: candidate.isFavorite ? "var(--accent)" : "var(--muted-2)" }}
          title={t("common.favorite")}
        >
          {candidate.isFavorite ? "★" : "☆"}
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={makeCurrent} className="px-btn flex-1" style={{ padding: "2px 6px", fontSize: 9 }}>
          {t("editor.candidates.show")}
        </button>
        <button
          onClick={handleDelete}
          className="px-btn px-btn-danger"
          style={{ padding: "2px 6px", fontSize: 9 }}
          title={t("common.delete")}
        >
          ×
        </button>
      </div>
    </div>
  );
}
