import { getTranslations } from '@/lib/i18n/core';
import { GeometryPage } from '@/components/geometry/GeometryPage';

export const metadata = {
  title: getTranslations('en').t('geometry.pageTitle'),
};

export default function GeometryRoute() {
  return <GeometryPage />;
}
