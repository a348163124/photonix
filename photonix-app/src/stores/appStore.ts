import { create } from "zustand";
import type { AppView, ImageAsset, ImageVersion } from "@/types";

interface AppState {
  // Navigation
  currentView: AppView;
  setView: (view: AppView) => void;

  // Library
  images: ImageAsset[];
  setImages: (images: ImageAsset[]) => void;
  selectedImageId: string | null;
  selectImage: (id: string | null) => void;

  // Editor
  currentVersions: ImageVersion[];
  setCurrentVersions: (versions: ImageVersion[]) => void;
  activeVersionId: string | null;
  setActiveVersion: (id: string | null) => void;

  // Job status
  isProcessing: boolean;
  setProcessing: (v: boolean) => void;
  jobMessage: string | null;
  setJobMessage: (msg: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: "library",
  setView: (view) => set({ currentView: view }),

  images: [],
  setImages: (images) => set({ images }),
  selectedImageId: null,
  selectImage: (id) => set({ selectedImageId: id }),

  currentVersions: [],
  setCurrentVersions: (versions) => set({ currentVersions: versions }),
  activeVersionId: null,
  setActiveVersion: (id) => set({ activeVersionId: id }),

  isProcessing: false,
  setProcessing: (v) => set({ isProcessing: v }),
  jobMessage: null,
  setJobMessage: (msg) => set({ jobMessage: msg }),
}));
