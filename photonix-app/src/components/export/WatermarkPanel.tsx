import { useTranslation } from "@/i18n";
import type { WatermarkPosition, WatermarkTemplate } from "@/types";

export function WatermarkPanel({
  template,
  onChange,
}: {
  template: WatermarkTemplate;
  onChange: (t: WatermarkTemplate) => void;
}) {
  const { t } = useTranslation();
  const POSITIONS: { id: WatermarkPosition; labelKey: string }[] = [
    { id: "top_left", labelKey: "export.watermarkPositions.topLeft" },
    { id: "top_right", labelKey: "export.watermarkPositions.topRight" },
    { id: "bottom_left", labelKey: "export.watermarkPositions.bottomLeft" },
    { id: "bottom_center", labelKey: "export.watermarkPositions.bottomCenter" },
    { id: "bottom_right", labelKey: "export.watermarkPositions.bottomRight" },
  ];

  return (
    <div>
      <label className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
        <span>{t("export.watermarkLabel")}</span>
        <label className="flex items-center gap-1 text-[10px] text-neutral-500">
          <input
            type="checkbox"
            checked={template.enabled}
            onChange={(e) => onChange({ ...template, enabled: e.target.checked })}
            className="accent-blue-500"
          />
          {t("export.watermarkEnable")}
        </label>
      </label>

      {template.enabled && (
        <div className="flex flex-col gap-2 rounded border border-neutral-800 p-2">
          <input
            value={template.text}
            onChange={(e) => onChange({ ...template, text: e.target.value })}
            placeholder={t("export.watermarkText")}
            className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 placeholder-neutral-500"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] text-neutral-500">{t("export.watermarkColor")}</label>
              <input
                type="color"
                value={template.color}
                onChange={(e) => onChange({ ...template, color: e.target.value })}
                className="h-7 w-full rounded bg-neutral-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-neutral-500">
                {t("export.watermarkOpacity", { pct: Math.round(template.opacity * 100) })}
              </label>
              <input
                type="range"
                min={10}
                max={100}
                value={Math.round(template.opacity * 100)}
                onChange={(e) =>
                  onChange({ ...template, opacity: Number(e.target.value) / 100 })
                }
                className="w-full accent-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] text-neutral-500">
              {t("export.watermarkFontSize", { size: template.fontSize })}
            </label>
            <input
              type="range"
              min={12}
              max={120}
              value={template.fontSize}
              onChange={(e) =>
                onChange({ ...template, fontSize: Number(e.target.value) })
              }
              className="w-full accent-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] text-neutral-500">{t("export.watermarkPosition")}</label>
            <div className="grid grid-cols-3 gap-1">
              {POSITIONS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onChange({ ...template, position: p.id })}
                  className={`rounded px-1 py-1 text-[10px] transition-colors ${
                    template.position === p.id
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                  }`}
                >
                  {t(p.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] text-neutral-500">
              {t("export.watermarkMargin", { px: template.margin })}
            </label>
            <input
              type="range"
              min={0}
              max={120}
              value={template.margin}
              onChange={(e) =>
                onChange({ ...template, margin: Number(e.target.value) })
              }
              className="w-full accent-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
