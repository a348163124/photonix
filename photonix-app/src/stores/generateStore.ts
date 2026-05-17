import { create } from "zustand";
import type { GeneratedImage, GenerationQuality, GenerationSize } from "@/types";

interface GenerateState {
  // Form state
  prompt: string;
  setPrompt: (p: string) => void;
  size: GenerationSize;
  setSize: (s: GenerationSize) => void;
  quality: GenerationQuality;
  setQuality: (q: GenerationQuality) => void;

  // Gallery
  images: GeneratedImage[];
  setImages: (images: GeneratedImage[]) => void;
  prependImage: (image: GeneratedImage) => void;
  removeImage: (id: string) => void;

  // Selection (for preview)
  selectedId: string | null;
  selectImage: (id: string | null) => void;

  // Status
  isGenerating: boolean;
  setGenerating: (v: boolean) => void;
  lastError: string | null;
  setLastError: (e: string | null) => void;
}

export const useGenerateStore = create<GenerateState>((set) => ({
  prompt: "",
  setPrompt: (p) => set({ prompt: p }),
  size: "1024x1024",
  setSize: (s) => set({ size: s }),
  quality: "standard",
  setQuality: (q) => set({ quality: q }),

  images: [],
  setImages: (images) => set({ images }),
  prependImage: (image) =>
    set((state) => ({
      images: [image, ...state.images],
      selectedId: image.id,
    })),
  removeImage: (id) =>
    set((state) => ({
      images: state.images.filter((i) => i.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  selectedId: null,
  selectImage: (id) => set({ selectedId: id }),

  isGenerating: false,
  setGenerating: (v) => set({ isGenerating: v }),
  lastError: null,
  setLastError: (e) => set({ lastError: e }),
}));
