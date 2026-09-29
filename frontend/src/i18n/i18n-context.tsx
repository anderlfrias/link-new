"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  type I18nContextValue,
  type InterpolationParams,
  type Locale,
} from "./types";
import { es } from "./locales/es";
import { en } from "./locales/en";

const dictionaries = {
  es,
  en,
};

export const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "es" || stored === "en") {
      return stored;
    }
  } catch {
    // LocalStorage inaccessible (privado o SSR)
  }

  return DEFAULT_LOCALE;
}

interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: Locale;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE);

  useEffect(() => {
    if (!initialLocale) {
      const detected = getInitialLocale();
      setLocaleState(detected);
    }
  }, [initialLocale]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
      if (typeof document !== "undefined") {
        document.documentElement.lang = newLocale;
      }
    } catch {
      // Ignorar error de storage
    }
  }, []);

  const t = useCallback(
    (key: string, params?: InterpolationParams): string => {
      const parts = key.split(".");
      const currentDict = dictionaries[locale] as Record<string, unknown>;
      const fallbackDict = dictionaries[DEFAULT_LOCALE] as Record<string, unknown>;

      let result: unknown = currentDict;
      for (const part of parts) {
        if (result && typeof result === "object" && part in (result as Record<string, unknown>)) {
          result = (result as Record<string, unknown>)[part];
        } else {
          result = undefined;
          break;
        }
      }

      if (typeof result !== "string") {
        // Fallback al diccionario por defecto si no se encontró en el actual
        let fallbackResult: unknown = fallbackDict;
        for (const part of parts) {
          if (
            fallbackResult &&
            typeof fallbackResult === "object" &&
            part in (fallbackResult as Record<string, unknown>)
          ) {
            fallbackResult = (fallbackResult as Record<string, unknown>)[part];
          } else {
            fallbackResult = undefined;
            break;
          }
        }
        result = typeof fallbackResult === "string" ? fallbackResult : key;
      }

      let text = String(result);

      if (params) {
        for (const [paramKey, paramValue] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramValue));
        }
      }

      return text;
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function defaultTranslate(key: string, params?: InterpolationParams): string {
  const parts = key.split(".");
  let current: unknown = es;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      current = undefined;
      break;
    }
  }
  let text = typeof current === "string" ? current : key;
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramValue));
    }
  }
  return text;
}

const NOOP_SET_LOCALE = () => {};

const FALLBACK_CONTEXT_VALUE: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: NOOP_SET_LOCALE,
  t: defaultTranslate,
};

export function useTranslation(): I18nContextValue {
  const context = useContext(I18nContext);
  return context ?? FALLBACK_CONTEXT_VALUE;
}
