import { useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { useCandidateStore } from "@/stores/candidateStore";
import { listCandidatesForImage } from "@/services/tauri/candidates";
import { isTauri } from "@/services/tauri/invoke";
import { useTranslation } from "@/i18n";
import { CandidateCard } from "./CandidateCard";

export function CandidateStrip() {
  const { t } = useTranslation();
  const selectedImageId = useAppStore((s) => s.selectedImageId);
  const byImage = useCandidateStore((s) => s.byImage);
  const runItems = useCandidateStore((s) => s.runItems);
  const isRunning = useCandidateStore((s) => s.isRunning);
  const setForImage = useCandidateStore((s) => s.setForImage);

  useEffect(() => {
    if (!selectedImageId || !isTauri()) return;
    listCandidatesForImage(selectedImageId)
      .then((list) => setForImage(selectedImageId, list))
      .catch((err) => console.error("Failed to load candidates:", err));
  }, [selectedImageId]);

  if (!selectedImageId) return null;

  const list = byImage[selectedImageId] ?? [];

  if (list.length === 0 && runItems.length === 0 && !isRunning) {
    return null;
  }

  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[11px]" style={{ color: "var(--muted)" }}>
          {t("editor.candidates.heading")}
        </span>
        {isRunning && (
          <span className="text-[10px]" style={{ color: "oklch(45% 0.16 70)" }}>
            {t("editor.candidates.runningSummary", {
              remaining: runItems.filter(
                (it) => it.status === "running" || it.status === "queued"
              ).length,
              total: runItems.length,
            })}
          </span>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto px-3 pb-2 pt-1">
        {runItems
          .filter((it) => it.status !== "succeeded")
          .map((it) => (
            <div
              key={it.id}
              className="flex shrink-0 flex-col items-center justify-center gap-1 rounded p-1 text-center"
              style={{
                width: 120,
                height: 124,
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                className={`mb-1 h-10 w-10 rounded-full ${it.status === "running" ? "animate-pulse" : ""}`}
                style={{
                  background:
                    it.status === "running"
                      ? "oklch(85% 0.08 70)"
                      : it.status === "failed"
                        ? "oklch(92% 0.05 25)"
                        : "var(--surface-2)",
                }}
              />
              <div className="text-[10px]" style={{ color: "var(--fg)" }}>
                {it.label}
              </div>
              <div className="text-[9px] capitalize" style={{ color: "var(--muted)" }}>
                {it.status}
              </div>
              {it.error && (
                <div
                  className="line-clamp-2 text-[9px]"
                  style={{ color: "var(--danger)" }}
                  title={it.error}
                >
                  {it.error}
                </div>
              )}
            </div>
          ))}

        {list.map((c) => (
          <CandidateCard key={c.id} candidate={c} imageId={selectedImageId} />
        ))}
      </div>
    </div>
  );
}
