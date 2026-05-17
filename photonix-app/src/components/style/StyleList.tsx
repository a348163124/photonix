import { useStyleStore } from "@/stores/styleStore";
import { useTranslation } from "@/i18n";
import type { StyleCategory } from "@/types";

export function StyleList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const styles = useStyleStore((s) => s.styles);
  const defaultStyleId = useStyleStore((s) => s.defaultStyleId);

  const grouped = styles.reduce<Record<string, typeof styles>>((acc, s) => {
    const key = s.category;
    acc[key] = acc[key] ?? [];
    acc[key].push(s);
    return acc;
  }, {});

  const categories: StyleCategory[] = ["landscape", "portrait", "travel", "custom"];
  const categoryLabel = (cat: StyleCategory) =>
    t(`style.categories.${cat}` as never);

  return (
    <div className="flex-1 overflow-y-auto p-1">
      {categories.map((cat) => {
        const list = grouped[cat] ?? [];
        if (list.length === 0) return null;
        return (
          <div key={cat} className="mb-2">
            <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wide ">
              {categoryLabel(cat)}
            </div>
            {list.map((style) => (
              <button
                key={style.id}
                onClick={() => onSelect(style.id)}
                className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                  selectedId === style.id
                    ? ""
                    : "hover:"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[12px] ">{style.name}</span>
                    {defaultStyleId === style.id && (
                      <span className="rounded bg-blue-600/40 px-1 py-0 text-[8px] font-medium text-blue-200">
                        {t("style.defaultBadge")}
                      </span>
                    )}
                    {style.source === "preset" && (
                      <span className="rounded  px-1 py-0 text-[8px] ">
                        {t("style.builtInBadge")}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-[10px] ">
                    {style.description || style.styleSummary}
                  </div>
                </div>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

