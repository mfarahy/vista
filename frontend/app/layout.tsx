import './globals.css';
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { I18nProvider } from '@/lib/i18n';
import { getTranslations } from '@/lib/i18n/core';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Vista',
  description: getTranslations('en').t('meta.description'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn('font-sans', geist.variable)}>
      <body>
        <I18nProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
            {children}
            <Toaster position="bottom-right" richColors closeButton />
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
