import { create } from "zustand";
import type { ExportPresetId, ProviderConfig, UploadProxyProfile } from "@/types";

interface SettingsState {
  provider: ProviderConfig;
  setProvider: (config: Partial<ProviderConfig>) => void;

  // MVP2
  uploadProxyProfile: UploadProxyProfile;
  setUploadProxyProfile: (p: UploadProxyProfile) => void;
  defaultExportPreset: ExportPresetId;
  setDefaultExportPreset: (p: ExportPresetId) => void;
}

const defaultProvider: ProviderConfig = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  imageModel: "gpt-image-2",
  textModel: "gpt-5.4-mini",
  fallbackTextModel: "gpt-5.4",
};

export const useSettingsStore = create<SettingsState>((set) => ({
  provider: defaultProvider,
  setProvider: (config) =>
    set((state) => ({
      provider: { ...state.provider, ...config },
    })),

  uploadProxyProfile: "recommended",
  setUploadProxyProfile: (p) => set({ uploadProxyProfile: p }),

  defaultExportPreset: "wechat_moments",
  setDefaultExportPreset: (p) => set({ defaultExportPreset: p }),
}));
