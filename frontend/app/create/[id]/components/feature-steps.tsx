import type { EnergyData, ExposeData, PropertyPayload, SetProperty } from '../types';
import { FEATURE_OPTIONS } from '../types';
import { EnergyClassPicker, Input, Section, SectionNotes, Select, Textarea } from './ui';
import { AgentDebugPanel } from './debug';

export function StepFeatures({
  property,
  set,
  exposeData,
  updateExposeData,
  noteValue,
  setNote,
}: {
  property: PropertyPayload;
  set: SetProperty;
  exposeData: ExposeData;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  noteValue: (key: string) => string;
  setNote: (key: string, value: string) => void;
}) {
  const toggle = (key: string) =>
    set(
      'selectedFeatures',
      property.selectedFeatures.includes(key)
        ? property.selectedFeatures.filter((value) => value !== key)
        : [...property.selectedFeatures, key],
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
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURE_OPTIONS.map(([key, name]) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold ${property.selectedFeatures.includes(key) ? 'border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]' : 'border-[#e0e5e0] bg-white text-[#66716a]'}`}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="mt-6">
        <Textarea
          label="Additional features"
          value={property.additionalFeatures}
          onChange={(value) => set('additionalFeatures', value)}
          placeholder="e.g. fitted kitchen, parquet flooring, triple glazing"
        />
      </div>
      <div className="mt-8 space-y-3">
        <div className="flex items-center justify-between">
          <span className="label mb-0">Structured equipment</span>
          <button
            type="button"
            onClick={addEquipment}
            className="btn btn-secondary px-3 py-2 text-xs"
          >
            Add equipment
          </button>
        </div>
        {exposeData.equipment.map((item, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-xl border border-[#e0e5e0] p-3 sm:grid-cols-[1fr_1.5fr_auto]"
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
            <button
              type="button"
              onClick={() => removeEquipment(index)}
              className="btn-ghost self-end"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <SectionNotes
        value={noteValue('features')}
        onChange={(value) => setNote('features', value)}
        placeholder="Mention any feature or highlight worth emphasizing…"
      />
    </Section>
  );
}

export function StepEnergy({
  data,
  update,
  noteValue,
  setNote,
}: {
  data?: EnergyData | null;
  update: (data: EnergyData | null) => void;
  noteValue: (key: string) => string;
  setNote: (key: string, value: string) => void;
}) {
  const energy = data ?? {};
  const number = (value: string) => (value === '' ? null : Number(value));
  return (
    <Section
      title="Energy"
      description="Only enter the values that are present on the energy certificate."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Select
          label="Energy certificate"
          value={energy.certificateType}
          onChange={(value) =>
            update({ ...energy, certificateType: (value || null) as EnergyData['certificateType'] })
          }
          options={[
            ['', 'Select an option'],
            ['needs_based', 'Demand-based'],
            ['consumption_based', 'Consumption-based'],
            ['not_available', 'Not available'],
            ['unknown', 'Unknown'],
          ]}
        />
        <Input
          label="Construction year per certificate"
          value={energy.yearOfConstruction}
          type="number"
          onChange={(value) => update({ ...energy, yearOfConstruction: number(value) })}
          placeholder="1969"
        />
        <Select
          label="Primary energy source"
          value={energy.primaryEnergySource}
          onChange={(value) =>
            update({
              ...energy,
              primaryEnergySource: (value || null) as EnergyData['primaryEnergySource'],
            })
          }
          options={[
            ['', 'Select an option'],
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
        <Input
          label="Final energy demand (kWh/(m²·a))"
          value={energy.finalEnergyDemand}
          type="number"
          onChange={(value) => update({ ...energy, finalEnergyDemand: number(value) })}
          placeholder="250.20"
        />
        <Input
          label="Final energy consumption (kWh/(m²·a))"
          value={energy.finalEnergyConsumption}
          type="number"
          onChange={(value) => update({ ...energy, finalEnergyConsumption: number(value) })}
          placeholder="Optional"
        />
        <EnergyClassPicker
          value={energy.efficiencyClass}
          onChange={(value) =>
            update({ ...energy, efficiencyClass: (value || null) as EnergyData['efficiencyClass'] })
          }
        />
      </div>
      <SectionNotes
        value={noteValue('energy')}
        onChange={(value) => setNote('energy', value)}
        placeholder="Add any energy-related notes or highlights…"
      />
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
      <div className="grid gap-5 sm:grid-cols-2">
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
    </Section>
  );
}
