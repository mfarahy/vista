import { NextResponse } from "next/server";
import { reorderImages } from "@/lib/store";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  console.info("[api:images-reorder] PUT request", { id });
  const body = await request.json();
  console.info("[api:images-reorder] reorder payload", {
    id,
    imageCount: Array.isArray(body.imageIds) ? body.imageIds.length : 0,
  });
  const property = await reorderImages(id, body.imageIds);
  if (!property) {
    console.warn("[api:images-reorder] property not found", { id });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  console.info("[api:images-reorder] reorder complete", { id, imageCount: property.images.length });
  return NextResponse.json(property.images);
}
