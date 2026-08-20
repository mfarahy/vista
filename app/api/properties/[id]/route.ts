import { NextResponse } from "next/server";
import { getProperty, updateProperty } from "@/lib/store";
import { propertySchema } from "@/lib/validation";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  console.info("[api:property] GET /api/properties/:id request received", { id });
  const property = await getProperty(id);
  if (!property) {
    console.warn("[api:property] GET /api/properties/:id not found", { id });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  console.info("[api:property] GET /api/properties/:id completed", { id });
  return NextResponse.json(property);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  console.info("[api:property] PUT /api/properties/:id request received", { id });
  try {
    const payload = propertySchema.parse(await request.json());
    const property = await updateProperty(id, payload as Parameters<typeof updateProperty>[1]);
    if (!property) {
      console.warn("[api:property] PUT /api/properties/:id not found", { id });
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.info("[api:property] PUT /api/properties/:id completed", {
      id,
      roomCount: property.roomsData.length,
    });
    return NextResponse.json(property);
  } catch (error) {
    console.error("[api:property] PUT /api/properties/:id failed", {
      id,
      error: error instanceof Error ? error.message : "Invalid request",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}
