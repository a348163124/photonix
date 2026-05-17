import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useCandidateStore } from "@/stores/candidateStore";
import {
  deleteCandidate,
  setCandidateFavorite,
} from "@/services/tauri/candidates";
import { isTauri } from "@/services/tauri/invoke";
import { toast } from "@/components/ui/Toast";
import type { EditCandidate } from "@/types";

export function CandidateCard({
  candidate,
  imageId,
}: {
  candidate: EditCandidate;
  imageId: string;
}) {
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
      // Revert on failure
      updateForImage(imageId, candidate.id, { isFavorite: candidate.isFavorite });
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  async function makeCurrent() {
    if (!candidate.versionId) return;
    setActiveVersion(candidate.versionId);
    toast(`Showing "${candidate.label}"`, "info", 1500);
  }

  async function handleDelete() {
    if (!confirm(`Delete candidate "${candidate.label}"?`)) return;
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
      className={`group relative flex shrink-0 flex-col gap-1 rounded border p-1 transition-colors ${
        isActive
          ? "border-blue-500 bg-blue-600/10"
          : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
      }`}
      style={{ width: 120 }}
    >
      <button
        onClick={makeCurrent}
        className="block h-20 w-full overflow-hidden rounded bg-neutral-800"
        title={`Show: ${candidate.label}`}
      >
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt={candidate.label}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[9px] text-neutral-500">
            no preview
          </div>
        )}
      </button>
      <div className="flex items-center gap-1">
        <span
          className="flex-1 truncate text-[10px] text-neutral-300"
          title={candidate.label}
        >
          {candidate.label}
        </span>
        <button
          onClick={toggleFavorite}
          className="text-[10px]"
          title="Favorite"
        >
          {candidate.isFavorite ? "★" : "☆"}
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={makeCurrent}
          className="flex-1 rounded bg-neutral-800 px-1 py-0.5 text-[9px] text-neutral-300 hover:bg-neutral-700"
        >
          Show
        </button>
        <button
          onClick={handleDelete}
          className="rounded bg-neutral-800 px-1 py-0.5 text-[9px] text-neutral-500 hover:bg-red-700 hover:text-white"
          title="Delete candidate"
        >
          ×
        </button>
      </div>
    </div>
  );
}
