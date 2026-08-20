import { getProperty } from "@/lib/store";
import { notFound } from "next/navigation";
import WizardClient from "./wizard-client";
export const dynamic = "force-dynamic";
export default async function CreatePropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const property = await getProperty((await params).id);
  if (!property) notFound();
  return <WizardClient initialProperty={property} />;
}
