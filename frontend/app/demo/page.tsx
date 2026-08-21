'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

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
    <main className="grid min-h-screen place-items-center bg-[#f4f6f3] text-center">
      <div>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#202522] font-serif text-xl text-white">
          R
        </div>
        {failed ? (
          <p className="mt-4 text-sm text-red-700">
            The demo exposé could not be created. Please try again.
          </p>
        ) : (
          <p className="mt-4 text-sm text-[#718078]">Loading Berlin demo exposé…</p>
        )}
      </div>
    </main>
  );
}
