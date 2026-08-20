"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
export default function CreatePage() { const router = useRouter(); const [loading, setLoading] = useState(false); useEffect(() => { setLoading(true); fetch("/api/properties", { method: "POST" }).then((response) => response.json()).then((property: { id: string }) => router.replace(`/create/${property.id}`)); }, [router]); return <main className="grid min-h-screen place-items-center bg-[#f4f6f3]"><div className="text-center"><div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-[#202522] text-xl text-white">R</div><LoaderCircle className="mx-auto animate-spin text-[#6c8773]" size={20} /><p className="mt-3 text-sm text-[#718078]">Dein Exposé wird vorbereitet…</p><ArrowRight className="mx-auto mt-4 text-[#b0beb2]" size={18} /></div></main>; }
