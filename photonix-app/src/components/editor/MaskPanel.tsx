import { useEditorStore } from "@/stores/editorStore";

export function MaskPanel() {
  const brushSize = useEditorStore((s) => s.brushSize);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const brushSoftness = useEditorStore((s) => s.brushSoftness);
  const setBrushSoftness = useEditorStore((s) => s.setBrushSoftness);
  const brushMode = useEditorStore((s) => s.brushMode);
  const setBrushMode = useEditorStore((s) => s.setBrushMode);
  const showMask = useEditorStore((s) => s.showMask);
  const setShowMask = useEditorStore((s) => s.setShowMask);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] text-neutral-500">
        Paint on the image to select the region you want to edit.
      </p>

      {/* Mode toggle */}
      <div className="flex gap-1">
        <button
          onClick={() => setBrushMode("brush")}
          className={`flex-1 rounded px-2 py-1 text-xs transition-colors ${
            brushMode === "brush"
              ? "bg-blue-600 text-white"
              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
          }`}
        >
          Brush
        </button>
        <button
          onClick={() => setBrushMode("erase")}
          className={`flex-1 rounded px-2 py-1 text-xs transition-colors ${
            brushMode === "erase"
              ? "bg-blue-600 text-white"
              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
          }`}
        >
          Erase
        </button>
      </div>

      {/* Brush size */}
      <div>
        <label className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
          <span>Size</span>
          <span>{brushSize}px</span>
        </label>
        <input
          type="range"
          min={1}
          max={200}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
      </div>

      {/* Brush softness */}
      <div>
        <label className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
          <span>Softness</span>
          <span>{brushSoftness}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={brushSoftness}
          onChange={(e) => setBrushSoftness(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
      </div>

      {/* Mask visibility */}
      <label className="flex items-center gap-2 text-[11px] text-neutral-400">
        <input
          type="checkbox"
          checked={showMask}
          onChange={(e) => setShowMask(e.target.checked)}
          className="rounded accent-blue-500"
        />
        Show mask overlay
      </label>

      {/* Keyboard shortcuts hint */}
      <div className="mt-2 rounded bg-neutral-800/50 p-2">
        <p className="text-[10px] text-neutral-500">
          <strong className="text-neutral-400">Tips:</strong>
          <br />• Left click to paint mask
          <br />• Alt + drag to pan
          <br />• Scroll to zoom
          <br />• Switch to Prompt tab when done
        </p>
      </div>
    </div>
  );
}
