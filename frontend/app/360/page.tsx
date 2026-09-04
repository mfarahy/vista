import { getTranslations } from '@/lib/i18n/core';
import { Floorplan360Workflow } from '@/components/v360/floorplan-360-workflow';

export const metadata = {
  title: getTranslations('en').t('viewers.nav.threeSixty'),
};

export default function ThreeSixtyPage() {
  return <Floorplan360Workflow />;
}
