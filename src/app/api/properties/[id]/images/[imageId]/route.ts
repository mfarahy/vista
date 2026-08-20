import { NextResponse } from "next/server";
import { getProperty, removeImage, setCover } from "@/lib/store";
import fs from "node:fs/promises";
import path from "node:path";
export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  const { id, imageId } = await params;
  console.info("[api:image] DELETE request", { id, imageId });
  const property = await getProperty(id);
  const image = property?.images.find((item) => item.id === imageId);
  if (!image) {
    console.warn("[api:image] image not found", { id, imageId });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await removeImage(id, imageId);
  if (image.url.startsWith("/uploads/")) {
    await fs.rm(path.join(process.cwd(), "public", image.url), { force: true });
    console.info("[api:image] uploaded file removed", { id, imageId, url: image.url });
  }
  return NextResponse.json({ ok: true });
}
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  const { id, imageId } = await params;
  console.info("[api:image] PUT request", { id, imageId });
  const body = await request.json().catch(() => ({}));
  if (!body.cover) {
    console.warn("[api:image] invalid cover action", { id, imageId, body });
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const property = await setCover(id, imageId);
  if (!property) {
    console.warn("[api:image] property not found for cover update", { id });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  console.info("[api:image] cover updated", { id, imageId, count: property.images.length });
  return NextResponse.json(property.images);
}
