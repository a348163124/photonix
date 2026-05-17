import { create } from "zustand";
import type { QualityMode } from "@/types";

export type BatchJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export interface BatchEditItem {
  id: string;
  imageId: string;
  imageFilename: string;
  imageSourcePath: string;
  imageWidth: number;
  imageHeight: number;
  prompt: string;
  presetId: string | null;
  qualityMode: QualityMode;
  status: BatchJobStatus;
  resultVersionId?: string;
  error?: string;
}

interface BatchState {
  // Library multi-selection
  selectedImageIds: Set<string>;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setSelection: (ids: string[]) => void;

  // Queue
  items: BatchEditItem[];
  setItems: (items: BatchEditItem[]) => void;
  updateItem: (id: string, patch: Partial<BatchEditItem>) => void;
  cancelQueued: () => void;
  removeItem: (id: string) => void;

  isRunning: boolean;
  setRunning: (v: boolean) => void;

  // Dialog open state
  dialogOpen: boolean;
  setDialogOpen: (v: boolean) => void;
}

export const useBatchStore = create<BatchState>((set) => ({
  selectedImageIds: new Set(),
  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedImageIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedImageIds: next };
    }),
  clearSelection: () => set({ selectedImageIds: new Set() }),
  setSelection: (ids) => set({ selectedImageIds: new Set(ids) }),

  items: [],
  setItems: (items) => set({ items }),
  updateItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    })),
  cancelQueued: () =>
    set((state) => ({
      items: state.items.map((it) =>
        it.status === "queued" ? { ...it, status: "canceled" as const } : it
      ),
    })),
  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((it) => it.id !== id) })),

  isRunning: false,
  setRunning: (v) => set({ isRunning: v }),

  dialogOpen: false,
  setDialogOpen: (v) => set({ dialogOpen: v }),
}));
