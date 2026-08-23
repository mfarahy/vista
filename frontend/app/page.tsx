import Link from 'next/link';
import {
  ArrowRight,
  FileText,
  Image as ImageIcon,
  Building2,
  FileUp,
  Sparkles,
  FileDown,
  LayoutTemplate,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { frontendLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { VistaLogoLink } from '@/components/vista-logo';
import { EmptyState } from '@/components/empty-state';

async function getProperties() {
  try {
    const response = await apiFetch('/api/properties');
    if (!response.ok) return [];
    return (await response.json()) as Array<{
      id: string;
      city?: string | null;
      livingArea?: number | null;
      images: Array<{ id: string }>;
    }>;
  } catch (error) {
    frontendLogger.warn('Failed to load properties for the landing page', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export default async function Home() {
  const properties = await getProperties();

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <VistaLogoLink href="/" />
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/floorplan">Floorplan 3D</Link>
            </Button>
            <Button asChild>
              <Link href="/create">
                Neues Exposé <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" /> Immobilien-Exposés, einfach erstellt
          </span>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
            Ihre Immobilie, <span className="text-primary">professionell präsentiert</span>.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
            Erstellen Sie in wenigen Schritten ein hochwertiges Exposé. Laden Sie Ihre Unterlagen
            hoch, erfassen Sie die Fakten einmal — und Vista schreibt eine überzeugende
            Präsentation für Ihre Immobilie. Bereit für Portale und PDF-Export.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/create">
                Exposé erstellen <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/demo">Demo ansehen</Link>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Keine Designkenntnisse erforderlich.
          </p>
        </div>

        <div className="hidden rounded-2xl border bg-card p-6 shadow-sm lg:block">
          <div className="space-y-3">
            {[
              { icon: FileUp, title: 'Unterlagen hochladen', text: 'Grundbuch, Grundriss, Energieausweis' },
              { icon: Sparkles, title: 'KI verfasst Ihre Texte', text: 'Professionelle Texte auf Knopfdruck' },
              { icon: FileDown, title: 'Export als PDF', text: 'Bereit für Portale und Interessenten' },
            ].map((step) => (
              <div key={step.title} className="flex gap-4 rounded-xl border bg-background p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <step.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{step.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t bg-card/50">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Ihre Entwürfe
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                Zuletzt bearbeitet
              </h2>
            </div>
            <Link href="/create" className="text-sm font-medium text-primary hover:underline">
              Neues Exposé →
            </Link>
          </div>
          {properties.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {properties.slice(0, 3).map((property) => (
                <div
                  key={property.id}
                  className="group rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      <FileText className="size-3" /> Entwurf
                    </span>
                    <Building2 className="size-4 text-muted-foreground" aria-hidden />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    <Link href={`/create/${property.id}`} className="hover:text-primary">
                      {property.city || 'Neues Objekt'}
                    </Link>
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {property.livingArea ? `${property.livingArea} m² · ` : ''}
                    {property.images.length} Fotos
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/create/${property.id}`}>Bearbeiten</Link>
                    </Button>
                    <Button size="sm" asChild>
                      <Link href={`/builder/${property.id}`}>
                        <LayoutTemplate className="size-4" /> Builder
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ImageIcon}
              title="Noch kein Exposé erstellt"
              description="Geben Sie die Angaben zu Ihrer Immobilie ein und erstellen Sie Ihren ersten Entwurf."
              actionLabel="Exposé erstellen"
              href="/create"
            />
          )}
        </div>
      </section>
    </main>
  );
}