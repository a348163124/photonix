import { create } from "zustand";
import type { PromptHistoryEntry, QualityMode } from "@/types";

const RECENT_LIMIT = 30;

interface EditorState {
  // Mask state
  brushMode: "brush" | "erase" | "none";
  setBrushMode: (mode: "brush" | "erase" | "none") => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  brushSoftness: number;
  setBrushSoftness: (softness: number) => void;
  showMask: boolean;
  setShowMask: (show: boolean) => void;
  maskDataUrl: string;
  setMaskDataUrl: (url: string) => void;

  // Prompt state
  prompt: string;
  setPrompt: (prompt: string) => void;
  preserveIdentity: boolean;
  setPreserveIdentity: (v: boolean) => void;
  preserveComposition: boolean;
  setPreserveComposition: (v: boolean) => void;
  qualityMode: QualityMode;
  setQualityMode: (mode: QualityMode) => void;

  // Compare mode
  compareMode: "off" | "split" | "toggle";
  setCompareMode: (mode: "off" | "split" | "toggle") => void;

  // MVP2: prompt history (in-memory; persisted via Tauri command separately)
  recentPrompts: PromptHistoryEntry[];
  setRecentPrompts: (entries: PromptHistoryEntry[]) => void;
  prependRecentPrompt: (entry: PromptHistoryEntry) => void;

  // Reset (preserves recentPrompts since they are user history)
  resetEditor: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  brushMode: "none",
  setBrushMode: (mode) => set({ brushMode: mode }),
  brushSize: 20,
  setBrushSize: (size) => set({ brushSize: size }),
  brushSoftness: 50,
  setBrushSoftness: (softness) => set({ brushSoftness: softness }),
  showMask: true,
  setShowMask: (show) => set({ showMask: show }),
  maskDataUrl: "",
  setMaskDataUrl: (url) => set({ maskDataUrl: url }),

  prompt: "",
  setPrompt: (prompt) => set({ prompt }),
  preserveIdentity: false,
  setPreserveIdentity: (v) => set({ preserveIdentity: v }),
  preserveComposition: true,
  setPreserveComposition: (v) => set({ preserveComposition: v }),
  qualityMode: "draft",
  setQualityMode: (mode) => set({ qualityMode: mode }),

  compareMode: "off",
  setCompareMode: (mode) => set({ compareMode: mode }),

  recentPrompts: [],
  setRecentPrompts: (entries) => set({ recentPrompts: entries }),
  prependRecentPrompt: (entry) =>
    set((state) => {
      const dedup = state.recentPrompts.filter(
        (e) => e.rawPrompt.trim() !== entry.rawPrompt.trim()
      );
      return {
        recentPrompts: [entry, ...dedup].slice(0, RECENT_LIMIT),
      };
    }),

  resetEditor: () =>
    set({
      brushMode: "none",
      brushSize: 20,
      brushSoftness: 50,
      showMask: true,
      maskDataUrl: "",
      prompt: "",
      preserveIdentity: false,
      preserveComposition: true,
      qualityMode: "draft",
      compareMode: "off",
    }),
}));
