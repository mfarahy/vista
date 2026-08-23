import { defaultLocale, type Locale } from './config';
import en, { type TranslationSchema } from './resources/en';
import de from './resources/de';

export { defaultLocale, isLocale, supportedLocales, type Locale } from './config';

const dictionaries: Record<Locale, TranslationSchema> = { en, de };

type Join<K extends string, P extends string> = P extends '' ? K : `${P}.${K}`;

/** Dotted resource keys for any nesting depth, e.g. "steps.object.sectionTitle". */
type NestedKeys<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? Join<K, P> : NestedKeys<T[K], Join<K, P>>;
}[keyof T & string];

export type TranslationKey = NestedKeys<TranslationSchema>;

export type TranslationParams = Record<string, string | number>;

function lookup(dict: Record<string, unknown>, key: string): string | undefined {
  const [head, ...rest] = key.split('.');
  if (!head) return undefined;
  const value = dict[head];
  if (rest.length === 0) return typeof value === 'string' ? value : undefined;
  return typeof value === 'object' && value !== null
    ? lookup(value as Record<string, unknown>, rest.join('.'))
    : undefined;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Resolves a resource key, falling back to English and finally to the key itself
 * so missing translations never break the UI. `{name}` placeholders in the
 * resource string are replaced with the given params.
 */
export function translate(
  locale: Locale,
  key: TranslationKey | string,
  params?: TranslationParams,
): string {
  const resolved =
    lookup(dictionaries[locale], key) ??
    (locale === defaultLocale ? undefined : lookup(dictionaries[defaultLocale], key)) ??
    key;
  return interpolate(resolved, params);
}

/** Locale-bound translator used by pure logic, server components and tests. */
export type Translator = {
  locale: Locale;
  t: (key: TranslationKey | string, params?: TranslationParams) => string;
};

export const translations: Record<Locale, Translator> = {
  en: { locale: 'en', t: (key, params) => translate('en', key, params) },
  de: { locale: 'de', t: (key, params) => translate('de', key, params) },
};

export function getTranslations(locale: Locale): Translator {
  return translations[locale];
}
