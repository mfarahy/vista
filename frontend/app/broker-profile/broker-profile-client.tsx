'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Check, ImagePlus, LoaderCircle, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { apiAssetUrl, apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { VistaLogoLink } from '@/components/vista-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useI18n } from '@/lib/i18n';
import { GroupCard, Input, Section, Textarea } from '../create/[id]/components/ui';
import { emptyBrokerProfile, type BrokerProfile } from '../create/[id]/types';

/**
 * Broker Profile form (MVP). The profile is the single source of truth for
 * broker/agent information: the Exposé contact area and the dedicated broker
 * page read from here automatically. Only the broker name is required; every
 * other field is optional and only rendered when present.
 *
 * Images (photo, logo, additional images) are uploaded through
 * POST /api/broker-profile/image, which stores them under /uploads/broker/;
 * direct https:// URLs are accepted as an alternative.
 */

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const urlPattern = /^https?:\/\/\S+$/i;

type FieldError = { email?: string; website?: string; recommendationUrl?: string };

function ImageField({
  label,
  hint,
  value,
  onChange,
  uploading,
  onUpload,
}: {
  label: string;
  hint?: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {value ? (
        <div className="flex items-center gap-3">
          <img
            src={apiAssetUrl(value)}
            alt={label}
            className="h-24 w-24 rounded-lg border border-border bg-muted/40 object-cover"
          />
          <div className="space-y-1.5">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted/60">
              <Upload className="size-3.5" aria-hidden />
              {uploading ? t('brokerProfile.saving') : t('brokerProfile.replaceImage')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void onUpload(file);
                }}
              />
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onChange(null)}
            >
              {t('brokerProfile.removeImage')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/60">
            <ImagePlus className="size-4" aria-hidden />
            {uploading ? t('brokerProfile.saving') : t('brokerProfile.uploadImage')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void onUpload(file);
              }}
            />
          </label>
          <Input
            label=""
            value={value ?? ''}
            onChange={(url) => onChange(url.trim() || null)}
            placeholder={t('brokerProfile.imageUrlPlaceholder')}
            className="min-w-[240px] flex-1"
          />
        </div>
      )}
    </div>
  );
}

export default function BrokerProfileClient({
  initialProfile,
}: {
  initialProfile: BrokerProfile;
}) {
  const { t } = useI18n();
  const [profile, setProfile] = useState<BrokerProfile>(() => ({
    ...emptyBrokerProfile(),
    ...initialProfile,
    address: initialProfile.address ?? { country: 'Deutschland' },
  }));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'photo' | 'logo' | null>(null);
  const [serverError, setServerError] = useState('');
  const [errors, setErrors] = useState<FieldError>({});
  const [saved, setSaved] = useState(false);

  const patch = (change: Partial<BrokerProfile>) => setProfile((current) => ({ ...current, ...change }));

  async function uploadImage(kind: 'photo' | 'logo', file: File) {
    setUploading(kind);
    setServerError('');
    try {
      const body = new FormData();
      body.append('files', file);
      const response = await apiFetch('/api/broker-profile/image', { method: 'POST', body });
      const result = (await response.json()) as { url?: string };
      if (!response.ok || !result.url) throw new Error('upload failed');
      patch({ [kind]: result.url } as Partial<BrokerProfile>);
      toast.success(t('brokerProfile.saved'));
    } catch {
      setServerError(t('brokerProfile.uploadFailed'));
    } finally {
      setUploading(null);
    }
  }

  function validate(): boolean {
    const next: FieldError = {};
    if (profile.email && !emailPattern.test(profile.email)) next.email = t('brokerProfile.invalidEmail');
    if (profile.website && !urlPattern.test(profile.website)) next.website = t('brokerProfile.invalidUrl');
    if (profile.recommendationUrl && !urlPattern.test(profile.recommendationUrl))
      next.recommendationUrl = t('brokerProfile.invalidUrl');
    for (const link of profile.externalLinks ?? []) {
      if (link.url && !urlPattern.test(link.url)) next.website = t('brokerProfile.invalidUrl');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    if (!profile.name.trim()) {
      setErrors({ ...errors, email: undefined, website: undefined, recommendationUrl: undefined });
      toast.error(t('brokerProfile.nameRequired'));
      return;
    }
    if (!validate()) return;
    setSaving(true);
    setServerError('');
    setSaved(false);
    try {
      const response = await apiFetch('/api/broker-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (!response.ok) throw new Error('save failed');
      setSaved(true);
      toast.success(t('brokerProfile.saved'));
    } catch {
      setServerError(t('brokerProfile.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const setAward = (index: number, value: string) =>
    patch({ awards: (profile.awards ?? []).map((award, i) => (i === index ? value : award)) });
  const setLink = (index: number, change: Partial<{ label: string; url: string }>) =>
    patch({
      externalLinks: (profile.externalLinks ?? []).map((link, i) =>
        i === index ? { ...link, ...change } : link,
      ),
    });
  const setAdditionalImage = (index: number, value: string) =>
    patch({
      additionalImages: (profile.additionalImages ?? []).map((url, i) => (i === index ? value : url)),
    });

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-card/90 px-5 py-3.5 backdrop-blur sm:px-8">
        <div className="flex items-center gap-4">
          <VistaLogoLink href="/" />
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-medium text-foreground">{t('brokerProfile.title')}</p>
            <p className="truncate text-[11px] text-muted-foreground">{t('brokerProfile.kicker')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
              <Check className="size-3.5 text-emerald-500" aria-hidden /> {t('wizard.saved')}
            </span>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/">{t('wizard.backToDrafts')}</Link>
          </Button>
          <LanguageSwitcher />
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:py-10">
        <div className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {t('brokerProfile.kicker')}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {t('brokerProfile.title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
            {t('brokerProfile.description')}
          </p>
        </div>

        {serverError && (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>{t('wizard.somethingWentWrong')}</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          <Section
            title={t('brokerProfile.sectionBasic')}
            description={t('brokerProfile.sectionBasicDescription')}
          >
            <div className="space-y-5">
              <GroupCard title={t('brokerProfile.fieldPhoto')}>
                <ImageField
                  label={t('brokerProfile.fieldPhoto')}
                  hint={t('brokerProfile.fieldPhotoHint')}
                  value={profile.photo}
                  onChange={(photo) => patch({ photo })}
                  uploading={uploading === 'photo'}
                  onUpload={(file) => uploadImage('photo', file)}
                />
              </GroupCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={t('brokerProfile.fieldName')}
                  required
                  value={profile.name}
                  onChange={(name) => patch({ name })}
                  placeholder={t('brokerProfile.fieldNamePlaceholder')}
                />
                <Input
                  label={t('brokerProfile.fieldJobTitle')}
                  value={profile.jobTitle}
                  onChange={(jobTitle) => patch({ jobTitle })}
                  placeholder={t('brokerProfile.fieldJobTitlePlaceholder')}
                />
                <Input
                  label={t('brokerProfile.fieldCompany')}
                  value={profile.company}
                  onChange={(company) => patch({ company })}
                  placeholder={t('brokerProfile.fieldCompanyPlaceholder')}
                />
              </div>
              <GroupCard title={t('brokerProfile.fieldLogo')}>
                <ImageField
                  label={t('brokerProfile.fieldLogo')}
                  hint={t('brokerProfile.fieldLogoHint')}
                  value={profile.logo}
                  onChange={(logo) => patch({ logo })}
                  uploading={uploading === 'logo'}
                  onUpload={(file) => uploadImage('logo', file)}
                />
              </GroupCard>
            </div>
          </Section>

          <Section
            title={t('brokerProfile.sectionContact')}
            description={t('brokerProfile.sectionContactDescription')}
          >
            <div className="grid gap-4 sm:grid-cols-6">
              <Input
                label={t('brokerProfile.fieldStreet')}
                value={profile.address?.street}
                onChange={(street) =>
                  patch({ address: { ...(profile.address ?? { country: 'Deutschland' }), street } })
                }
                className="sm:col-span-4"
              />
              <Input
                label={t('brokerProfile.fieldHouseNumber')}
                value={profile.address?.houseNumber}
                onChange={(houseNumber) =>
                  patch({ address: { ...(profile.address ?? { country: 'Deutschland' }), houseNumber } })
                }
                className="sm:col-span-2"
              />
              <Input
                label={t('brokerProfile.fieldPostalCode')}
                value={profile.address?.postalCode}
                onChange={(postalCode) =>
                  patch({ address: { ...(profile.address ?? { country: 'Deutschland' }), postalCode } })
                }
                className="sm:col-span-2"
              />
              <Input
                label={t('brokerProfile.fieldCity')}
                value={profile.address?.city}
                onChange={(city) =>
                  patch({ address: { ...(profile.address ?? { country: 'Deutschland' }), city } })
                }
                className="sm:col-span-2"
              />
              <Input
                label={t('brokerProfile.fieldCountry')}
                value={profile.address?.country}
                onChange={(country) =>
                  patch({ address: { ...(profile.address ?? { country: 'Deutschland' }), country } })
                }
                className="sm:col-span-2"
              />
              <Input
                label={t('brokerProfile.fieldWebsite')}
                value={profile.website}
                onChange={(website) => patch({ website })}
                placeholder={t('brokerProfile.fieldWebsitePlaceholder')}
                error={errors.website}
                className="sm:col-span-6"
              />
              <Input
                label={t('brokerProfile.fieldPhone')}
                value={profile.phone}
                onChange={(phone) => patch({ phone })}
                placeholder={t('brokerProfile.fieldPhonePlaceholder')}
              />
              <Input
                label={t('brokerProfile.fieldMobile')}
                value={profile.mobile}
                onChange={(mobile) => patch({ mobile })}
                placeholder={t('brokerProfile.fieldMobilePlaceholder')}
              />
              <Input
                label={t('brokerProfile.fieldEmail')}
                value={profile.email}
                onChange={(email) => patch({ email })}
                placeholder={t('brokerProfile.fieldEmailPlaceholder')}
                error={errors.email}
              />
            </div>
          </Section>

          <Section
            title={t('brokerProfile.sectionAbout')}
            description={t('brokerProfile.sectionAboutDescription')}
          >
            <div className="space-y-4">
              <Input
                label={t('brokerProfile.fieldTagline')}
                value={profile.tagline}
                onChange={(tagline) => patch({ tagline })}
                placeholder={t('brokerProfile.fieldTaglinePlaceholder')}
              />
              <Textarea
                label={t('brokerProfile.fieldDescription')}
                value={profile.description}
                onChange={(description) => patch({ description })}
                placeholder={t('brokerProfile.fieldDescriptionPlaceholder')}
                rows={6}
              />
            </div>
          </Section>

          <Section
            title={t('brokerProfile.sectionCredentials')}
            description={t('brokerProfile.sectionCredentialsDescription')}
          >
            <div className="space-y-5">
              <GroupCard title={t('brokerProfile.fieldAwards')}>
                <div className="space-y-2">
                  {(profile.awards ?? []).map((award, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        label=""
                        value={award}
                        onChange={(value) => setAward(index, value)}
                        placeholder={t('brokerProfile.awardPlaceholder')}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('common.remove')}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          patch({ awards: (profile.awards ?? []).filter((_, i) => i !== index) })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => patch({ awards: [...(profile.awards ?? []), ''] })}
                  >
                    <Plus className="size-4" /> {t('brokerProfile.addAward')}
                  </Button>
                </div>
              </GroupCard>
              <Textarea
                label={t('brokerProfile.fieldRecommendations')}
                value={profile.recommendations}
                onChange={(recommendations) => patch({ recommendations })}
                placeholder={t('brokerProfile.fieldRecommendationsPlaceholder')}
                rows={4}
              />
              <Input
                label={t('brokerProfile.fieldRecommendationUrl')}
                value={profile.recommendationUrl}
                onChange={(recommendationUrl) => patch({ recommendationUrl })}
                placeholder={t('brokerProfile.fieldRecommendationUrlPlaceholder')}
                error={errors.recommendationUrl}
              />
            </div>
          </Section>

          <Section
            title={t('brokerProfile.sectionBranding')}
            description={t('brokerProfile.sectionBrandingDescription')}
          >
            <div className="space-y-5">
              <GroupCard title={t('brokerProfile.fieldAdditionalImages')}>
                <div className="space-y-2">
                  {(profile.additionalImages ?? []).map((url, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        label=""
                        value={url}
                        onChange={(value) => setAdditionalImage(index, value)}
                        placeholder={t('brokerProfile.imageUrlPlaceholder')}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('common.remove')}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          patch({
                            additionalImages: (profile.additionalImages ?? []).filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => patch({ additionalImages: [...(profile.additionalImages ?? []), ''] })}
                  >
                    <Plus className="size-4" /> {t('brokerProfile.addImage')}
                  </Button>
                </div>
              </GroupCard>
              <GroupCard title={t('brokerProfile.fieldExternalLinks')}>
                <div className="space-y-2">
                  {(profile.externalLinks ?? []).map((link, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                      <Input
                        label=""
                        value={link.label}
                        onChange={(label) => setLink(index, { label })}
                        placeholder={t('brokerProfile.linkLabelPlaceholder')}
                      />
                      <Input
                        label=""
                        value={link.url}
                        onChange={(url) => setLink(index, { url })}
                        placeholder={t('brokerProfile.linkUrlPlaceholder')}
                      />
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('common.remove')}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            patch({
                              externalLinks: (profile.externalLinks ?? []).filter(
                                (_, i) => i !== index,
                              ),
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      patch({ externalLinks: [...(profile.externalLinks ?? []), { label: '', url: '' }] })
                    }
                  >
                    <Plus className="size-4" /> {t('brokerProfile.addLink')}
                  </Button>
                </div>
              </GroupCard>
            </div>
          </Section>

          <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
            {!profile.name.trim() && (
              <span className={cn('text-xs text-muted-foreground')}>
                * {t('brokerProfile.nameRequired')}
              </span>
            )}
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" /> {t('brokerProfile.saving')}
                </>
              ) : (
                <>
                  <Check className="size-4" /> {t('brokerProfile.save')}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}