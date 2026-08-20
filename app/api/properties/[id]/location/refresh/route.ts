import { NextResponse } from "next/server";
import { getProperty, saveLocationIntelligence } from "@/lib/store";
import { resolveLocation } from "@/lib/location-service";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const property = await getProperty(id);
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await resolveLocation(property, { refresh: true });
  if (!result.intelligence) return NextResponse.json({ error: result.error || "Location could not be resolved." }, { status: 422 });
  const saved = await saveLocationIntelligence(id, result.intelligence);
  return NextResponse.json(saved?.exposeData?.location.intelligence || result.intelligence);
}
