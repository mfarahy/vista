import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import WizardClient from "./wizard-client";

async function getProperty(id: string) {
  try {
    const response = await apiFetch(`/api/properties/${id}`);
    if (!response.ok) return null;
    return (await response.json()) as any;
  } catch {
    return null;
  }
}

export default async function CreatePropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getProperty(id);
  if (!property) notFound();

  return <WizardClient initialProperty={property} />;
}
