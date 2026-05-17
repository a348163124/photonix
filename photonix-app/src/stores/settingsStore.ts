import { create } from "zustand";
import type { ExportPresetId, Language, ProviderConfig, UploadProxyProfile } from "@/types";

interface SettingsState {
  /** Non-secret provider config (baseUrl + model names). */
  provider: ProviderConfig;
  setProvider: (config: Partial<ProviderConfig>) => void;

  /**
   * Whether an API key is currently saved in the platform secret store.
   * The actual key never enters JS state — Rust commands read it directly
   * from the OS keyring on demand.
   */
  hasApiKey: boolean;
  setHasApiKey: (v: boolean) => void;

  // MVP2
  uploadProxyProfile: UploadProxyProfile;
  setUploadProxyProfile: (p: UploadProxyProfile) => void;
  defaultExportPreset: ExportPresetId;
  setDefaultExportPreset: (p: ExportPresetId) => void;

  // MVP4: UI language
  language: Language;
  setLanguage: (language: Language) => void;
}

const defaultProvider: ProviderConfig = {
  baseUrl: "https://api.openai.com/v1",
  imageModel: "gpt-image-2",
  textModel: "gpt-5.4-mini",
  fallbackTextModel: "gpt-5.4",
  visionModel: "gpt-5.4o",
};

export const useSettingsStore = create<SettingsState>((set) => ({
  provider: defaultProvider,
  setProvider: (config) =>
    set((state) => ({
      provider: { ...state.provider, ...config },
    })),

  hasApiKey: false,
  setHasApiKey: (v) => set({ hasApiKey: v }),

  uploadProxyProfile: "recommended",
  setUploadProxyProfile: (p) => set({ uploadProxyProfile: p }),

  defaultExportPreset: "wechat_moments",
  setDefaultExportPreset: (p) => set({ defaultExportPreset: p }),

  language: detectDefaultLanguage(),
  setLanguage: (language) => set({ language }),
}));

function detectDefaultLanguage(): Language {
  if (typeof navigator !== "undefined") {
    const locale = navigator.language || navigator.languages?.[0] || "";
    if (locale.toLowerCase().startsWith("zh")) return "zh-CN";
  }
  return "en";
}
