'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { VistaLogo } from '@/components/vista-logo';
import { Button } from '@/components/ui/button';

export default function DemoPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch('/api/demo', { method: 'POST' })
      .then((response) => response.json())
      .then(({ id }: { id: string }) => router.replace(`/create/${id}`))
      .catch(() => setFailed(true));
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div className="flex flex-col items-center">
        <VistaLogo showWordmark={false} className="mb-6" />
        {failed ? (
          <div className="flex flex-col items-center">
            <span className="grid size-12 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="size-6" />
            </span>
            <p className="mt-4 text-sm text-destructive">
              The demo exposé could not be created. Please try again.
            </p>
            <Button className="mt-5" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <LoaderCircle className="size-6 animate-spin" />
            </span>
            <p className="mt-4 text-sm text-muted-foreground">Loading Berlin demo exposé…</p>
          </div>
        )}
      </div>
    </main>
  );
}
