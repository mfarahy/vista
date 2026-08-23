'use client';
import type { DocumentRecord, Property } from '../../../create/[id]/types';
import type {
  EffectiveMarketingContent,
  ExposeConfiguration,
} from '../../../builder/[id]/expose-model';
import ExposeDocument from '../../expose-document';

export default function ExposePrintClient({
  property,
  marketingContent,
  expose,
  documents,
}: {
  property: Property;
  marketingContent: EffectiveMarketingContent;
  expose: ExposeConfiguration;
  documents: DocumentRecord[];
}) {
  return (
    <ExposeDocument
      property={property}
      marketingContent={marketingContent}
      expose={expose}
      documents={documents}
      staticRender
    />
  );
}
