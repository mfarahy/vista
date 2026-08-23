import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { EnergyData, ExposeData, PropertyPayload, SetProperty } from '../types';
import { ENERGY_CERTIFICATE_TYPES, ENERGY_SOURCES } from '../types';
import type { WizardFieldCandidate } from '../document-prefill';
import {
  DateInput,
  EnergyClassPicker,
  GroupCard,
  Input,
  Section,
  SectionNotes,
  Select,
  Textarea,
  Toggle,
  UnitInput,
} from './ui';
import { DocumentSources } from './document-sources';

const FEATURE_WIZARD_FIELDS = [
  'basement',
  'parking',
  'garage',
  'balcony',
  'terrace',
  'garden',
  'attic',
  'shower',
  'bathtub',
  'carport',
];

function FeatureToggle({
  label,
  description,
  active,
  onToggle,
}: {
  label: string;
  description?: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary/[0.06] text-primary'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors',
          active ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
        )}
      >
        {active && (
          <svg viewBox="0 0 12 12" className="size-3 fill-none stroke-current" strokeWidth="2">
            <path d="M2.5 6.5 5 9l4.5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="min-w-0">
        <span className="block">{label}</span>
        {description && <span className="block text-xs font-normal">{description}</span>}
      </span>
    </button>
  );
}

export function StepFeatures({
  property,
  set,
  exposeData,
  updateExposeData,
  noteValue,
  setNote,
  sources,
}: {
  property: PropertyPayload;
  set: SetProperty;
  exposeData: ExposeData;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  noteValue: (key: string) => string;
  setNote: (key: string, value: string) => void;
  sources?: Record<string, WizardFieldCandidate[]>;
}) {
  const toggle = (key: string) =>
    set(
      'selectedFeatures',
      property.selectedFeatures.includes(key)
        ? property.selectedFeatures.filter((value) => value !== key)
        : [...property.selectedFeatures, key],
    );
  const has = (key: string) => property.selectedFeatures.includes(key);
  const featureSources = FEATURE_WIZARD_FIELDS.map((field) => sources?.[field]).filter(
    (group): group is WizardFieldCandidate[] => !!group?.length,
  );
  const energy = exposeData.energy ?? {};
  const updateEnergy = (patch: Partial<EnergyData>) =>
    updateExposeData({ energy: { ...energy, ...patch } });
  const setGarden = (patch: { area?: number | null; orientation?: string | null }) => {
    const outdoorAreas = [...exposeData.outdoorAreas];
    const index = outdoorAreas.findIndex((area) => area.type === 'garden');
    if (index >= 0) {
      outdoorAreas[index] = { ...outdoorAreas[index], ...patch };
    } else {
      outdoorAreas.push({ type: 'garden', ...patch });
    }
    updateExposeData({ outdoorAreas });
  };
  const garden = exposeData.outdoorAreas.find((area) => area.type === 'garden');
  const addEquipment = () =>
    updateExposeData({
      equipment: [...exposeData.equipment, { category: 'interior', name: '', description: null }],
    });
  const updateEquipment = (index: number, patch: Partial<ExposeData['equipment'][number]>) =>
    updateExposeData({
      equipment: exposeData.equipment.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  const removeEquipment = (index: number) =>
    updateExposeData({
      equipment: exposeData.equipment.filter((_, itemIndex) => itemIndex !== index),
    });

  return (
    <Section
      title="Ausstattung"
      description="Erfassen Sie Ausstattung und Merkmale strukturiert. Nur Felder, die wirklich vorhanden sind."
    >
      <div className="space-y-6">
        <GroupCard title="Außenbereich">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureToggle label="Balkon" active={has('balcony')} onToggle={() => toggle('balcony')} />
            <FeatureToggle label="Terrasse" active={has('terrace')} onToggle={() => toggle('terrace')} />
            <FeatureToggle label="Garten" active={has('garden')} onToggle={() => toggle('garden')} />
            <FeatureToggle label="Stellplatz" active={has('parking')} onToggle={() => toggle('parking')} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <UnitInput
                label="Gartenfläche"
                unit="m²"
                type="number"
                value={garden?.area}
                onChange={(value) => setGarden({ area: value ? Number(value) : null })}
                placeholder="Optional"
              />
              <DocumentSources sources={sources?.gardenArea} currentValue={garden?.area} />
            </div>
            <div>
              <Input
                label="Ausrichtung"
                value={garden?.orientation}
                onChange={(value) => setGarden({ orientation: value || null })}
                placeholder="z. B. Süd"
              />
              <DocumentSources sources={sources?.orientation} currentValue={garden?.orientation} />
            </div>
          </div>
        </GroupCard>

        <GroupCard title="Küche & Bad">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureToggle
              label="Einbauküche"
              active={has('fitted-kitchen')}
              onToggle={() => toggle('fitted-kitchen')}
            />
            <FeatureToggle label="Dusche" active={has('shower')} onToggle={() => toggle('shower')} />
            <FeatureToggle
              label="Badewanne"
              active={has('bathtub')}
              onToggle={() => toggle('bathtub')}
            />
            <FeatureToggle
              label="Gäste-WC"
              active={has('guest-toilet')}
              onToggle={() => toggle('guest-toilet')}
            />
          </div>
        </GroupCard>

        <GroupCard
          title="Heizung"
          description="Heizungsart und Energieträger stammen meist aus dem Energieausweis."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Input
                label="Heizungsart"
                value={energy.heatingType}
                onChange={(value) => updateEnergy({ heatingType: value || null })}
                placeholder="z. B. Zentralheizung"
              />
              <DocumentSources sources={sources?.heatingType} currentValue={energy.heatingType} />
            </div>
            <div>
              <Select
                label="Energieträger"
                value={energy.primaryEnergySource ?? ''}
                onChange={(value) =>
                  updateEnergy({
                    primaryEnergySource: (value || null) as EnergyData['primaryEnergySource'],
                  })
                }
                placeholder="Auswählen"
                options={ENERGY_SOURCES as unknown as ReadonlyArray<readonly [string, string]>}
              />
              <DocumentSources sources={sources?.primaryEnergySource} currentValue={energy.primaryEnergySource} />
            </div>
          </div>
        </GroupCard>

        <GroupCard title="Parken">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureToggle label="Garage" active={has('garage')} onToggle={() => toggle('garage')} />
            <FeatureToggle label="Carport" active={has('carport')} onToggle={() => toggle('carport')} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <UnitInput
                label="Stellplätze"
                unit="Stellplätze"
                type="number"
                value={exposeData.propertyDetails.parkingSpaceCount}
                onChange={(value) =>
                  updateExposeData({
                    propertyDetails: {
                      ...exposeData.propertyDetails,
                      parkingSpaceCount: value ? Number(value) : null,
                    },
                  })
                }
                placeholder="1"
              />
              <DocumentSources
                sources={sources?.parking}
                currentValue={exposeData.propertyDetails.parkingSpaceCount}
              />
            </div>
          </div>
        </GroupCard>

        {featureSources.length > 0 && (
          <div className="space-y-2">
            {featureSources.map((group) => (
              <DocumentSources
                key={group[0].field}
                sources={group}
                currentValue={has(group[0].field) ? true : null}
              />
            ))}
          </div>
        )}

        <Textarea
          label="Weitere Ausstattung"
          value={property.additionalFeatures}
          onChange={(value) => set('additionalFeatures', value)}
          placeholder="z. B. Parkett, Isolierglas, Smart Home"
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Strukturierte Ausstattung</span>
            <Button type="button" variant="outline" size="sm" onClick={addEquipment}>
              <Plus /> Ausstattung hinzufügen
            </Button>
          </div>
          {exposeData.equipment.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch keine Ausstattung erfasst. Fügen Sie Punkte wie Einbauküche oder Parkett hinzu.
            </p>
          )}
          {exposeData.equipment.map((item, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_1.5fr_auto]"
            >
              <Select
                label="Kategorie"
                value={item.category}
                onChange={(value) => updateEquipment(index, { category: value })}
                options={[
                  ['interior', 'Innenausbau'],
                  ['kitchen', 'Küche'],
                  ['bathroom', 'Bad'],
                  ['flooring', 'Fußboden'],
                  ['windows', 'Fenster'],
                  ['heating', 'Heizung'],
                  ['technology', 'Technik'],
                  ['outdoor', 'Außenbereich'],
                  ['parking', 'Parken'],
                  ['storage', 'Stauraum'],
                  ['other', 'Sonstiges'],
                ]}
              />
              <Input
                label="Bezeichnung"
                value={item.name}
                onChange={(value) => updateEquipment(index, { name: value })}
                placeholder="z. B. Einbauküche"
              />
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Ausstattung entfernen"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => removeEquipment(index)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <SectionNotes
          value={noteValue('features')}
          onChange={(value) => setNote('features', value)}
          placeholder="Weitere Merkmale oder Highlights notieren…"
        />
      </div>
    </Section>
  );
}

export function StepEnergy({
  data,
  update,
  noteValue,
  setNote,
  sources,
}: {
  data?: EnergyData | null;
  update: (data: EnergyData | null) => void;
  noteValue: (key: string) => string;
  setNote: (key: string, value: string) => void;
  sources?: Record<string, WizardFieldCandidate[]>;
}) {
  const energy = data ?? {};
  const number = (value: string) => (value === '' ? null : Number(value));
  const patch = (change: Partial<EnergyData>) => update({ ...energy, ...change });
  return (
    <Section
      title="Energie"
      description="Nur Werte eintragen, die tatsächlich auf dem Energieausweis stehen. Fehlende Angaben blockieren nichts."
    >
      <div className="space-y-6">
        <GroupCard
          title="Energieausweis"
          description="Bedarfsausweis und Verbrauchsausweis bleiben strikt getrennt."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Select
                label="Ausweistyp"
                value={energy.certificateType ?? ''}
                onChange={(value) =>
                  patch({ certificateType: (value || null) as EnergyData['certificateType'] })
                }
                placeholder="Auswählen"
                options={ENERGY_CERTIFICATE_TYPES as unknown as ReadonlyArray<readonly [string, string]>}
              />
              <DocumentSources sources={sources?.certificateType} currentValue={energy.certificateType} />
            </div>
            <div>
              <DateInput
                label="Ausgestellt am"
                value={energy.certificateDate}
                onChange={(value) => patch({ certificateDate: value || null })}
              />
              <DocumentSources sources={sources?.certificateDate} currentValue={energy.certificateDate} />
            </div>
            <div>
              <DateInput
                label="Gültig bis"
                value={energy.certificateValidUntil}
                onChange={(value) => patch({ certificateValidUntil: value || null })}
              />
              <DocumentSources sources={sources?.certificateValidUntil} currentValue={energy.certificateValidUntil} />
            </div>
            <div>
              <Input
                label="Baujahr laut Ausweis"
                type="number"
                value={energy.yearOfConstruction}
                onChange={(value) => patch({ yearOfConstruction: number(value) })}
                placeholder="z. B. 1969"
              />
              <DocumentSources sources={sources?.yearOfConstruction} currentValue={energy.yearOfConstruction} />
            </div>
          </div>
        </GroupCard>

        <GroupCard title="Energieverbrauch & -bedarf">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <UnitInput
                label="Endenergiebedarf"
                unit="kWh/(m²·a)"
                type="number"
                value={energy.finalEnergyDemand}
                onChange={(value) => patch({ finalEnergyDemand: number(value) })}
                placeholder="z. B. 85"
              />
              <DocumentSources sources={sources?.energyDemand} currentValue={energy.finalEnergyDemand} />
            </div>
            <div>
              <UnitInput
                label="Endenergieverbrauch"
                unit="kWh/(m²·a)"
                type="number"
                value={energy.finalEnergyConsumption}
                onChange={(value) => patch({ finalEnergyConsumption: number(value) })}
                placeholder="Optional"
              />
              <DocumentSources sources={sources?.energyConsumption} currentValue={energy.finalEnergyConsumption} />
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <Toggle
                label="Warmwasser im Verbrauch enthalten"
                checked={energy.hotWaterIncluded === true}
                onChange={(checked) => patch({ hotWaterIncluded: checked || null })}
              />
              <DocumentSources sources={sources?.hotWaterIncluded} currentValue={energy.hotWaterIncluded} />
            </div>
          </div>
        </GroupCard>

        <GroupCard title="Heizung">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Input
                label="Heizungsart"
                value={energy.heatingType}
                onChange={(value) => patch({ heatingType: value || null })}
                placeholder="z. B. Zentralheizung"
              />
              <DocumentSources sources={sources?.heatingType} currentValue={energy.heatingType} />
            </div>
            <div>
              <Select
                label="Energieträger"
                value={energy.primaryEnergySource ?? ''}
                onChange={(value) =>
                  patch({
                    primaryEnergySource: (value || null) as EnergyData['primaryEnergySource'],
                  })
                }
                placeholder="Auswählen"
                options={ENERGY_SOURCES as unknown as ReadonlyArray<readonly [string, string]>}
              />
              <DocumentSources sources={sources?.primaryEnergySource} currentValue={energy.primaryEnergySource} />
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <EnergyClassPicker
                value={energy.efficiencyClass}
                onChange={(value) => patch({ efficiencyClass: (value || null) as EnergyData['efficiencyClass'] })}
              />
              <DocumentSources sources={sources?.energyClass} currentValue={energy.efficiencyClass} />
            </div>
          </div>
        </GroupCard>

        <SectionNotes
          value={noteValue('energy')}
          onChange={(value) => setNote('energy', value)}
          placeholder="Energiebezogene Hinweise oder Besonderheiten notieren…"
        />
      </div>
    </Section>
  );
}

export function StepAgent({
  data,
  update,
  noteValue,
  setNote,
}: {
  data: ExposeData['agent'];
  update: (data: ExposeData['agent']) => void;
  noteValue: (key: string) => string;
  setNote: (key: string, value: string) => void;
}) {
  const agent = data ?? {};
  return (
    <Section
      title="Agent / Kontakt"
      description="Agenturdaten werden getrennt von den Vista-Systeminformationen geführt."
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            value={agent.name}
            onChange={(value) => update({ ...agent, name: value })}
          />
          <Input
            label="Unternehmen"
            value={agent.company}
            onChange={(value) => update({ ...agent, company: value })}
          />
          <Input
            label="Telefon"
            value={agent.phone}
            onChange={(value) => update({ ...agent, phone: value })}
          />
          <Input
            label="E-Mail"
            value={agent.email}
            onChange={(value) => update({ ...agent, email: value })}
          />
          <Input
            label="Website"
            value={agent.website}
            onChange={(value) => update({ ...agent, website: value })}
          />
          <Input
            label="Straße und Hausnummer"
            value={agent.address?.street}
            onChange={(value) =>
              update({
                ...agent,
                address: { ...(agent.address ?? { country: 'Deutschland' }), street: value },
              })
            }
          />
        </div>
        <SectionNotes
          value={noteValue('agent')}
          onChange={(value) => setNote('agent', value)}
          placeholder="Hinweise zum Agenten oder Kontakt notieren…"
        />
      </div>
    </Section>
  );
}