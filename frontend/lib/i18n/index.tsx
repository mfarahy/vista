'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  defaultLocale,
  isLocale,
  type Locale,
  translate,
  type TranslationKey,
  type TranslationParams,
} from './core';

const STORAGE_KEY = 'vista.locale';

function readStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null; // localStorage can be unavailable (private mode, disabled storage)
  }
}

function writeStoredLocale(locale: Locale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Persisting the choice is best-effort; the session still works without it.
  }
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey | string, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  // Apply the persisted language after mount: reading it during the initial render
  // would mismatch the server-rendered HTML.
  useEffect(() => {
    const stored = readStoredLocale();
    if (stored && stored !== defaultLocale) setLocaleState(stored);
  }, []);

  // Keep the <html lang> attribute in sync with the active locale.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey | string, params?: TranslationParams) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within an I18nProvider');
  return context;
}

export {
  defaultLocale,
  isLocale,
  supportedLocales,
  getTranslations,
  translate,
  translations,
  type Locale,
  type TranslationKey,
  type TranslationParams,
  type Translator,
} from './core';
