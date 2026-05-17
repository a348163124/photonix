import { create } from "zustand";
import type { EditCandidate } from "@/types";

export type CandidateRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export interface CandidateRunItem {
  /** Local-only id used for UI tracking before any persistence. */
  id: string;
  imageId: string;
  groupId: string;
  label: string;
  promptModifier: string;
  status: CandidateRunStatus;
  /** Filled in after the underlying edit job succeeds. */
  versionId?: string;
  error?: string;
}

interface CandidateState {
  /** Persisted candidates per image (keyed by imageId). */
  byImage: Record<string, EditCandidate[]>;
  setForImage: (imageId: string, candidates: EditCandidate[]) => void;
  addForImage: (imageId: string, candidate: EditCandidate) => void;
  updateForImage: (
    imageId: string,
    candidateId: string,
    patch: Partial<EditCandidate>
  ) => void;
  removeForImage: (imageId: string, candidateId: string) => void;

  /** Run-time queue (not persisted). */
  runItems: CandidateRunItem[];
  setRunItems: (items: CandidateRunItem[]) => void;
  updateRunItem: (id: string, patch: Partial<CandidateRunItem>) => void;
  clearRunItems: () => void;

  isRunning: boolean;
  setRunning: (v: boolean) => void;
}

export const useCandidateStore = create<CandidateState>((set) => ({
  byImage: {},
  setForImage: (imageId, candidates) =>
    set((state) => ({ byImage: { ...state.byImage, [imageId]: candidates } })),
  addForImage: (imageId, candidate) =>
    set((state) => ({
      byImage: {
        ...state.byImage,
        [imageId]: [candidate, ...(state.byImage[imageId] ?? [])],
      },
    })),
  updateForImage: (imageId, candidateId, patch) =>
    set((state) => ({
      byImage: {
        ...state.byImage,
        [imageId]: (state.byImage[imageId] ?? []).map((c) =>
          c.id === candidateId ? { ...c, ...patch } : c
        ),
      },
    })),
  removeForImage: (imageId, candidateId) =>
    set((state) => ({
      byImage: {
        ...state.byImage,
        [imageId]: (state.byImage[imageId] ?? []).filter(
          (c) => c.id !== candidateId
        ),
      },
    })),

  runItems: [],
  setRunItems: (items) => set({ runItems: items }),
  updateRunItem: (id, patch) =>
    set((state) => ({
      runItems: state.runItems.map((it) =>
        it.id === id ? { ...it, ...patch } : it
      ),
    })),
  clearRunItems: () => set({ runItems: [] }),

  isRunning: false,
  setRunning: (v) => set({ isRunning: v }),
}));
