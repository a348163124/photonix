import { useEffect, useState } from "react";
import { useStyleStore } from "@/stores/styleStore";
import {
  deleteStyleProfile,
  setDefaultStyleProfile,
  upsertStyleProfile,
} from "@/services/tauri/styles";
import { toast } from "@/components/ui/Toast";
import { useTranslation } from "@/i18n";
import type { StyleProfile } from "@/types";

export function StyleDetail({
  style,
  onDeleted,
}: {
  style: StyleProfile;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const updateStyle = useStyleStore((s) => s.updateStyle);
  const removeStyle = useStyleStore((s) => s.removeStyle);
  const setDefaultStyleId = useStyleStore((s) => s.setDefaultStyleId);
  const defaultStyleId = useStyleStore((s) => s.defaultStyleId);
  const styles = useStyleStore((s) => s.styles);
  const setStyles = useStyleStore((s) => s.setStyles);

  const [draft, setDraft] = useState<StyleProfile>(style);
  const [saving, setSaving] = useState(false);

  // When the user picks a different style from the list, reset our draft.
  useEffect(() => {
    setDraft(style);
  }, [style.id]);

  const isBuiltIn = style.source === "preset";
  const dirty = JSON.stringify(draft) !== JSON.stringify(style);

  async function handleSave() {
    setSaving(true);
    try {
      const next: StyleProfile = {
        ...draft,
        updatedAt: new Date().toISOString(),
      };
      await upsertStyleProfile(next);
      updateStyle(style.id, next);
      toast(`Saved "${next.name}"`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete style "${style.name}"?`)) return;
    try {
      await deleteStyleProfile(style.id);
      removeStyle(style.id);
      if (defaultStyleId === style.id) setDefaultStyleId(null);
      toast(`Deleted "${style.name}"`, "info");
      onDeleted();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  async function handleSetDefault() {
    try {
      await setDefaultStyleProfile(style.id);
      setDefaultStyleId(style.id);
      // Update isDefault flags in local list
      setStyles(
        styles.map((s) => ({ ...s, isDefault: s.id === style.id }))
      );
      toast(`"${style.name}" is now the default style.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  async function handleDuplicate() {
    const dup: StyleProfile = {
      ...draft,
      id: `style-${crypto.randomUUID()}`,
      name: `${draft.name} (copy)`,
      source: "manual",
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await upsertStyleProfile(dup);
      useStyleStore.getState().addStyle(dup);
      toast(`Duplicated as "${dup.name}"`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            disabled={isBuiltIn}
            className="w-full bg-transparent text-base font-medium px-fg outline-none disabled:cursor-not-allowed disabled:opacity-70"
          />
          <p className="mt-0.5 text-[10px] px-muted-2">
            {style.source === "preset"
              ? t("style.sourcePreset")
              : style.source === "reference_analysis"
                ? t("style.sourceReferenceAnalysis")
                : t("style.sourceManual")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDuplicate}
            className="px-btn"
          >
            {t("style.duplicate")}
          </button>
          {!isBuiltIn && (
            <button
              onClick={handleDelete}
              className="rounded bg-red-700/60 px-2 py-1 text-[10px] text-red-100 hover:bg-red-700"
            >
              {t("style.delete")}
            </button>
          )}
        </div>
      </div>

      {/* Category and color mood */}
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("style.fields.category")}>
          <select
            value={draft.category}
            onChange={(e) =>
              setDraft({ ...draft, category: e.target.value as StyleProfile["category"] })
            }
            disabled={isBuiltIn}
            className="w-full rounded px-input"
          >
            <option value="landscape">{t("style.categories.landscape")}</option>
            <option value="portrait">{t("style.categories.portrait")}</option>
            <option value="travel">{t("style.categories.travel")}</option>
            <option value="custom">{t("style.categories.custom")}</option>
          </select>
        </Field>

        <Field label={t("style.fields.defaultStyle")}>
          <button
            onClick={handleSetDefault}
            className={`w-full rounded px-2 py-1 text-xs ${
              defaultStyleId === style.id
                ? "px-btn-primary"
                : "px-bg px-fg hover:px-surface-bg"
            }`}
          >
            {defaultStyleId === style.id ? t("style.isDefault") : t("style.setAsDefault")}
          </button>
        </Field>
      </div>

      <Field label={t("style.fields.description")}>
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          disabled={isBuiltIn}
          rows={2}
          className="w-full resize-none rounded px-input"
        />
      </Field>

      <Field label={t("style.fields.summary")}>
        <textarea
          value={draft.styleSummary}
          onChange={(e) => setDraft({ ...draft, styleSummary: e.target.value })}
          disabled={isBuiltIn}
          rows={2}
          className="w-full resize-none rounded px-input"
        />
      </Field>

      <Field label={t("style.fields.positivePrompt")}>
        <textarea
          value={draft.positivePrompt}
          onChange={(e) => setDraft({ ...draft, positivePrompt: e.target.value })}
          disabled={isBuiltIn}
          rows={4}
          className="w-full resize-none rounded px-input"
        />
      </Field>

      <Field label={t("style.fields.negativeConstraints")}>
        <textarea
          value={draft.negativePrompt}
          onChange={(e) => setDraft({ ...draft, negativePrompt: e.target.value })}
          disabled={isBuiltIn}
          rows={2}
          className="w-full resize-none rounded px-input"
        />
      </Field>

      {/* Color mood */}
      <div className="grid grid-cols-3 gap-2">
        <Field label={t("style.fields.temperature")}>
          <select
            value={draft.colorMood?.temperature ?? "neutral"}
            onChange={(e) =>
              setDraft({
                ...draft,
                colorMood: {
                  ...(draft.colorMood ?? { temperature: "neutral", saturation: "natural", contrast: "balanced" }),
                  temperature: e.target.value as never,
                },
              })
            }
            disabled={isBuiltIn}
            className="w-full rounded px-input"
          >
            <option value="cool">{t("style.temperature.cool")}</option>
            <option value="neutral">{t("style.temperature.neutral")}</option>
            <option value="warm">{t("style.temperature.warm")}</option>
          </select>
        </Field>

        <Field label={t("style.fields.saturation")}>
          <select
            value={draft.colorMood?.saturation ?? "natural"}
            onChange={(e) =>
              setDraft({
                ...draft,
                colorMood: {
                  ...(draft.colorMood ?? { temperature: "neutral", saturation: "natural", contrast: "balanced" }),
                  saturation: e.target.value as never,
                },
              })
            }
            disabled={isBuiltIn}
            className="w-full rounded px-input"
          >
            <option value="low">{t("style.saturation.low")}</option>
            <option value="natural">{t("style.saturation.natural")}</option>
            <option value="rich">{t("style.saturation.rich")}</option>
          </select>
        </Field>

        <Field label={t("style.fields.contrast")}>
          <select
            value={draft.colorMood?.contrast ?? "balanced"}
            onChange={(e) =>
              setDraft({
                ...draft,
                colorMood: {
                  ...(draft.colorMood ?? { temperature: "neutral", saturation: "natural", contrast: "balanced" }),
                  contrast: e.target.value as never,
                },
              })
            }
            disabled={isBuiltIn}
            className="w-full rounded px-input"
          >
            <option value="soft">{t("style.contrast.soft")}</option>
            <option value="balanced">{t("style.contrast.balanced")}</option>
            <option value="strong">{t("style.contrast.strong")}</option>
          </select>
        </Field>
      </div>

      {/* Preservation flags */}
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-[11px] px-muted">
          <input
            type="checkbox"
            checked={draft.preserveIdentity}
            onChange={(e) => setDraft({ ...draft, preserveIdentity: e.target.checked })}
            disabled={isBuiltIn}
            className="rounded accent-blue-500"
          />
          {t("style.fields.preserveIdentity")}
        </label>
        <label className="flex items-center gap-2 text-[11px] px-muted">
          <input
            type="checkbox"
            checked={draft.preserveComposition}
            onChange={(e) => setDraft({ ...draft, preserveComposition: e.target.checked })}
            disabled={isBuiltIn}
            className="rounded accent-blue-500"
          />
          {t("style.fields.preserveComposition")}
        </label>
      </div>

      {/* Save button */}
      {!isBuiltIn && (
        <div className="flex items-center justify-end gap-2 border-t pt-3">
          <button
            onClick={() => setDraft(style)}
            disabled={!dirty}
            className="px-btn"
          >
            {t("common.reset")}
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-btn px-btn-primary"
          >
            {saving ? t("style.analyzer.saving") : t("common.save")}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide px-muted-2">
        {label}
      </label>
      {children}
    </div>
  );
}

