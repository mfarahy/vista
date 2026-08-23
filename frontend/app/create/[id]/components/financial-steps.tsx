import { LoaderCircle } from 'lucide-react';
import type {
  BorisEnrichment,
  ExposeData,
  PropertyPayload,
  SetProperty,
} from '../types';
import { LEGAL_FLAG_LABELS, additionalInfoLabel } from '../types';
import type { AdditionalInfoCandidate, WizardFieldCandidate } from '../document-prefill';
import { shouldShowInvestment } from '../wizard-steps';
import { GroupCard, DateInput, Input, Section, SectionNotes, Select, Textarea, Toggle, UnitInput } from './ui';
import { DocumentSources } from './document-sources';
import { AddressIntelligencePanel } from './debug';

function formatEuro(value?: number | null): string {
  if (value == null) return '';
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value)} €`;
}

export function StepFinancial({
  property,
  set,
  exposeData,
  updateExposeData,
  sources,
  boris,
  borisLoading,
}: {
  property: PropertyPayload;
  set: SetProperty;
  exposeData: ExposeData;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  sources?: Record<string, WizardFieldCandidate[]>;
  boris?: BorisEnrichment | null;
  borisLoading?: boolean;
}) {
  const pricing = exposeData.pricing;
  const sale = property.transactionType === 'sale';
  const showInvestment = shouldShowInvestment(
    exposeData.basicInformation.usageType,
    property.transactionType,
  );
  const setPricing = (patch: Partial<ExposeData['pricing']>) =>
    updateExposeData({ pricing: { ...pricing, ...patch } });
  const setRental = (patch: Partial<ExposeData['rental']>) =>
    updateExposeData({ rental: { ...(exposeData.rental ?? {}), ...patch } });
  const setInvestment = (patch: Partial<ExposeData['investment']>) =>
    updateExposeData({ investment: { ...(exposeData.investment ?? {}), ...patch } });

  return (
    <Section
      title="Finanzen"
      description="Preis- und Provisionsangaben. Werte werden nicht automatisch berechnet — nur eingetragene Angaben zählen."
    >
      <div className="space-y-6">
        {sale ? (
          <GroupCard title="Kaufpreis">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <UnitInput
                  label="Kaufpreis"
                  unit="€"
                  type="number"
                  value={pricing.purchasePrice ?? property.askingPrice}
                  onChange={(value) => set('askingPrice', value ? Number(value) : null)}
                  placeholder="z. B. 440000"
                />
                <DocumentSources sources={sources?.askingPrice} />
              </div>
              <div>
                <UnitInput
                  label="Kaufpreis / m²"
                  unit="€/m²"
                  type="number"
                  value={pricing.pricePerM2}
                  onChange={(value) => setPricing({ pricePerM2: value ? Number(value) : null })}
                  placeholder="Nur wenn angegeben"
                />
                <DocumentSources sources={sources?.pricePerM2} />
              </div>
              <div>
                <UnitInput
                  label="Bodenrichtwert"
                  unit="€/m²"
                  type="number"
                  value={property.bodenrichtwert}
                  onChange={(value) => set('bodenrichtwert', value ? Number(value) : null)}
                  placeholder={
                    boris?.bodenrichtwert?.value != null
                      ? String(boris.bodenrichtwert.value)
                      : 'Optional'
                  }
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {pricing.purchasePrice ? formatEuro(pricing.purchasePrice) : 'Noch kein Kaufpreis'} ·{' '}
              {pricing.pricePerM2 ? `${formatEuro(pricing.pricePerM2)} / m²` : '€/m² nicht angegeben'}
            </p>
          </GroupCard>
        ) : (
          <GroupCard title="Miete">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <UnitInput
                  label="Kaltmiete / Monat"
                  unit="€"
                  type="number"
                  value={property.coldRent}
                  onChange={(value) => set('coldRent', value ? Number(value) : null)}
                  placeholder="z. B. 1900"
                />
                <DocumentSources sources={sources?.monthlyRent} />
              </div>
              <div>
                <UnitInput
                  label="Nebenkosten / Monat"
                  unit="€"
                  type="number"
                  value={pricing.additionalCosts ?? property.additionalCosts}
                  onChange={(value) => set('additionalCosts', value ? Number(value) : null)}
                  placeholder="z. B. 350"
                />
                <DocumentSources sources={sources?.additionalCosts} />
              </div>
              <div>
                <UnitInput
                  label="Kaution"
                  unit="€"
                  type="number"
                  value={property.deposit}
                  onChange={(value) => set('deposit', value ? Number(value) : null)}
                  placeholder="Optional"
                />
                <DocumentSources sources={sources?.deposit} />
              </div>
              <div>
                <DateInput
                  label="Verfügbar ab"
                  value={property.availableFrom}
                  onChange={(value) => set('availableFrom', value)}
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {property.coldRent ? `${formatEuro(property.coldRent)} Kaltmiete` : 'Noch keine Miete'}
            </p>
          </GroupCard>
        )}

        {borisLoading && (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Bodenrichtwert wird geprüft…
          </p>
        )}

        {boris?.available && boris.bodenrichtwert?.value != null && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <p className="font-semibold">Bodenrichtwert {boris.bodenrichtwert.value} €/m²</p>
            <p className="mt-0.5 text-amber-700">
              Quelle: {boris.source}
              {boris.referenceDate
                ? ` · Stichtag: ${new Date(boris.referenceDate).toLocaleDateString('de-DE')}`
                : ''}
            </p>
            <p className="mt-1 text-amber-600">
              Amtlicher Wert als Vorschlag — Sie können ihn jederzeit ändern.
            </p>
          </div>
        )}

        {sale && (
          <GroupCard title="Provision">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <UnitInput
                  label="Provisionssatz"
                  unit="%"
                  type="number"
                  value={pricing.commissionRate}
                  onChange={(value) => setPricing({ commissionRate: value ? Number(value) : null })}
                  placeholder="z. B. 3,57"
                />
                <DocumentSources sources={sources?.commissionRate} />
              </div>
              <div>
                <Select
                  label="Provisionszahler"
                  value={pricing.commissionPayer ?? ''}
                  onChange={(value) =>
                    setPricing({
                      commissionPayer: (value || null) as ExposeData['pricing']['commissionPayer'],
                    })
                  }
                  placeholder="Auswählen"
                  options={[
                    ['buyer', 'Käufer'],
                    ['seller', 'Verkäufer'],
                    ['both', 'Beide'],
                  ]}
                />
                <DocumentSources sources={sources?.commissionPayer} />
              </div>
              <div className="flex items-end pb-1">
                <Toggle
                  label="inkl. MwSt."
                  checked={pricing.commissionVatIncluded === true}
                  onChange={(checked) => setPricing({ commissionVatIncluded: checked || null })}
                />
              </div>
            </div>
          </GroupCard>
        )}

        {showInvestment && (
          <GroupCard
            title="Miete & Rendite"
            description="Angaben für vermietete oder als Kapitalanlage genutzte Objekte."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Toggle
                label="Vermietet"
                checked={exposeData.rental?.isRented === true}
                onChange={(checked) => setRental({ isRented: checked || null })}
              />
              <Toggle
                label="Möbliert"
                checked={exposeData.rental?.furnished === true}
                onChange={(checked) => setRental({ furnished: checked || null })}
              />
              <div>
                <UnitInput
                  label="Monatsmiete"
                  unit="€"
                  type="number"
                  value={property.coldRent}
                  onChange={(value) => set('coldRent', value ? Number(value) : null)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <UnitInput
                  label="Jahresmiete"
                  unit="€"
                  type="number"
                  value={exposeData.rental?.annualRent}
                  onChange={(value) => setRental({ annualRent: value ? Number(value) : null })}
                  placeholder="Optional"
                />
                <DocumentSources sources={sources?.annualRent} />
              </div>
              <div>
                <UnitInput
                  label="Nebenkosten / Monat"
                  unit="€"
                  type="number"
                  value={pricing.additionalCosts ?? property.additionalCosts}
                  onChange={(value) => set('additionalCosts', value ? Number(value) : null)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <UnitInput
                  label="Kaution"
                  unit="€"
                  type="number"
                  value={property.deposit}
                  onChange={(value) => set('deposit', value ? Number(value) : null)}
                  placeholder="Optional"
                />
                <DocumentSources sources={sources?.deposit} />
              </div>
              <div>
                <DateInput
                  label="Verfügbar ab"
                  value={property.availableFrom}
                  onChange={(value) => set('availableFrom', value)}
                />
              </div>
              <div>
                <UnitInput
                  label="Bruttorendite (Soll)"
                  unit="%"
                  type="number"
                  value={exposeData.investment?.grossYieldTargetPercent}
                  onChange={(value) =>
                    setInvestment({
                      grossYieldTargetPercent: value ? Number(value) : null,
                    })
                  }
                  placeholder="Optional"
                />
                <DocumentSources sources={sources?.grossYieldTarget} />
              </div>
              <div>
                <UnitInput
                  label="Bruttorendite (Ist)"
                  unit="%"
                  type="number"
                  value={exposeData.investment?.grossYieldActualPercent}
                  onChange={(value) =>
                    setInvestment({
                      grossYieldActualPercent: value ? Number(value) : null,
                    })
                  }
                  placeholder="Optional"
                />
                <DocumentSources sources={sources?.grossYieldActual} />
              </div>
            </div>
          </GroupCard>
        )}
      </div>
    </Section>
  );
}

export function StepLegal({
  exposeData,
  updateExposeData,
  sources,
  additionalInfo,
  noteValue,
  setNote,
}: {
  exposeData: ExposeData;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  sources?: Record<string, WizardFieldCandidate[]>;
  additionalInfo: Record<string, AdditionalInfoCandidate[]>;
  noteValue: (key: string) => string;
  setNote: (key: string, value: string) => void;
}) {
  const flags = exposeData.additionalInformation.legalFlags ?? {};
  const setFlag = (key: keyof typeof flags, value: boolean) =>
    updateExposeData({
      additionalInformation: {
        ...exposeData.additionalInformation,
        legalFlags: { ...flags, [key]: value || null },
      },
    });
  const flagGroups = Object.entries(flags);

  return (
    <Section
      title="Recht & Zusätzliches"
      description="Kompakte rechtliche Angaben sowie dokumentierte Zusatzinformationen aus Ihren Unterlagen."
    >
      <div className="space-y-6">
        <GroupCard title="Rechtliche Angaben">
          <div className="grid gap-2 sm:grid-cols-2">
            {flagGroups.map(([key, value]) => (
              <Toggle
                key={key}
                label={LEGAL_FLAG_LABELS[key] ?? key}
                checked={value === true}
                onChange={(checked) => setFlag(key as keyof typeof flags, checked)}
              />
            ))}
            {flagGroups.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Keine rechtlichen Angaben vorhanden.
              </p>
            )}
          </div>
          <div className="mt-4">
            <DocumentSources sources={sources?.usufruct} />
            <DocumentSources sources={sources?.leasehold} />
            <DocumentSources sources={sources?.foreclosure} />
            <DocumentSources sources={sources?.heritageProtection} />
          </div>
        </GroupCard>

        <GroupCard
          title="Zusätzliche Informationen"
          description="Diese Angaben stammen aus Ihren Dokumenten und bleiben dem jeweiligen Dokument zugeordnet."
        >
          {Object.keys(additionalInfo).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine zusätzlichen Informationen aus Dokumenten erkannt.
            </p>
          ) : (
            <div className="space-y-4">
              {Object.entries(additionalInfo).map(([key, candidates]) => (
                <div key={key} className="rounded-lg border bg-card p-3.5">
                  <p className="text-sm font-semibold text-foreground">
                    {additionalInfoLabel(key)}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {candidates.map((candidate, index) => (
                      <div
                        key={`${candidate.sourceDocumentId}-${index}`}
                        className="flex items-start justify-between gap-3 text-xs"
                      >
                        <span className="min-w-0 text-foreground">
                          {formatAdditionalValue(candidate.value)}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {candidate.sourceFilename}
                        </span>
                      </div>
                    ))}
                  </div>
                  {candidates.some((candidate) => candidate.evidence) && (
                    <ul className="mt-2 space-y-1">
                      {candidates
                        .filter((candidate) => candidate.evidence)
                        .map((candidate, index) => (
                          <li key={`evidence-${index}`} className="text-xs text-muted-foreground">
                            Beleg: “{candidate.evidence}”
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </GroupCard>

        <Textarea
          label="Rechtliche Notizen"
          value={exposeData.additionalInformation.legalNotes}
          onChange={(value) =>
            updateExposeData({
              additionalInformation: {
                ...exposeData.additionalInformation,
                legalNotes: value || null,
              },
            })
          }
          placeholder="Besonderheiten, Auflassungsvormerkungen, Baulasten usw."
        />

        <SectionNotes
          value={noteValue('legal')}
          onChange={(value) => setNote('legal', value)}
          placeholder="Weitere rechtliche Hinweise…"
        />
      </div>
    </Section>
  );
}

function formatAdditionalValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export function StepLocation({
  property,
  set,
  exposeData,
  updateExposeData,
  sources,
  propertyId,
  address,
  addressSelected,
  onData,
}: {
  property: PropertyPayload;
  set: SetProperty;
  exposeData: ExposeData;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  sources?: Record<string, WizardFieldCandidate[]>;
  propertyId: string;
  address: ExposeData['basicInformation']['address'];
  addressSelected: boolean;
  onData?: (results: Record<string, unknown>) => void;
}) {
  const surroundings = property.surroundings ?? {};
  const setSurrounding = (key: string, value: string) =>
    set('surroundings', { ...surroundings, [key]: value });
  const rows: Array<[string, string, string]> = [
    ['transport', 'Öffentlicher Nahverkehr', 'z. B. U7, Buslinie 121'],
    ['schools', 'Schulen', 'z. B. Grundschule am Park'],
    ['childcare', 'Kindergärten', 'z. B. Kita Sonnenschein'],
    ['shopping', 'Einkaufsmöglichkeiten', 'z. B. Supermarkt, Wochenmarkt'],
    ['medical', 'Medizinische Versorgung', 'z. B. Hausarzt in 500 m'],
    ['parks', 'Freizeit & Naherholung', 'z. B. Volkspark, Spielplatz'],
  ];

  return (
    <Section
      title="Lage"
      description="Standortkontext für das Exposé — getrennt von der postalischen Adresse."
    >
      <div className="space-y-6">
        <GroupCard title="Umgebung">
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Input
                label="Stadtteil"
                value={exposeData.location.district ?? property.district ?? ''}
                onChange={(value) => {
                  updateExposeData({
                    location: { ...exposeData.location, district: value || null },
                    basicInformation: {
                      ...exposeData.basicInformation,
                      address: {
                        ...exposeData.basicInformation.address,
                        district: value || null,
                      },
                    },
                  });
                  set('district', value || null);
                }}
                placeholder="z. B. Neukölln"
              />
              <DocumentSources sources={sources?.district} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {rows.map(([key, label, placeholder]) => (
              <div key={key}>
                <Input
                  label={label}
                  value={surroundings[key] ?? ''}
                  onChange={(value) => setSurrounding(key, value)}
                  placeholder={placeholder}
                />
              </div>
            ))}
          </div>
        </GroupCard>

        {addressSelected && (
          <AddressIntelligencePanel
            propertyId={propertyId}
            property={property}
            address={address}
            onData={onData}
          />
        )}

        <Textarea
          label="Lagebeschreibung"
          value={exposeData.location.description ?? property.locationNote ?? ''}
          onChange={(value) => {
            updateExposeData({
              location: { ...exposeData.location, description: value || null },
            });
            set('locationNote', value || null);
          }}
          placeholder="Beschreibung der Lage und Umgebung…"
          rows={3}
        />
      </div>
    </Section>
  );
}

export function StepYourInformation({
  property,
  set,
  exposeData,
  updateExposeData,
  setNote,
  noteValue,
}: {
  property: PropertyPayload;
  set: SetProperty;
  exposeData: ExposeData;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  setNote: (key: string, value: string) => void;
  noteValue: (key: string) => string;
}) {
  return (
    <Section
      title="Ihre Angaben"
      description="Ihre persönlichen Eindrücke. Diese Angaben helfen später bei der Erstellung des Exposés — sie sind keine Dokumentdaten."
    >
      <div className="space-y-5">
        <Textarea
          label="Was macht diese Immobilie besonders?"
          value={property.sellerDescription ?? ''}
          onChange={(value) => set('sellerDescription', value)}
          placeholder="z. B. ruhige Lage, viel Licht, familiäre Nachbarschaft…"
        />
        <Textarea
          label="Was gefällt Ihnen persönlich besonders?"
          value={exposeData.additionalInformation.sellerNotes ?? ''}
          onChange={(value) =>
            updateExposeData({
              additionalInformation: {
                ...exposeData.additionalInformation,
                sellerNotes: value || null,
              },
            })
          }
          placeholder="Ihre eigenen Eindrücke und Erlebnisse…"
        />
        <Textarea
          label="Gibt es etwas, das Interessenten wissen sollten?"
          value={property.specialNotes ?? ''}
          onChange={(value) => set('specialNotes', value)}
          placeholder="z. B. anstehende Modernisierungen, Besonderheiten des Hauses…"
        />
        <Textarea
          label="Für wen ist die Immobilie besonders geeignet?"
          value={property.targetAudience ?? ''}
          onChange={(value) => set('targetAudience', value)}
          placeholder="z. B. junge Familien, Paare, Kapitalanleger…"
        />
        <Textarea
          label="Zusätzliche Notizen"
          value={exposeData.additionalInformation.additionalInformation ?? ''}
          onChange={(value) =>
            updateExposeData({
              additionalInformation: {
                ...exposeData.additionalInformation,
                additionalInformation: value || null,
              },
            })
          }
          placeholder="Alles Weitere, das für das Exposé wichtig sein könnte…"
        />
        <div className="rounded-lg border border-dashed bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ihre Notizen
          </p>
          <textarea
            className="mt-3 w-full resize-y rounded-md border bg-card p-2 text-sm"
            value={noteValue('yourInfo')}
            onChange={(event) => setNote('yourInfo', event.target.value)}
            placeholder="Interne Notizen, die nicht ins Exposé fließen…"
          />
        </div>
      </div>
    </Section>
  );
}