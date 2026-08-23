'use client';

import { Languages } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n, supportedLocales, type Locale } from '@/lib/i18n';

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
};

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
      <SelectTrigger aria-label={t('common.language')} className="w-fit">
        <Languages className="size-4" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {supportedLocales.map((item) => (
          <SelectItem key={item} value={item}>
            {LOCALE_LABELS[item]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
