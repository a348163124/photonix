import { useTranslation } from "@/i18n";
import { BORDER_TEMPLATES, type BorderTemplateId } from "@/types";

const BORDER_LABEL_KEYS: Record<BorderTemplateId, { label: string; desc: string }> = {
  none: { label: "export.borderTemplates.none", desc: "export.borderTemplates.noneDesc" },
  thin_white: { label: "export.borderTemplates.thinWhite", desc: "export.borderTemplates.thinWhiteDesc" },
  thin_black: { label: "export.borderTemplates.thinBlack", desc: "export.borderTemplates.thinBlackDesc" },
  gallery_mat: { label: "export.borderTemplates.galleryMat", desc: "export.borderTemplates.galleryMatDesc" },
  cinematic_letterbox: { label: "export.borderTemplates.cinematicLetterbox", desc: "export.borderTemplates.cinematicLetterboxDesc" },
  square_social: { label: "export.borderTemplates.squareSocial", desc: "export.borderTemplates.squareSocialDesc" },
};

export function BorderPanel({
  selected,
  onChange,
}: {
  selected: BorderTemplateId;
  onChange: (id: BorderTemplateId) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <label className="mb-1 block text-[11px] text-neutral-400">
        {t("export.borderLabel")}
      </label>
      <div className="flex flex-col gap-1">
        {BORDER_TEMPLATES.map((b) => {
          const keys = BORDER_LABEL_KEYS[b.id];
          return (
            <button
              key={b.id}
              onClick={() => onChange(b.id)}
              className={`rounded px-2 py-1.5 text-left text-xs transition-colors ${
                selected === b.id
                  ? "bg-blue-600/30 text-blue-200 ring-1 ring-blue-500/50"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-4 w-4 rounded border"
                  style={{
                    backgroundColor: b.color,
                    borderColor: b.color === "#000000" ? "#666" : "#999",
                  }}
                />
                <span className="font-medium">{t(keys.label)}</span>
                <span className="ml-auto text-[10px] text-neutral-500">
                  {b.thickness > 0 ? `${b.thickness}px` : ""}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-neutral-500">{t(keys.desc)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
