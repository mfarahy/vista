import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { EnergyData, ExposeData, PropertyPayload, SetProperty } from '../types';
import type { WizardFieldCandidate } from '../document-prefill';
import { FEATURE_OPTIONS } from '../types';
import { EnergyClassPicker, Input, Section, SectionNotes, Select, Textarea } from './ui';
import { DocumentSources } from './document-sources';
import { AgentDebugPanel } from './debug';

const FEATURE_WIZARD_FIELDS = ['basement', 'parking', 'garage', 'balcony', 'terrace', 'garden'];

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
  const featureSources = FEATURE_WIZARD_FIELDS.map((field) => sources?.[field]).filter(
    (group): group is WizardFieldCandidate[] => !!group?.length,
  );
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
      title="Features & equipment"
      description="Record the facts and features in a structured way."
    >
      <div className="space-y-7">
        <div className="space-y-3">
          <span className="text-sm font-medium text-foreground">Property features</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {FEATURE_OPTIONS.map(([key, name]) => {
              const active = property.selectedFeatures.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary/[0.06] text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-4 shrink-0 place-items-center rounded border transition-colors',
                      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                    )}
                  >
                    {active && (
                      <svg viewBox="0 0 12 12" className="size-3 fill-none stroke-current" strokeWidth="2">
                        <path d="M2.5 6.5 5 9l4.5-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  {name}
                </button>
              );
            })}
          </div>
          {featureSources.length > 0 && (
            <div className="space-y-2">
              {featureSources.map((group) => (
                <DocumentSources key={group[0].field} sources={group} />
              ))}
            </div>
          )}
        </div>

        <Textarea
          label="Additional features"
          value={property.additionalFeatures}
          onChange={(value) => set('additionalFeatures', value)}
          placeholder="e.g. fitted kitchen, parquet flooring, triple glazing"
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Structured equipment</span>
            <Button type="button" variant="outline" size="sm" onClick={addEquipment}>
              <Plus /> Add equipment
            </Button>
          </div>
          {exposeData.equipment.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No equipment listed yet. Add items like a fitted kitchen or parquet flooring.
            </p>
          )}
          {exposeData.equipment.map((item, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_1.5fr_auto]"
            >
              <Select
                label="Category"
                value={item.category}
                onChange={(value) => updateEquipment(index, { category: value })}
                options={[
                  ['interior', 'Interior'],
                  ['kitchen', 'Kitchen'],
                  ['bathroom', 'Bathroom'],
                  ['flooring', 'Flooring'],
                  ['windows', 'Windows'],
                  ['heating', 'Heating'],
                  ['technology', 'Technology'],
                  ['outdoor', 'Outdoor'],
                  ['parking', 'Parking'],
                  ['storage', 'Storage'],
                  ['other', 'Other'],
                ]}
              />
              <Input
                label="Name"
                value={item.name}
                onChange={(value) => updateEquipment(index, { name: value })}
                placeholder="e.g. fitted kitchen"
              />
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove equipment"
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
          placeholder="Mention any feature or highlight worth emphasizing…"
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
  return (
    <Section
      title="Energy"
      description="Only enter the values that are present on the energy certificate."
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Energy certificate"
            value={energy.certificateType}
            onChange={(value) =>
              update({
                ...energy,
                certificateType: (value || null) as EnergyData['certificateType'],
              })
            }
            placeholder="Select an option"
            options={[
              ['needs_based', 'Demand-based'],
              ['consumption_based', 'Consumption-based'],
              ['not_available', 'Not available'],
              ['unknown', 'Unknown'],
            ]}
          />
          <div>
            <Input
              label="Construction year per certificate"
              value={energy.yearOfConstruction}
              type="number"
              onChange={(value) => update({ ...energy, yearOfConstruction: number(value) })}
              placeholder="1969"
            />
            <DocumentSources sources={sources?.yearOfConstruction} />
          </div>
          <div>
            <Select
              label="Primary energy source"
              value={energy.primaryEnergySource}
              onChange={(value) =>
                update({
                  ...energy,
                  primaryEnergySource: (value || null) as EnergyData['primaryEnergySource'],
                })
              }
              placeholder="Select an option"
              options={[
                ['gas', 'Gas'],
                ['oil', 'Oil'],
                ['district_heating', 'District heating'],
                ['heat_pump', 'Heat pump'],
                ['electricity', 'Electricity'],
                ['wood', 'Wood'],
                ['pellets', 'Pellets'],
                ['other', 'Other'],
              ]}
            />
            <DocumentSources sources={sources?.heatingType} />
          </div>
          <div>
            <Input
              label="Final energy demand (kWh/(m²·a))"
              value={energy.finalEnergyDemand}
              type="number"
              onChange={(value) => update({ ...energy, finalEnergyDemand: number(value) })}
              placeholder="250.20"
            />
            <DocumentSources sources={sources?.energyDemand} />
          </div>
          <div>
            <Input
              label="Final energy consumption (kWh/(m²·a))"
              value={energy.finalEnergyConsumption}
              type="number"
              onChange={(value) => update({ ...energy, finalEnergyConsumption: number(value) })}
              placeholder="Optional"
            />
            <DocumentSources sources={sources?.energyConsumption} />
          </div>
          <div className="sm:col-span-2">
            <EnergyClassPicker
              value={energy.efficiencyClass}
              onChange={(value) =>
                update({
                  ...energy,
                  efficiencyClass: (value || null) as EnergyData['efficiencyClass'],
                })
              }
            />
            <DocumentSources sources={sources?.energyClass} />
          </div>
        </div>
        <SectionNotes
          value={noteValue('energy')}
          onChange={(value) => setNote('energy', value)}
          placeholder="Add any energy-related notes or highlights…"
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
      title="Agent / contact"
      description="Agent data is kept separate from Vista system information."
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            value={agent.name}
            onChange={(value) => update({ ...agent, name: value })}
          />
          <Input
            label="Company"
            value={agent.company}
            onChange={(value) => update({ ...agent, company: value })}
          />
          <Input
            label="Phone"
            value={agent.phone}
            onChange={(value) => update({ ...agent, phone: value })}
          />
          <Input
            label="Email"
            value={agent.email}
            onChange={(value) => update({ ...agent, email: value })}
          />
          <Input
            label="Website"
            value={agent.website}
            onChange={(value) => update({ ...agent, website: value })}
          />
          <Input
            label="Street and house number"
            value={agent.address?.street}
            onChange={(value) =>
              update({
                ...agent,
                address: { ...(agent.address ?? { country: 'Deutschland' }), street: value },
              })
            }
          />
        </div>
        <AgentDebugPanel agent={agent} />
        <SectionNotes
          value={noteValue('agent')}
          onChange={(value) => setNote('agent', value)}
          placeholder="Add notes about the agent or contact…"
        />
      </div>
    </Section>
  );
}
