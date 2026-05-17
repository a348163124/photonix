import { create } from "zustand";
import {
  DEFAULT_FILENAME_TEMPLATE,
  DEFAULT_WATERMARK,
  type BorderTemplateId,
  type ExportPresetId,
  type WatermarkTemplate,
} from "@/types";

export type BatchExportStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export interface BatchExportItem {
  id: string;
  imageId: string;
  imageFilename: string;
  /** The version we'll actually write out (storage path + dimensions). */
  sourceVersionPath: string;
  sourceVersionKind: string;
  /** Human-friendly label for the strip ("current", "favorite", "draft 2"). */
  selectionLabel: string;
  /** Resolved output path after the runner reconciles the filename template. */
  outputPath: string;
  status: BatchExportStatus;
  error?: string;
}

export type BatchExportSelectionMode =
  | "current_versions" // each image's current version (or original if none)
  | "favorited_candidates"; // every favorited candidate across all images

export type OverwritePolicy = "skip" | "overwrite" | "rename";

interface BatchExportState {
  dialogOpen: boolean;
  setDialogOpen: (v: boolean) => void;

  selectionMode: BatchExportSelectionMode;
  setSelectionMode: (m: BatchExportSelectionMode) => void;

  outputFolder: string | null;
  setOutputFolder: (f: string | null) => void;

  presetId: ExportPresetId;
  setPresetId: (p: ExportPresetId) => void;

  filenameTemplate: string;
  setFilenameTemplate: (t: string) => void;

  borderId: BorderTemplateId;
  setBorderId: (b: BorderTemplateId) => void;

  watermark: WatermarkTemplate;
  setWatermark: (w: WatermarkTemplate) => void;

  overwritePolicy: OverwritePolicy;
  setOverwritePolicy: (p: OverwritePolicy) => void;

  // Queue
  items: BatchExportItem[];
  setItems: (items: BatchExportItem[]) => void;
  updateItem: (id: string, patch: Partial<BatchExportItem>) => void;
  clearItems: () => void;

  isRunning: boolean;
  setRunning: (v: boolean) => void;
}

export const useBatchExportStore = create<BatchExportState>((set) => ({
  dialogOpen: false,
  setDialogOpen: (v) => set({ dialogOpen: v }),

  selectionMode: "current_versions",
  setSelectionMode: (m) => set({ selectionMode: m }),

  outputFolder: null,
  setOutputFolder: (f) => set({ outputFolder: f }),

  presetId: "wechat_moments",
  setPresetId: (p) => set({ presetId: p }),

  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  setFilenameTemplate: (t) => set({ filenameTemplate: t }),

  borderId: "none",
  setBorderId: (b) => set({ borderId: b }),

  watermark: DEFAULT_WATERMARK,
  setWatermark: (w) => set({ watermark: w }),

  overwritePolicy: "rename",
  setOverwritePolicy: (p) => set({ overwritePolicy: p }),

  items: [],
  setItems: (items) => set({ items }),
  updateItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    })),
  clearItems: () => set({ items: [] }),

  isRunning: false,
  setRunning: (v) => set({ isRunning: v }),
}));
