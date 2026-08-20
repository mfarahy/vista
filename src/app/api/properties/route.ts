import { NextResponse } from "next/server";
import { createProperty, listProperties } from "@/lib/store";

export async function GET() {
  console.info("[api:properties] GET /api/properties request received");
  const properties = await listProperties();
  console.info("[api:properties] GET /api/properties completed", {
    count: properties.length,
  });
  return NextResponse.json(properties);
}

export async function POST() {
  console.info("[api:properties] POST /api/properties request received");
  const property = await createProperty();
  console.info("[api:properties] POST /api/properties completed", {
    propertyId: property.id,
  });
  return NextResponse.json(property, { status: 201 });
}
