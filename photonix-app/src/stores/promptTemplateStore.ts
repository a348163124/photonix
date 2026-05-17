import { create } from "zustand";
import type { PromptTemplate, PromptTemplateMode } from "@/types";

interface PromptTemplateState {
  templates: PromptTemplate[];
  setTemplates: (templates: PromptTemplate[]) => void;
  addTemplate: (template: PromptTemplate) => void;
  updateTemplate: (id: string, patch: Partial<PromptTemplate>) => void;
  removeTemplate: (id: string) => void;

  // Filters
  modeFilter: PromptTemplateMode | "all";
  setModeFilter: (mode: PromptTemplateMode | "all") => void;
  categoryFilter: string | "all";
  setCategoryFilter: (cat: string | "all") => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Selected detail
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;

  // Where to apply the next "Apply to..." action. The Generate / Editor
  // entry-point buttons set this and switch the view; the Prompt Center reads
  // it to decide which "Apply" CTA gets emphasised.
  applyTarget: "generate" | "editor" | null;
  setApplyTarget: (t: "generate" | "editor" | null) => void;
}

export const usePromptTemplateStore = create<PromptTemplateState>((set) => ({
  templates: [],
  setTemplates: (templates) => set({ templates }),
  addTemplate: (template) =>
    set((state) => ({
      templates: [template, ...state.templates.filter((t) => t.id !== template.id)],
    })),
  updateTemplate: (id, patch) =>
    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
      ),
    })),
  removeTemplate: (id) =>
    set((state) => ({ templates: state.templates.filter((t) => t.id !== id) })),

  modeFilter: "all",
  setModeFilter: (mode) => set({ modeFilter: mode }),
  categoryFilter: "all",
  setCategoryFilter: (cat) => set({ categoryFilter: cat }),
  favoritesOnly: false,
  setFavoritesOnly: (v) => set({ favoritesOnly: v }),
  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),

  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id }),

  applyTarget: null,
  setApplyTarget: (t) => set({ applyTarget: t }),
}));
