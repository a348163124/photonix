import { useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { useCandidateStore } from "@/stores/candidateStore";
import { listCandidatesForImage } from "@/services/tauri/candidates";
import { isTauri } from "@/services/tauri/invoke";
import { CandidateCard } from "./CandidateCard";

export function CandidateStrip() {
  const selectedImageId = useAppStore((s) => s.selectedImageId);
  const byImage = useCandidateStore((s) => s.byImage);
  const runItems = useCandidateStore((s) => s.runItems);
  const isRunning = useCandidateStore((s) => s.isRunning);
  const setForImage = useCandidateStore((s) => s.setForImage);

  // Load candidates when the selected image changes
  useEffect(() => {
    if (!selectedImageId || !isTauri()) return;
    listCandidatesForImage(selectedImageId)
      .then((list) => setForImage(selectedImageId, list))
      .catch((err) => console.error("Failed to load candidates:", err));
  }, [selectedImageId]);

  if (!selectedImageId) return null;

  const list = byImage[selectedImageId] ?? [];

  // Hide the strip entirely when nothing to show and not currently running
  if (list.length === 0 && runItems.length === 0 && !isRunning) {
    return null;
  }

  return (
    <div className="border-t border-neutral-800 bg-neutral-900/50">
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[11px] text-neutral-400">Candidates</span>
        {isRunning && (
          <span className="text-[10px] text-amber-400">
            Running {runItems.filter((it) => it.status === "running" || it.status === "queued").length} / {runItems.length}
          </span>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto px-3 pb-2 pt-1">
        {/* Pending/running run items */}
        {runItems
          .filter((it) => it.status !== "succeeded")
          .map((it) => (
            <div
              key={it.id}
              className="flex shrink-0 flex-col items-center justify-center gap-1 rounded border border-neutral-800 bg-neutral-900 p-1 text-center"
              style={{ width: 120, height: 124 }}
            >
              <div
                className={`mb-1 h-10 w-10 rounded-full ${
                  it.status === "running"
                    ? "animate-pulse bg-amber-500/40"
                    : it.status === "failed"
                      ? "bg-red-700/60"
                      : "bg-neutral-700"
                }`}
              />
              <div className="text-[10px] text-neutral-300">{it.label}</div>
              <div className="text-[9px] text-neutral-500 capitalize">{it.status}</div>
              {it.error && (
                <div className="line-clamp-2 text-[9px] text-red-400" title={it.error}>
                  {it.error}
                </div>
              )}
            </div>
          ))}

        {/* Persisted candidates */}
        {list.map((c) => (
          <CandidateCard key={c.id} candidate={c} imageId={selectedImageId} />
        ))}
      </div>
    </div>
  );
}
