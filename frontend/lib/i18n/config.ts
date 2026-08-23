export const supportedLocales = ['en', 'de'] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (supportedLocales as readonly string[]).includes(value);
}
