import { getProperty } from "@/lib/store";
import { notFound } from "next/navigation";
import { exposeHTML } from "@/lib/expose-template";
import PreviewClient from "./preview-client";
export const dynamic = "force-dynamic";
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) { const property = await getProperty((await params).id); if (!property?.expose?.content) notFound(); return <PreviewClient id={property.id} title={property.expose.content.title} html={exposeHTML(property, property.expose.content)} />; }
