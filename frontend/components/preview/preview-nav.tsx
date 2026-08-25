'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

/**
 * Minimal navigation between the two isolated viewer preview pages.
 * Pure route links — shares no viewer state with either implementation.
 */
export function PreviewNav({ current }: { current: '3d' | '360' }) {
  const { t } = useI18n();

  const items = [
    { id: '3d', href: '/3d', label: t('viewers.nav.threeD') },
    { id: '360', href: '/360', label: t('viewers.nav.threeSixty') },
  ] as const;

  return (
    <nav
      aria-label={t('viewers.nav.label')}
      className="inline-flex items-center gap-1 rounded-full border bg-background/80 p-1 shadow-sm backdrop-blur"
    >
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
            current === item.id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}