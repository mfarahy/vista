import type { EffectiveMarketingContent, ExposeConfiguration, ExposeMedia, ExposeTemplateId } from './expose-model';
import { ModernExposeTemplate } from './components/modern-expose-template';
import { ClassicExposeTemplate } from './components/classic-expose-template';
import { ElegantExposeTemplate } from './components/elegant-expose-template';
import type { Property } from '../../create/[id]/types';

/**
 * Exposé template registry (Phase 11).
 *
 * A template is pure presentation: it receives the same normalized data
 * (property, effective marketing content, expose configuration, media) and
 * renders HTML. The Builder live preview, the review preview, and the PDF
 * print route all resolve the template through this registry — there is never
 * a separate template implementation for the PDF.
 *
 * The registry intentionally stays minimal: id, label, description, and the
 * React component.
 */

export type ExposeTemplateProps = {
  property: Property;
  marketingContent: EffectiveMarketingContent;
  expose: ExposeConfiguration;
  media: ExposeMedia;
};

export type ExposeTemplateDefinition = {
  id: ExposeTemplateId;
  label: string;
  description: string;
  component: (props: ExposeTemplateProps) => React.ReactElement;
};

export const EXPOSE_TEMPLATES: ExposeTemplateDefinition[] = [
  {
    id: 'modern',
    label: 'Modern',
    description: 'Kontrastreiche Titelseite mit dunklem Design',
    component: ModernExposeTemplate,
  },
  {
    id: 'classic',
    label: 'Klassisch',
    description: 'Traditionelles Exposé für klassische Vermittlung',
    component: ClassicExposeTemplate,
  },
  {
    id: 'elegant',
    label: 'Elegant',
    description: 'Editorial-Design für hochwertige Immobilien',
    component: ElegantExposeTemplate,
  },
];

export const DEFAULT_TEMPLATE_ID: ExposeTemplateId = 'modern';

/**
 * Resolves a template definition by id. Unknown or missing values safely fall
 * back to the default ("modern") template.
 */
export function getExposeTemplate(id: string | null | undefined): ExposeTemplateDefinition {
  return (
    EXPOSE_TEMPLATES.find((template) => template.id === id) ??
    EXPOSE_TEMPLATES.find((template) => template.id === DEFAULT_TEMPLATE_ID)!
  );
}