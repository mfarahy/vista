import { getTranslations } from '@/lib/i18n/core';
import { ThreeDPreview } from '@/components/preview/three-d/ThreeDPreview';

export const metadata = {
  title: getTranslations('en').t('viewers.nav.threeD'),
};

export default function ThreeDPage() {
  return (
    <div className="h-dvh w-full overflow-hidden">
      <ThreeDPreview />
    </div>
  );
}