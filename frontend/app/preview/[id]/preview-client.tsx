"use client";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useState } from "react";

export default function PreviewClient({ id, title, html }: { id: string; title: string; html: string }) {
  const [loading, setLoading] = useState(false);

  async function pdf() {
    setLoading(true);
    const response = await apiFetch(`/api/properties/${id}/pdf`, { method: "POST" });
    if (!response.ok) {
      setLoading(false);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `raumwerk-expose-${id}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#e7ebe7]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#d8ded8] bg-[#f7f8f5]/95 px-5 py-4 backdrop-blur sm:px-8">
        <div className="flex items-center gap-4">
          <Link href={`/create/${id}`} className="btn btn-ghost flex items-center gap-2"><ArrowLeft size={16} /> <span className="hidden sm:inline">Back to editor</span></Link>
          <div className="hidden border-l border-[#d9dfd9] pl-4 text-sm font-bold sm:block">Preview · {title}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="btn btn-secondary hidden items-center gap-2 sm:flex"><Printer size={15} /> Print</button>
          <button onClick={pdf} disabled={loading} className="btn btn-primary flex items-center gap-2"><Download size={15} /> {loading ? "Creating PDF…" : "Create PDF"}</button>
        </div>
      </header>
      <iframe title="Exposé preview" srcDoc={html} className="mx-auto block h-[calc(100vh-73px)] w-full border-0" />
    </main>
  );
}
