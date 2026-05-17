import { useState, useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";
import { isTauri } from "@/services/tauri/invoke";
import { loadVersionsForImage } from "@/services/loadVersionsForImage";
import { useTranslation } from "@/i18n";
import { Canvas } from "./Canvas";
import { PromptPanel } from "./PromptPanel";
import { MaskPanel } from "./MaskPanel";
import { HistoryPanel } from "./HistoryPanel";
import { ExportPanel } from "./ExportPanel";
import { CandidateStrip } from "@/components/candidates/CandidateStrip";

type EditorTab = "prompt" | "mask" | "history" | "export";

export function EditorScreen() {
  const { t } = useTranslation();
  const selectedImageId = useAppStore((s) => s.selectedImageId);
  const images = useAppStore((s) => s.images);
  const versions = useAppStore((s) => s.currentVersions);
  const activeVersionId = useAppStore((s) => s.activeVersionId);
  const setView = useAppStore((s) => s.setView);
  const [activeTab, setActiveTab] = useState<EditorTab>("prompt");
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

  const brushMode = useEditorStore((s) => s.brushMode);
  const brushSize = useEditorStore((s) => s.brushSize);
  const showMask = useEditorStore((s) => s.showMask);
  const maskDataUrl = useEditorStore((s) => s.maskDataUrl);
  const setMaskDataUrl = useEditorStore((s) => s.setMaskDataUrl);
  const resetEditor = useEditorStore((s) => s.resetEditor);

  const selectedImage = images.find((img) => img.id === selectedImageId);

  // Determine which file to display:
  // 1. If an active version is selected, show its storagePath
  // 2. Otherwise show the original source image
  const activeVersion = versions.find((v) => v.id === activeVersionId);
  const currentVersion = versions.find((v) => v.isCurrent);
  const displayVersion = activeVersion ?? currentVersion;
  const displayPath = displayVersion?.storagePath ?? selectedImage?.sourcePath ?? null;

  // Resolve the display path to a Tauri-safe URL
  useEffect(() => {
    if (!displayPath) {
      setResolvedSrc(null);
      return;
    }
    if (isTauri()) {
      import("@tauri-apps/api/core").then(({ convertFileSrc }) => {
        setResolvedSrc(convertFileSrc(displayPath));
      });
    } else {
      setResolvedSrc(displayPath);
    }
  }, [displayPath]);

  if (!selectedImageId || !selectedImage) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-neutral-400">{t("editor.noImage")}</p>
          <button
            onClick={() => setView("library")}
            className="mt-2 text-xs text-blue-400 hover:underline"
          >
            {t("editor.goToLibrary")}
          </button>
        </div>
      </div>
    );
  }

  function handleTabChange(tab: EditorTab) {
    setActiveTab(tab);
    if (tab === "mask") {
      useEditorStore.getState().setBrushMode("brush");
    } else {
      useEditorStore.getState().setBrushMode("none");
    }
  }

  function handleSelectImage(imageId: string) {
    resetEditor();
    useAppStore.getState().selectImage(imageId);
    setActiveTab("prompt");
    void loadVersionsForImage(imageId);
  }

  // Label for what's currently displayed
  const displayLabel = displayVersion
    ? t("editor.canvasLabels.versionFmt", { kind: displayVersion.versionKind })
    : t("editor.canvasLabels.original");

  return (
    <div className="flex h-full" style={{ background: "var(--bg)" }}>
      {/* Left rail */}
      <aside
        className="hidden w-48 flex-col lg:flex"
        style={{
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <div
          className="px-3 py-2"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span
            className="text-[11px] font-medium"
            style={{ color: "var(--muted)" }}
          >
            {t("editor.sidePanelImages")}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {images.slice(0, 30).map((img) => (
            <button
              key={img.id}
              onClick={() => handleSelectImage(img.id)}
              className="w-full rounded px-2 py-1 text-left text-[10px] transition-colors"
              style={{
                background:
                  img.id === selectedImageId ? "var(--accent-soft)" : "transparent",
                color:
                  img.id === selectedImageId ? "var(--accent-strong)" : "var(--muted)",
              }}
              onMouseEnter={(e) => {
                if (img.id !== selectedImageId) {
                  e.currentTarget.style.background = "var(--bg)";
                  e.currentTarget.style.color = "var(--fg)";
                }
              }}
              onMouseLeave={(e) => {
                if (img.id !== selectedImageId) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--muted)";
                }
              }}
            >
              {img.filename}
            </button>
          ))}
        </div>
      </aside>

      {/* Canvas area */}
      <div className="flex flex-1 flex-col" style={{ background: "var(--bg)" }}>
        <div
          className="flex items-center gap-2 px-3 py-1.5"
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          <button
            onClick={() => setView("library")}
            className="text-xs"
            style={{ color: "var(--muted)" }}
          >
            {t("editor.backToLibrary")}
          </button>
          <span className="text-xs" style={{ color: "var(--muted-2)" }}>
            |
          </span>
          <span
            className="text-xs truncate max-w-[200px]"
            style={{ color: "var(--fg)" }}
          >
            {selectedImage.filename}
          </span>
          <span className="text-[10px]" style={{ color: "var(--muted)" }}>
            ({displayLabel})
          </span>
          <span className="text-[10px]" style={{ color: "var(--muted-2)" }}>
            {selectedImage.width}×{selectedImage.height}
          </span>
          <div className="flex-1" />
          {brushMode !== "none" && (
            <span
              className="text-[10px]"
              style={{ color: "oklch(45% 0.16 70)" }}
            >
              {brushMode === "brush"
                ? t("editor.canvasLabels.maskPaint")
                : t("editor.canvasLabels.maskErase")}{" "}
              ({brushSize}px)
            </span>
          )}
          {maskDataUrl && brushMode === "none" && (
            <span
              className="text-[10px]"
              style={{ color: "var(--accent-strong)" }}
            >
              {t("editor.canvasLabels.maskReady")}
            </span>
          )}
        </div>

        <div className="flex-1" style={{ background: "var(--bg)" }}>
          <Canvas
            imageSrc={resolvedSrc}
            showMaskOverlay={showMask}
            brushMode={activeTab === "mask" ? brushMode : "none"}
            brushSize={brushSize}
            existingMaskDataUrl={maskDataUrl}
            onMaskChange={setMaskDataUrl}
          />
        </div>

        {/* Candidate strip — only shown when there are candidates or running */}
        <CandidateStrip />
      </div>

      {/* Right panel */}
      <aside
        className="flex w-72 flex-col"
        style={{
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
        }}
      >
        <div className="flex" style={{ borderBottom: "1px solid var(--border)" }}>
          {(["prompt", "mask", "history", "export"] as EditorTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className="flex-1 py-2 text-xs capitalize transition-colors"
              style={{
                borderBottom:
                  activeTab === tab
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                color: activeTab === tab ? "var(--fg)" : "var(--muted)",
              }}
            >
              {t(`editor.tabs.${tab}` as never)}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {activeTab === "prompt" && <PromptPanel />}
          {activeTab === "mask" && <MaskPanel />}
          {activeTab === "history" && <HistoryPanel />}
          {activeTab === "export" && <ExportPanel />}
        </div>
      </aside>
    </div>
  );
}
