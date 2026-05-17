import { useEditorStore } from "@/stores/editorStore";
import { useTranslation } from "@/i18n";

export function MaskPanel() {
  const { t } = useTranslation();
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
      <p className="text-[10px]" style={{ color: "var(--muted)" }}>
        {t("editor.mask.hint")}
      </p>

      {/* Mode toggle */}
      <div className="flex gap-1">
        <button
          onClick={() => setBrushMode("brush")}
          className={`px-btn flex-1 ${brushMode === "brush" ? "px-btn-primary" : ""}`}
        >
          {t("editor.mask.paintMode")}
        </button>
        <button
          onClick={() => setBrushMode("erase")}
          className={`px-btn flex-1 ${brushMode === "erase" ? "px-btn-primary" : ""}`}
        >
          {t("editor.mask.eraseMode")}
        </button>
      </div>

      {/* Brush size */}
      <div>
        <label
          className="mb-1 flex items-center justify-between text-[11px]"
          style={{ color: "var(--muted)" }}
        >
          <span>{t("editor.mask.brushSize")}</span>
          <span>{brushSize}px</span>
        </label>
        <input
          type="range"
          min={1}
          max={200}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: "var(--accent)" }}
        />
      </div>

      {/* Brush softness */}
      <div>
        <label
          className="mb-1 flex items-center justify-between text-[11px]"
          style={{ color: "var(--muted)" }}
        >
          <span>{t("editor.mask.brushSoftness")}</span>
          <span>{brushSoftness}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={brushSoftness}
          onChange={(e) => setBrushSoftness(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: "var(--accent)" }}
        />
      </div>

      {/* Mask visibility */}
      <label
        className="flex items-center gap-2 text-[11px]"
        style={{ color: "var(--muted)" }}
      >
        <input
          type="checkbox"
          checked={showMask}
          onChange={(e) => setShowMask(e.target.checked)}
          className="rounded"
          style={{ accentColor: "var(--accent)" }}
        />
        {t("editor.mask.showOverlay")}
      </label>

      {/* Keyboard shortcuts hint */}
      <div
        className="mt-2 rounded p-2"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <p className="text-[10px]" style={{ color: "var(--muted)" }}>
          <strong style={{ color: "var(--fg)" }}>{t("editor.mask.tipsHeading")}</strong>
          <br />• Left click to paint mask
          <br />• Alt + drag to pan
          <br />• Scroll to zoom
        </p>
      </div>
    </div>
  );
}
