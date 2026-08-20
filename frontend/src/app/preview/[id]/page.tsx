import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import PreviewClient from "./preview-client";

async function getProperty(id: string) {
  try {
    const response = await apiFetch(`/api/properties/${id}`);
    if (!response.ok) return null;
    return (await response.json()) as { id: string; expose?: { content?: { title?: string } | null } | null };
  } catch {
    return null;
  }
}

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getProperty(id);
  if (!property?.expose?.content) notFound();

  return <PreviewClient id={property.id} title={property.expose.content.title || "Exposé preview"} html={"<html><body><div style='padding: 40px; font-family: sans-serif;'>Preview rendered by the frontend service.</div></body></html>"} />;
}
