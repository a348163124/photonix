import { useState, useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";
import { isTauri } from "@/services/tauri/invoke";
import { getVersions } from "@/services/tauri/versions";
import { Canvas } from "./Canvas";
import { PromptPanel } from "./PromptPanel";
import { MaskPanel } from "./MaskPanel";
import { HistoryPanel } from "./HistoryPanel";
import { ExportPanel } from "./ExportPanel";
import { CandidateStrip } from "@/components/candidates/CandidateStrip";

type EditorTab = "prompt" | "mask" | "history" | "export";

export function EditorScreen() {
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
          <p className="text-sm text-neutral-400">No image selected</p>
          <button
            onClick={() => setView("library")}
            className="mt-2 text-xs text-blue-400 hover:underline"
          >
            Go to Library
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
    if (isTauri()) {
      getVersions(imageId)
        .then((versions) => {
          useAppStore.getState().setCurrentVersions(versions);
          const current = versions.find((v) => v.isCurrent);
          useAppStore
            .getState()
            .setActiveVersion(current?.id ?? versions[0]?.id ?? null);
        })
        .catch((err) => {
          console.error("Failed to load versions:", err);
          useAppStore.getState().setCurrentVersions([]);
          useAppStore.getState().setActiveVersion(null);
        });
    } else {
      useAppStore.getState().setCurrentVersions([]);
      useAppStore.getState().setActiveVersion(null);
    }
  }

  // Label for what's currently displayed
  const displayLabel = displayVersion
    ? `${displayVersion.versionKind} version`
    : "original";

  return (
    <div className="flex h-full">
      {/* Left rail */}
      <aside className="hidden w-48 flex-col border-r border-neutral-800 bg-neutral-900 lg:flex">
        <div className="border-b border-neutral-800 px-3 py-2">
          <span className="text-[11px] font-medium text-neutral-400">Images</span>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {images.slice(0, 30).map((img) => (
            <button
              key={img.id}
              onClick={() => handleSelectImage(img.id)}
              className={`w-full rounded px-2 py-1 text-left text-[10px] transition-colors ${
                img.id === selectedImageId
                  ? "bg-neutral-700 text-neutral-200"
                  : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
              }`}
            >
              {img.filename}
            </button>
          ))}
        </div>
      </aside>

      {/* Canvas area */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1.5">
          <button
            onClick={() => setView("library")}
            className="text-xs text-neutral-400 hover:text-neutral-200"
          >
            ← Library
          </button>
          <span className="text-xs text-neutral-600">|</span>
          <span className="text-xs text-neutral-300 truncate max-w-[200px]">
            {selectedImage.filename}
          </span>
          <span className="text-[10px] text-neutral-500">
            ({displayLabel})
          </span>
          <span className="text-[10px] text-neutral-600">
            {selectedImage.width}×{selectedImage.height}
          </span>
          <div className="flex-1" />
          {brushMode !== "none" && (
            <span className="text-[10px] text-amber-400">
              Mask: {brushMode === "brush" ? "Paint" : "Erase"} ({brushSize}px)
            </span>
          )}
          {maskDataUrl && brushMode === "none" && (
            <span className="text-[10px] text-green-400">Mask ready</span>
          )}
        </div>

        <div className="flex-1 bg-neutral-950">
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
      <aside className="flex w-72 flex-col border-l border-neutral-800 bg-neutral-900">
        <div className="flex border-b border-neutral-800">
          {(["prompt", "mask", "history", "export"] as EditorTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`flex-1 py-2 text-xs capitalize transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-blue-500 text-neutral-200"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {tab}
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
