import type {
  EffectiveMarketingContent,
  ExposeConfiguration,
  ExposeMedia,
  ExposeTemplateId,
} from './expose-model';
import { ModernExposeTemplate } from './components/modern-expose-template';
import { ClassicExposeTemplate } from './components/classic-expose-template';
import { ElegantExposeTemplate } from './components/elegant-expose-template';
import type { BrokerProfile, Property } from '../../create/[id]/types';
import type { Translator } from '@/lib/i18n/core';

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
  /** Configured Broker Profile; templates fall back to the property's legacy agent data. */
  brokerProfile?: BrokerProfile | null;
  /** Locale-bound translator for the rendered document (defaults to English). */
  translations?: Translator;
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
    label: 'templates.modern',
    description: 'templates.modernDescription',
    component: ModernExposeTemplate,
  },
  {
    id: 'classic',
    label: 'templates.classic',
    description: 'templates.classicDescription',
    component: ClassicExposeTemplate,
  },
  {
    id: 'elegant',
    label: 'templates.elegant',
    description: 'templates.elegantDescription',
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
