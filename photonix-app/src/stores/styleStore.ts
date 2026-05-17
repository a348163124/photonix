import { create } from "zustand";
import type { StyleProfile } from "@/types";

// MVP3 §33.4.1 — built-in style profile examples that demonstrate the format.
// Marked as `source: "preset"` so they can be excluded from delete actions.
export const BUILT_IN_STYLES: StyleProfile[] = [
  {
    id: "preset-clean-landscape",
    name: "Clean Landscape",
    category: "landscape",
    source: "preset",
    referenceImagePath: null,
    description: "Natural clarity, low HDR, balanced sky, realistic greens.",
    styleSummary: "Clean, neutral, slightly cinematic landscape with realistic color.",
    positivePrompt:
      "Apply a clean landscape look: subtle natural clarity, balanced contrast, realistic foliage greens, preserved sky detail, gentle warm highlights, soft cool shadows, no HDR halos.",
    negativePrompt:
      "no neon saturation, no HDR halos, no overdone clarity, no plastic textures, no fake clouds",
    colorMood: { temperature: "neutral", saturation: "natural", contrast: "balanced" },
    preserveIdentity: false,
    preserveComposition: true,
    isDefault: false,
    createdAt: "1970-01-01T00:00:00Z",
    updatedAt: "1970-01-01T00:00:00Z",
  },
  {
    id: "preset-cool-travel",
    name: "Cool Travel",
    category: "travel",
    source: "preset",
    referenceImagePath: null,
    description: "Blue shadows, soft highlights, calm low-saturation mood.",
    styleSummary: "Calm cool travel look with soft contrast and clean blue shadows.",
    positivePrompt:
      "Apply a cool travel mood: subtle blue-cool shadow tone, soft balanced highlights, low to natural saturation, calm overall feel, clean sky gradients, preserved skin tones if any people are visible.",
    negativePrompt:
      "no green or magenta cast, no oversaturated reds, no HDR look",
    colorMood: { temperature: "cool", saturation: "low", contrast: "soft" },
    preserveIdentity: false,
    preserveComposition: true,
    isDefault: false,
    createdAt: "1970-01-01T00:00:00Z",
    updatedAt: "1970-01-01T00:00:00Z",
  },
  {
    id: "preset-warm-sunset",
    name: "Warm Sunset",
    category: "landscape",
    source: "preset",
    referenceImagePath: null,
    description: "Golden highlights, preserved cloud detail, natural shadows.",
    styleSummary: "Warm golden-hour atmosphere without an orange wash.",
    positivePrompt:
      "Apply a warm sunset mood: golden highlights, preserved cloud detail, natural cool shadows, gentle global warmth, preserved color separation between sky and land.",
    negativePrompt:
      "no orange overall wash, no blown highlights, no HDR halos, no plastic look",
    colorMood: { temperature: "warm", saturation: "natural", contrast: "balanced" },
    preserveIdentity: false,
    preserveComposition: true,
    isDefault: false,
    createdAt: "1970-01-01T00:00:00Z",
    updatedAt: "1970-01-01T00:00:00Z",
  },
  {
    id: "preset-soft-portrait",
    name: "Soft Portrait",
    category: "portrait",
    source: "preset",
    referenceImagePath: null,
    description: "Natural skin, gentle contrast, identity-safe retouching.",
    styleSummary: "Gentle portrait look with natural skin and identity preservation.",
    positivePrompt:
      "Apply a soft portrait look: natural skin tone, preserved skin texture and pores, gentle contrast, soft highlights, balanced background tone, identity-safe retouching.",
    negativePrompt:
      "no waxy skin, no face slimming, no expression change, no extreme background blur, no skin smoothing past natural",
    colorMood: { temperature: "neutral", saturation: "natural", contrast: "soft" },
    preserveIdentity: true,
    preserveComposition: true,
    isDefault: false,
    createdAt: "1970-01-01T00:00:00Z",
    updatedAt: "1970-01-01T00:00:00Z",
  },
];

interface StyleState {
  /** All known styles: built-ins merged with user-saved styles from disk. */
  styles: StyleProfile[];
  setStyles: (styles: StyleProfile[]) => void;
  addStyle: (style: StyleProfile) => void;
  updateStyle: (id: string, patch: Partial<StyleProfile>) => void;
  removeStyle: (id: string) => void;

  /**
   * Explicit per-edit selection.
   *  - undefined → no override; fall back to default style
   *  - null      → user explicitly cleared (do not use any style)
   *  - string    → user explicitly picked this style id
   */
  selectedStyleId: string | null | undefined;
  setSelectedStyleId: (id: string | null | undefined) => void;

  defaultStyleId: string | null;
  setDefaultStyleId: (id: string | null) => void;

  selectedStyle: () => StyleProfile | null;
}

export const useStyleStore = create<StyleState>((set, get) => ({
  styles: BUILT_IN_STYLES,
  setStyles: (styles) => set({ styles }),
  addStyle: (style) =>
    set((state) => ({
      styles: [style, ...state.styles.filter((s) => s.id !== style.id)],
    })),
  updateStyle: (id, patch) =>
    set((state) => ({
      styles: state.styles.map((s) =>
        s.id === id
          ? { ...s, ...patch, updatedAt: new Date().toISOString() }
          : s
      ),
    })),
  removeStyle: (id) =>
    set((state) => ({ styles: state.styles.filter((s) => s.id !== id) })),

  selectedStyleId: undefined,
  setSelectedStyleId: (id) => set({ selectedStyleId: id }),

  defaultStyleId: null,
  setDefaultStyleId: (id) => set({ defaultStyleId: id }),

  selectedStyle: () => {
    const { styles, selectedStyleId, defaultStyleId } = get();
    // Explicitly cleared by the user → no style at all.
    if (selectedStyleId === null) return null;
    // No override → fall back to the default style.
    const id = selectedStyleId ?? defaultStyleId;
    if (!id) return null;
    return styles.find((s) => s.id === id) ?? null;
  },
}));
