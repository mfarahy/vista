'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { VistaLogo } from '@/components/vista-logo';
import { Button } from '@/components/ui/button';

export default function CreatePage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch('/api/properties', { method: 'POST' })
      .then((response) => response.json())
      .then((property: { id: string }) => router.replace(`/create/${property.id}`))
      .catch(() => setFailed(true));
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <div className="flex flex-col items-center text-center">
        <VistaLogo showWordmark={false} className="mb-6" />
        {failed ? (
          <div className="flex flex-col items-center">
            <span className="grid size-12 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="size-6" />
            </span>
            <p className="mt-4 text-sm text-destructive">
              Der Entwurf konnte nicht erstellt werden. Bitte versuchen Sie es erneut.
            </p>
            <Button className="mt-5" onClick={() => window.location.reload()}>
              Erneut versuchen
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <LoaderCircle className="size-6 animate-spin" />
            </span>
            <p className="mt-4 text-sm text-muted-foreground">Ihr Exposé wird vorbereitet…</p>
          </div>
        )}
      </div>
    </main>
  );
}
