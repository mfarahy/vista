import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
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
  const { t } = useI18n();
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
      title={t('steps.features.sectionTitle')}
      description={t('steps.features.sectionDescription')}
    >
      <div className="space-y-6">
        <GroupCard title={t('steps.features.groupOutdoor')}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureToggle
              label={t('feature.balcony')}
              active={has('balcony')}
              onToggle={() => toggle('balcony')}
            />
            <FeatureToggle
              label={t('feature.terrace')}
              active={has('terrace')}
              onToggle={() => toggle('terrace')}
            />
            <FeatureToggle
              label={t('feature.garden')}
              active={has('garden')}
              onToggle={() => toggle('garden')}
            />
            <FeatureToggle
              label={t('feature.parking')}
              active={has('parking')}
              onToggle={() => toggle('parking')}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <UnitInput
                label={t('fields.gardenArea')}
                unit={t('expose.units.sqm')}
                type="number"
                value={garden?.area}
                onChange={(value) => setGarden({ area: value ? Number(value) : null })}
                placeholder={t('common.optional')}
              />
              <DocumentSources sources={sources?.gardenArea} currentValue={garden?.area} />
            </div>
            <div>
              <Input
                label={t('fields.orientation')}
                value={garden?.orientation}
                onChange={(value) => setGarden({ orientation: value || null })}
                placeholder={t('steps.features.orientationExample')}
              />
              <DocumentSources sources={sources?.orientation} currentValue={garden?.orientation} />
            </div>
          </div>
        </GroupCard>

        <GroupCard title={t('steps.features.groupKitchenBath')}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureToggle
              label={t('feature.fitted-kitchen')}
              active={has('fitted-kitchen')}
              onToggle={() => toggle('fitted-kitchen')}
            />
            <FeatureToggle
              label={t('feature.shower')}
              active={has('shower')}
              onToggle={() => toggle('shower')}
            />
            <FeatureToggle
              label={t('feature.bathtub')}
              active={has('bathtub')}
              onToggle={() => toggle('bathtub')}
            />
            <FeatureToggle
              label={t('feature.guest-toilet')}
              active={has('guest-toilet')}
              onToggle={() => toggle('guest-toilet')}
            />
          </div>
        </GroupCard>

        <GroupCard
          title={t('steps.features.groupHeating')}
          description={t('steps.features.groupHeatingDescription')}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Input
                label={t('fields.heatingType')}
                value={energy.heatingType}
                onChange={(value) => updateEnergy({ heatingType: value || null })}
                placeholder={t('steps.features.heatingTypeExample')}
              />
              <DocumentSources sources={sources?.heatingType} currentValue={energy.heatingType} />
            </div>
            <div>
              <Select
                label={t('fields.energySource')}
                value={energy.primaryEnergySource ?? ''}
                onChange={(value) =>
                  updateEnergy({
                    primaryEnergySource: (value || null) as EnergyData['primaryEnergySource'],
                  })
                }
                placeholder={t('common.select')}
                options={ENERGY_SOURCES.map(([value, label]): [string, string] => [
                  value,
                  t(label),
                ])}
              />
              <DocumentSources
                sources={sources?.primaryEnergySource}
                currentValue={energy.primaryEnergySource}
              />
            </div>
          </div>
        </GroupCard>

        <GroupCard title={t('steps.features.groupParking')}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureToggle
              label={t('feature.garage')}
              active={has('garage')}
              onToggle={() => toggle('garage')}
            />
            <FeatureToggle
              label={t('feature.carport')}
              active={has('carport')}
              onToggle={() => toggle('carport')}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <UnitInput
                label={t('fields.parkingSpaces')}
                unit={t('expose.units.parkingSpaces')}
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
                placeholder={t('steps.features.parkingSpacesExample')}
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
          label={t('steps.features.moreFeaturesLabel')}
          value={property.additionalFeatures}
          onChange={(value) => set('additionalFeatures', value)}
          placeholder={t('steps.features.moreFeaturesPlaceholder')}
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              {t('steps.features.structuredHeading')}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={addEquipment}>
              <Plus /> {t('steps.features.addFeature')}
            </Button>
          </div>
          {exposeData.equipment.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('steps.features.emptyFeatures')}</p>
          )}
          {exposeData.equipment.map((item, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_1.5fr_auto]"
            >
              <Select
                label={t('steps.features.category')}
                value={item.category}
                onChange={(value) => updateEquipment(index, { category: value })}
                options={[
                  ['interior', t('steps.features.categoryInterior')],
                  ['kitchen', t('steps.features.categoryKitchen')],
                  ['bathroom', t('steps.features.categoryBathroom')],
                  ['flooring', t('steps.features.categoryFlooring')],
                  ['windows', t('steps.features.categoryWindows')],
                  ['heating', t('steps.features.categoryHeating')],
                  ['technology', t('steps.features.categoryTechnology')],
                  ['outdoor', t('steps.features.categoryOutdoor')],
                  ['parking', t('steps.features.categoryParking')],
                  ['storage', t('steps.features.categoryStorage')],
                  ['other', t('steps.features.categoryOther')],
                ]}
              />
              <Input
                label={t('steps.features.nameLabel')}
                value={item.name}
                onChange={(value) => updateEquipment(index, { name: value })}
                placeholder={t('steps.features.namePlaceholder')}
              />
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('steps.features.removeFeature')}
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
          placeholder={t('steps.features.notesPlaceholder')}
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
  const { t } = useI18n();
  return (
    <Section
      title={t('steps.energy.sectionTitle')}
      description={t('steps.energy.sectionDescription')}
    >
      <div className="space-y-6">
        <GroupCard
          title={t('steps.energy.groupCertificate')}
          description={t('steps.energy.groupCertificateDescription')}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Select
                label={t('fields.certificateType')}
                value={energy.certificateType ?? ''}
                onChange={(value) =>
                  patch({ certificateType: (value || null) as EnergyData['certificateType'] })
                }
                placeholder={t('common.select')}
                options={ENERGY_CERTIFICATE_TYPES.map(([value, label]): [string, string] => [
                  value,
                  t(label),
                ])}
              />
              <DocumentSources
                sources={sources?.certificateType}
                currentValue={energy.certificateType}
              />
            </div>
            <div>
              <DateInput
                label={t('fields.certificateDate')}
                value={energy.certificateDate}
                onChange={(value) => patch({ certificateDate: value || null })}
              />
              <DocumentSources
                sources={sources?.certificateDate}
                currentValue={energy.certificateDate}
              />
            </div>
            <div>
              <DateInput
                label={t('fields.certificateValidUntil')}
                value={energy.certificateValidUntil}
                onChange={(value) => patch({ certificateValidUntil: value || null })}
              />
              <DocumentSources
                sources={sources?.certificateValidUntil}
                currentValue={energy.certificateValidUntil}
              />
            </div>
            <div>
              <Input
                label={t('fields.yearBuiltPerCertificate')}
                type="number"
                value={energy.yearOfConstruction}
                onChange={(value) => patch({ yearOfConstruction: number(value) })}
                placeholder={t('steps.energy.yearBuiltExample')}
              />
              <DocumentSources
                sources={sources?.yearOfConstruction}
                currentValue={energy.yearOfConstruction}
              />
            </div>
          </div>
        </GroupCard>

        <GroupCard title={t('steps.energy.groupConsumption')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <UnitInput
                label={t('fields.energyDemand')}
                unit={t('expose.units.kwhWithDot')}
                type="number"
                value={energy.finalEnergyDemand}
                onChange={(value) => patch({ finalEnergyDemand: number(value) })}
                placeholder={t('steps.energy.demandPlaceholder')}
              />
              <DocumentSources
                sources={sources?.energyDemand}
                currentValue={energy.finalEnergyDemand}
              />
            </div>
            <div>
              <UnitInput
                label={t('fields.energyConsumption')}
                unit={t('expose.units.kwhWithDot')}
                type="number"
                value={energy.finalEnergyConsumption}
                onChange={(value) => patch({ finalEnergyConsumption: number(value) })}
                placeholder={t('common.optional')}
              />
              <DocumentSources
                sources={sources?.energyConsumption}
                currentValue={energy.finalEnergyConsumption}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <Toggle
                label={t('steps.energy.hotWaterLabel')}
                checked={energy.hotWaterIncluded === true}
                onChange={(checked) => patch({ hotWaterIncluded: checked || null })}
              />
              <DocumentSources
                sources={sources?.hotWaterIncluded}
                currentValue={energy.hotWaterIncluded}
              />
            </div>
          </div>
        </GroupCard>

        <GroupCard title={t('steps.energy.groupHeating')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Input
                label={t('fields.heatingType')}
                value={energy.heatingType}
                onChange={(value) => patch({ heatingType: value || null })}
                placeholder={t('steps.energy.heatingTypeExample')}
              />
              <DocumentSources sources={sources?.heatingType} currentValue={energy.heatingType} />
            </div>
            <div>
              <Select
                label={t('fields.energySource')}
                value={energy.primaryEnergySource ?? ''}
                onChange={(value) =>
                  patch({
                    primaryEnergySource: (value || null) as EnergyData['primaryEnergySource'],
                  })
                }
                placeholder={t('common.select')}
                options={ENERGY_SOURCES.map(([value, label]): [string, string] => [
                  value,
                  t(label),
                ])}
              />
              <DocumentSources
                sources={sources?.primaryEnergySource}
                currentValue={energy.primaryEnergySource}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <EnergyClassPicker
                value={energy.efficiencyClass}
                onChange={(value) =>
                  patch({ efficiencyClass: (value || null) as EnergyData['efficiencyClass'] })
                }
              />
              <DocumentSources
                sources={sources?.energyClass}
                currentValue={energy.efficiencyClass}
              />
            </div>
          </div>
        </GroupCard>

        <SectionNotes
          value={noteValue('energy')}
          onChange={(value) => setNote('energy', value)}
          placeholder={t('steps.energy.notesPlaceholder')}
        />
      </div>
    </Section>
  );
}
