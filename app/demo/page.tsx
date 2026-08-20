"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function DemoPage() {
  const router = useRouter();
  useEffect(() => {
    fetch("/api/demo", { method: "POST" })
      .then((response) => response.json())
      .then(({ id }: { id: string }) => router.replace(`/create/${id}`));
  }, [router]);
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f6f3] text-center">
      <div>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#202522] font-serif text-xl text-white">
          R
        </div>
        <p className="mt-4 text-sm text-[#718078]">
          Loading Berlin demo exposé…
        </p>
      </div>
    </main>
  );
}
