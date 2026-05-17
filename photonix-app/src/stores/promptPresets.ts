import { create } from "zustand";
import type { EditPreset, EditPresetCategory } from "@/types";

// MVP2 §32.6.2 Landscape presets (8) + §32.6.3 Light portrait presets (4)
const BUILT_IN_PRESETS: EditPreset[] = [
  // ── Landscape ──
  {
    id: "ls-natural-clarity",
    category: "landscape",
    name: "Natural Clarity",
    description: "Enhance contrast and local detail without over-HDR look.",
    promptTemplate:
      "Enhance natural clarity of this landscape: improve micro-contrast and local detail in foliage, rocks, and clouds. Avoid HDR halos, over-sharpening, and unnatural saturation. Keep the overall tonal balance subtle and realistic.",
    preserveIdentity: false,
    preserveComposition: true,
    isCustom: false,
  },
  {
    id: "ls-sunset-glow",
    category: "landscape",
    name: "Sunset Glow",
    description: "Warm highlights and richer sky, natural shadows preserved.",
    promptTemplate:
      "Shift the lighting toward warm sunset golden-hour tones. Enrich the sky with subtle warm highlights without blowing out detail. Keep shadows naturally cool. Preserve realistic color separation and avoid an orange wash.",
    preserveIdentity: false,
    preserveComposition: true,
    isCustom: false,
  },
  {
    id: "ls-cool-blue",
    category: "landscape",
    name: "Cool Blue Tone",
    description: "Clean blue-hour or city-night mood.",
    promptTemplate:
      "Shift the overall tone toward a clean, balanced blue-hour mood. Maintain natural skin tones if any people are visible. Keep mid-tone neutrality and avoid green or magenta casts.",
    preserveIdentity: false,
    preserveComposition: true,
    isCustom: false,
  },
  {
    id: "ls-sky-detail",
    category: "landscape",
    name: "Sky Detail",
    description: "Recover cloud texture without fake drama.",
    promptTemplate:
      "Recover and enhance natural cloud texture and sky detail. Preserve the original color of the sky and avoid artificial drama, fake rays, or HDR halos around horizon lines. Foreground tonality should remain consistent.",
    preserveIdentity: false,
    preserveComposition: true,
    isCustom: false,
  },
  {
    id: "ls-mountain-texture",
    category: "landscape",
    name: "Mountain Texture",
    description: "Improve distant ridge and rock detail naturally.",
    promptTemplate:
      "Improve detail and texture on distant mountain ridges, rocks, and slopes. Avoid harsh edge artifacts and synthetic detail. Atmospheric haze on far ridges should remain natural.",
    preserveIdentity: false,
    preserveComposition: true,
    isCustom: false,
  },
  {
    id: "ls-water-reflection",
    category: "landscape",
    name: "Water Reflection",
    description: "Improve water clarity without plastic texture.",
    promptTemplate:
      "Improve water clarity and the realism of reflections. Keep ripple texture natural and avoid a plastic or oily surface look. Reflected sky and surroundings should remain consistent with the actual scene.",
    preserveIdentity: false,
    preserveComposition: true,
    isCustom: false,
  },
  {
    id: "ls-green-recovery",
    category: "landscape",
    name: "Green Recovery",
    description: "Restore natural greens without neon saturation.",
    promptTemplate:
      "Restore natural foliage greens. Avoid neon saturation, oversaturated yellows, or fake spring tones. Preserve the original light direction and shadow color.",
    preserveIdentity: false,
    preserveComposition: true,
    isCustom: false,
  },
  {
    id: "ls-night-cleanup",
    category: "landscape",
    name: "Night Cleanup",
    description: "Reduce noise, improve light separation, keep atmosphere.",
    promptTemplate:
      "Clean up night-scene noise gently. Improve separation between light sources and surrounding tones. Preserve the original atmosphere, shadow density, and mood.",
    preserveIdentity: false,
    preserveComposition: true,
    isCustom: false,
  },

  // ── Portrait ──
  {
    id: "pt-natural-skin",
    category: "portrait",
    name: "Natural Skin",
    description: "Subtle skin improvement without waxy smoothing.",
    promptTemplate:
      "Improve skin tone gently and reduce minor blemishes. Preserve natural skin texture, pores, and lighting. Do not smooth into a waxy or plastic look. Keep age, expression, and identity unchanged.",
    preserveIdentity: true,
    preserveComposition: true,
    isCustom: false,
  },
  {
    id: "pt-background-cleanup",
    category: "portrait",
    name: "Background Cleanup",
    description: "Remove distractions while preserving the person.",
    promptTemplate:
      "Remove distracting objects and clutter from the background while preserving the person completely. Keep face, skin tone, hair, clothing, and pose unchanged. The background should look natural and continuous.",
    preserveIdentity: true,
    preserveComposition: true,
    isCustom: false,
  },
  {
    id: "pt-soft-atmosphere",
    category: "portrait",
    name: "Soft Atmosphere",
    description: "Improve lighting and background mood naturally.",
    promptTemplate:
      "Improve overall lighting balance and add a subtle, natural atmosphere to the background. Preserve the subject's identity, skin tone, and expression. Avoid dreamy filters and unrealistic glow.",
    preserveIdentity: true,
    preserveComposition: true,
    isCustom: false,
  },
  {
    id: "pt-identity-safe",
    category: "portrait",
    name: "Identity Safe Retouch",
    description: "Preserve face shape, age, expression, and skin texture.",
    promptTemplate:
      "Apply only minor, identity-safe retouching. Preserve face shape, age, expression, and skin texture exactly. Do not slim, reshape, or alter facial proportions. Do not change hairstyle or clothing.",
    preserveIdentity: true,
    preserveComposition: true,
    isCustom: false,
  },
];

interface PresetsState {
  presets: EditPreset[];
  setPresets: (presets: EditPreset[]) => void;
  addPreset: (preset: EditPreset) => void;
  updatePreset: (id: string, patch: Partial<EditPreset>) => void;
  removePreset: (id: string) => void;
  byCategory: (cat: EditPresetCategory) => EditPreset[];
}

export const usePresetsStore = create<PresetsState>((set, get) => ({
  presets: BUILT_IN_PRESETS,
  setPresets: (presets) => set({ presets }),
  addPreset: (preset) =>
    set((state) => ({ presets: [...state.presets, preset] })),
  updatePreset: (id, patch) =>
    set((state) => ({
      presets: state.presets.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
      ),
    })),
  removePreset: (id) =>
    set((state) => ({ presets: state.presets.filter((p) => p.id !== id) })),
  byCategory: (cat) => get().presets.filter((p) => p.category === cat),
}));

export { BUILT_IN_PRESETS };
