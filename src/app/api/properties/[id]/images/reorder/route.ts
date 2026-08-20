import { NextResponse } from "next/server";
import { reorderImages } from "@/lib/store";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const body = await request.json();
  const property = await reorderImages((await params).id, body.imageIds);
  return property
    ? NextResponse.json(property.images)
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
