import { useEffect, useState } from "react";
import { useStyleStore } from "@/stores/styleStore";
import {
  deleteStyleProfile,
  setDefaultStyleProfile,
  upsertStyleProfile,
} from "@/services/tauri/styles";
import { toast } from "@/components/ui/Toast";
import type { StyleProfile } from "@/types";

export function StyleDetail({
  style,
  onDeleted,
}: {
  style: StyleProfile;
  onDeleted: () => void;
}) {
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
            className="w-full bg-transparent text-base font-medium text-neutral-100 outline-none disabled:cursor-not-allowed disabled:opacity-70"
          />
          <p className="mt-0.5 text-[10px] text-neutral-500">
            {style.source === "preset"
              ? "Built-in (read-only). Duplicate to edit."
              : style.source === "reference_analysis"
                ? "From reference image analysis"
                : "Manually created"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDuplicate}
            className="rounded bg-neutral-800 px-2 py-1 text-[10px] text-neutral-300 hover:bg-neutral-700"
          >
            Duplicate
          </button>
          {!isBuiltIn && (
            <button
              onClick={handleDelete}
              className="rounded bg-red-700/60 px-2 py-1 text-[10px] text-red-100 hover:bg-red-700"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Category and color mood */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Category">
          <select
            value={draft.category}
            onChange={(e) =>
              setDraft({ ...draft, category: e.target.value as StyleProfile["category"] })
            }
            disabled={isBuiltIn}
            className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-70"
          >
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
            <option value="travel">Travel</option>
            <option value="custom">Custom</option>
          </select>
        </Field>

        <Field label="Default style">
          <button
            onClick={handleSetDefault}
            className={`w-full rounded px-2 py-1 text-xs ${
              defaultStyleId === style.id
                ? "bg-blue-600/40 text-blue-200"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            {defaultStyleId === style.id ? "Default" : "Set as default"}
          </button>
        </Field>
      </div>

      <Field label="Description">
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          disabled={isBuiltIn}
          rows={2}
          className="w-full resize-none rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-70"
        />
      </Field>

      <Field label="Style summary">
        <textarea
          value={draft.styleSummary}
          onChange={(e) => setDraft({ ...draft, styleSummary: e.target.value })}
          disabled={isBuiltIn}
          rows={2}
          className="w-full resize-none rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-70"
        />
      </Field>

      <Field label="Positive style prompt">
        <textarea
          value={draft.positivePrompt}
          onChange={(e) => setDraft({ ...draft, positivePrompt: e.target.value })}
          disabled={isBuiltIn}
          rows={4}
          className="w-full resize-none rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-70"
        />
      </Field>

      <Field label="Negative constraints">
        <textarea
          value={draft.negativePrompt}
          onChange={(e) => setDraft({ ...draft, negativePrompt: e.target.value })}
          disabled={isBuiltIn}
          rows={2}
          className="w-full resize-none rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-70"
        />
      </Field>

      {/* Color mood */}
      <div className="grid grid-cols-3 gap-2">
        <Field label="Temperature">
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
            className="w-full rounded bg-neutral-800 px-2 py-1 text-xs disabled:opacity-70"
          >
            <option value="cool">Cool</option>
            <option value="neutral">Neutral</option>
            <option value="warm">Warm</option>
          </select>
        </Field>

        <Field label="Saturation">
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
            className="w-full rounded bg-neutral-800 px-2 py-1 text-xs disabled:opacity-70"
          >
            <option value="low">Low</option>
            <option value="natural">Natural</option>
            <option value="rich">Rich</option>
          </select>
        </Field>

        <Field label="Contrast">
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
            className="w-full rounded bg-neutral-800 px-2 py-1 text-xs disabled:opacity-70"
          >
            <option value="soft">Soft</option>
            <option value="balanced">Balanced</option>
            <option value="strong">Strong</option>
          </select>
        </Field>
      </div>

      {/* Preservation flags */}
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-[11px] text-neutral-400">
          <input
            type="checkbox"
            checked={draft.preserveIdentity}
            onChange={(e) => setDraft({ ...draft, preserveIdentity: e.target.checked })}
            disabled={isBuiltIn}
            className="rounded accent-blue-500"
          />
          Preserve face & identity by default
        </label>
        <label className="flex items-center gap-2 text-[11px] text-neutral-400">
          <input
            type="checkbox"
            checked={draft.preserveComposition}
            onChange={(e) => setDraft({ ...draft, preserveComposition: e.target.checked })}
            disabled={isBuiltIn}
            className="rounded accent-blue-500"
          />
          Preserve composition by default
        </label>
      </div>

      {/* Save button */}
      {!isBuiltIn && (
        <div className="flex items-center justify-end gap-2 border-t border-neutral-800 pt-3">
          <button
            onClick={() => setDraft(style)}
            disabled={!dirty}
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700 disabled:opacity-40"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
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
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
        {label}
      </label>
      {children}
    </div>
  );
}
