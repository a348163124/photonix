import { create } from "zustand";
import en from "./dictionaries/en";
import zhCN from "./dictionaries/zh-CN";
import {
  FALLBACK_LANGUAGE,
  SUPPORTED_LANGUAGES,
  type Language,
  type TranslationDictionary,
} from "./types";

const DICTIONARIES: Record<Language, TranslationDictionary> = {
  en,
  "zh-CN": zhCN,
};

export type { Language } from "./types";
export { SUPPORTED_LANGUAGES, FALLBACK_LANGUAGE } from "./types";

interface I18nState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

/**
 * Initial language guess. The settings bootstrap will override this with the
 * persisted choice. We start with the OS default so the very first render
 * uses the right language.
 */
const initialLanguage: Language = detectOsLanguage();

export const useI18nStore = create<I18nState>((set) => ({
  language: initialLanguage,
  setLanguage: (lang) => set({ language: lang }),
}));

/**
 * Hook returning the translation function bound to the current language.
 * Components rerender automatically when the language changes because they
 * subscribe to `useI18nStore.language`.
 */
export function useTranslation() {
  const language = useI18nStore((s) => s.language);
  return {
    t: makeTranslator(language),
    language,
  };
}

/** Stand-alone translator for non-React code (services, store seeds). */
export function getT() {
  return makeTranslator(useI18nStore.getState().language);
}

export type TKey = string;

function makeTranslator(language: Language) {
  const dict = DICTIONARIES[language] ?? DICTIONARIES[FALLBACK_LANGUAGE];
  const fallback = DICTIONARIES[FALLBACK_LANGUAGE];

  return function t(key: TKey, params?: Record<string, string | number>): string {
    const value = lookup(dict, key) ?? lookup(fallback, key);
    if (typeof value !== "string") {
      // Returning the key is a deliberate no-op: it makes missing entries
      // visible during dev without crashing the screen.
      return key;
    }
    return params ? format(value, params) : value;
  };
}

function lookup(dict: object, dottedKey: string): string | undefined {
  const parts = dottedKey.split(".");
  let cursor: unknown = dict;
  for (const part of parts) {
    if (cursor && typeof cursor === "object" && part in (cursor as object)) {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cursor === "string" ? cursor : undefined;
}

function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/{(\w+)}/g, (match, key) => {
    if (key in params) return String(params[key]);
    return match;
  });
}

/**
 * Detect the user's preferred UI language from the browser/OS.
 *
 * Tauri exposes the OS locale through `navigator.language`. We accept any
 * `zh*` locale as Simplified Chinese for MVP4 — Photonix doesn't ship a
 * Traditional Chinese dictionary yet — and fall back to English for
 * everything else.
 */
export function detectOsLanguage(): Language {
  try {
    const candidates: string[] = [];
    if (typeof navigator !== "undefined") {
      if (Array.isArray(navigator.languages)) {
        candidates.push(...navigator.languages);
      }
      if (navigator.language) candidates.push(navigator.language);
    }
    for (const raw of candidates) {
      const lower = raw.toLowerCase();
      if (lower.startsWith("zh")) return "zh-CN";
      if (lower.startsWith("en")) return "en";
    }
  } catch {
    // ignore — fall through
  }
  return FALLBACK_LANGUAGE;
}

/** Coerce an arbitrary string to a supported language id. */
export function coerceLanguage(raw: string | null | undefined): Language | null {
  if (!raw) return null;
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(raw)) {
    return raw as Language;
  }
  return null;
}
