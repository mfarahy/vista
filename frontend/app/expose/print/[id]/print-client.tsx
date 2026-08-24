'use client';
import type { BrokerProfile, DocumentRecord, Property } from '../../../create/[id]/types';
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
  brokerProfile,
}: {
  property: Property;
  marketingContent: EffectiveMarketingContent;
  expose: ExposeConfiguration;
  documents: DocumentRecord[];
  brokerProfile?: BrokerProfile | null;
}) {
  return (
    <ExposeDocument
      property={property}
      marketingContent={marketingContent}
      expose={expose}
      documents={documents}
      brokerProfile={brokerProfile}
      staticRender
    />
  );
}