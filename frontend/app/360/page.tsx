import { getTranslations } from '@/lib/i18n/core';
import { ThreeSixtyPreview } from '@/components/preview/three-sixty/ThreeSixtyPreview';

export const metadata = {
  title: getTranslations('en').t('viewers.nav.threeSixty'),
};

export default function ThreeSixtyPage() {
  return (
    <div className="h-dvh w-full overflow-hidden">
      <ThreeSixtyPreview />
    </div>
  );
}