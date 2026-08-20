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

async function getExposeHtml(id: string) {
  try {
    const response = await apiFetch(`/api/properties/${id}/html`);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [property, html] = await Promise.all([getProperty(id), getExposeHtml(id)]);
  if (!property?.expose?.content || !html) notFound();

  return <PreviewClient id={property.id} title={property.expose.content.title || "Exposé preview"} html={html} />;
}
