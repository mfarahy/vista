import Link from 'next/link';
import { ArrowUpRight, FileText, Image as ImageIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api';

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
  } catch {
    return [];
  }
}

export default async function Home() {
  const properties = await getProperties();

  return (
    <main className="min-h-screen shell-grid">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#202522] font-serif text-lg text-white">
            R
          </span>
          <span className="text-sm font-bold tracking-[.18em]">RAUMWERK</span>
        </Link>
        <span className="hidden text-xs font-bold tracking-[.16em] text-[#758078] sm:block">
          REAL ESTATE EXPOSÉS · PHASE 01
        </span>
        <Link href="/create" className="btn btn-primary flex items-center gap-2">
          New exposé <ArrowUpRight size={15} />
        </Link>
      </nav>
      <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-14 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:pb-28 lg:pt-20">
        <div className="max-w-2xl">
          <div className="mb-8 flex items-center gap-3 text-xs font-bold tracking-[.18em] text-[#607b68]">
            <span className="h-px w-10 bg-[#607b68]" /> EDITORIAL PROPERTY TOOL
          </div>
          <p className="text-sm font-semibold tracking-[.12em] text-[#758078]">
            Your property. Deine Immobilie.
          </p>
          <h1 className="serif mt-4 text-5xl leading-[.98] tracking-[-.04em] sm:text-7xl">
            <em className="text-[#78917d]">Better told.</em>
            <br />
            <em className="text-[#78917d]">Besser erzählt.</em>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#5f6c63]">
            Create a polished exposé in a few steps, with clear facts and a compelling story for
            your home. Erstelle in wenigen Schritten ein hochwertiges Exposé, das Fakten klar
            strukturiert und dein Zuhause in Szene setzt.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/create" className="btn btn-primary flex items-center gap-2">
              Create exposé <ArrowUpRight size={15} />
            </Link>
            <Link href="/demo" className="btn btn-secondary">
              View demo
            </Link>
            <a href="#workflow" className="btn btn-secondary">
              How it works
            </a>
          </div>
          <div className="mt-14 flex gap-7 text-xs text-[#758078]">
            <span>No design skills required</span>
            <span>English and German copy</span>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-md lg:mt-3">
          <div className="absolute -inset-5 rounded-[30px] border border-[#dfe8df]" />
          <div className="relative overflow-hidden rounded-2xl bg-[#33453b] p-5 shadow-2xl shadow-[#31453922]">
            <div className="mb-5 flex items-center justify-between text-[10px] tracking-[.16em] text-[#bdcdbf]">
              <span>VORSCHAU · MODERN</span>
              <span>01 / 04</span>
            </div>
            <div
              className="flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-xl bg-[#8c9b8f] p-6"
              style={{ background: 'linear-gradient(140deg,#91a296,#50645a)' }}
            >
              <div className="flex justify-between text-[10px] font-bold tracking-[.2em] text-white/70">
                <span>RAUMWERK</span>
                <span>EXPOSÉ</span>
              </div>
              <div>
                <div className="mb-3 h-px w-10 bg-white/60" />
                <p className="serif text-3xl leading-[1.05] text-white">
                  Spaces that
                  <br />
                  <em>tell stories</em>
                  <br />
                  beautifully.
                </p>
                <p className="mt-5 text-[10px] tracking-[.18em] text-white/80">
                  BERLIN · FRIEDRICHSHAIN
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[10px] text-[#d5e0d5]">
              <span>
                <b className="block text-base text-white">92</b>m2
              </span>
              <span>
                <b className="block text-base text-white">3</b>rooms
              </span>
              <span>
                <b className="block text-base text-white">449k</b>EUR
              </span>
            </div>
          </div>
        </div>
      </section>
      <section id="workflow" className="border-y border-[#e0e6e0] bg-white/60">
        <div className="mx-auto grid max-w-7xl gap-4 px-6 py-10 sm:grid-cols-3 lg:px-10">
          <div className="flex gap-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eaf0ea] text-[#607b68]">
              01
            </span>
            <div>
              <b className="text-sm">Daten eingeben</b>
              <p className="mt-1 text-xs leading-5 text-[#78837b]">Your details. Your facts.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eaf0ea] text-[#607b68]">
              02
            </span>
            <div>
              <b className="text-sm">KI verfeinert</b>
              <p className="mt-1 text-xs leading-5 text-[#78837b]">
                Professional copy at the click of a button.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eaf0ea] text-[#607b68]">
              03
            </span>
            <div>
              <b className="text-sm">PDF exportieren</b>
              <p className="mt-1 text-xs leading-5 text-[#78837b]">
                Ready for portals and prospective buyers.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <div className="mb-7 flex items-end justify-between">
          <div>
            <p className="text-xs font-bold tracking-[.18em] text-[#607b68]">
              DEINE ENTWÜRFE · YOUR DRAFTS
            </p>
            <h2 className="serif mt-2 text-3xl">Zuletzt bearbeitet</h2>
          </div>
          <Link href="/create" className="hidden text-xs font-bold text-[#607b68] sm:block">
            View all drafts →
          </Link>
        </div>
        {properties.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {properties.slice(0, 3).map((property) => (
              <Link
                key={property.id}
                href={`/create/${property.id}`}
                className="card p-5 transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="rounded-full bg-[#eaf0ea] px-3 py-1 text-[10px] font-bold tracking-wider text-[#607b68]">
                    ENTWURF · DRAFT
                  </span>
                  <FileText size={17} className="text-[#92a198]" />
                </div>
                <h3 className="serif text-xl">{property.city || 'New property'}</h3>
                <p className="mt-2 text-xs text-[#77837b]">
                  {property.livingArea ? `${property.livingArea} m2 · ` : ''}
                  {property.images.length} photos
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card flex flex-col items-center justify-center py-14 text-center">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-[#eaf0ea] text-[#607b68]">
              <ImageIcon size={20} />
            </div>
            <p className="text-sm font-bold">No exposé created yet</p>
            <p className="mt-2 text-sm text-[#77837b]">Start with your property details.</p>
          </div>
        )}
      </section>
    </main>
  );
}
