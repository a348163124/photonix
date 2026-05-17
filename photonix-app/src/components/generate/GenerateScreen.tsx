import { useEffect } from "react";
import { useGenerateStore } from "@/stores/generateStore";
import { isTauri } from "@/services/tauri/invoke";
import { listGeneratedImages } from "@/services/tauri/generate";
import { GenerateGallery } from "./GenerateGallery";
import { GeneratePromptPanel } from "./GeneratePromptPanel";
import { GeneratePreview } from "./GeneratePreview";

export function GenerateScreen() {
  const setImages = useGenerateStore((s) => s.setImages);
  const selectedId = useGenerateStore((s) => s.selectedId);
  const images = useGenerateStore((s) => s.images);

  useEffect(() => {
    if (!isTauri()) return;
    listGeneratedImages()
      .then((imgs) => setImages(imgs))
      .catch((err) => console.error("Failed to load generations:", err));
  }, []);

  const selected = images.find((img) => img.id === selectedId);

  return (
    <div className="flex h-full" style={{ background: "var(--bg)" }}>
      {/* Left: Gallery + Preview */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div
          className="flex-1 overflow-hidden"
          style={{
            background: "var(--bg)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <GeneratePreview image={selected ?? null} />
        </div>
        <div className="h-44 shrink-0 overflow-hidden">
          <GenerateGallery />
        </div>
      </div>

      {/* Right: Prompt panel */}
      <aside
        className="flex w-80 shrink-0 flex-col"
        style={{
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
        }}
      >
        <GeneratePromptPanel />
      </aside>
    </div>
  );
}
