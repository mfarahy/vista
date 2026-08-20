import { NextResponse } from "next/server";
import { getProperty, saveLocationIntelligence } from "@/lib/store";
import { createManualLocation, resolveLocation } from "@/lib/location-service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const property = await getProperty((await params).id);
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(property.exposeData?.location.intelligence || null);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const property = await getProperty(id);
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { refresh?: boolean; latitude?: number; longitude?: number; radiusMeters?: number };
  try {
    if ((body.latitude !== undefined || body.longitude !== undefined) && (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude) || Number(body.latitude) < -90 || Number(body.latitude) > 90 || Number(body.longitude) < -180 || Number(body.longitude) > 180)) {
      return NextResponse.json({ error: "Coordinates are invalid." }, { status: 400 });
    }
    const intelligence = Number.isFinite(body.latitude) && Number.isFinite(body.longitude)
      ? await createManualLocation(property, { latitude: Number(body.latitude), longitude: Number(body.longitude) }, { radiusMeters: body.radiusMeters })
      : (await resolveLocation(property, { refresh: body.refresh, radiusMeters: body.radiusMeters })).intelligence;
    if (!intelligence) return NextResponse.json({ error: "Location could not be resolved." }, { status: 422 });
    const saved = await saveLocationIntelligence(id, intelligence);
    return NextResponse.json(saved?.exposeData?.location.intelligence || intelligence);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Location could not be resolved." }, { status: 502 });
  }
}
