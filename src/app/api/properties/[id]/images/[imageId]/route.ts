import { NextResponse } from "next/server";
import { getProperty, removeImage, setCover } from "@/lib/store";
import fs from "node:fs/promises";
import path from "node:path";
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) { const { id, imageId } = await params; const property = await getProperty(id); const image = property?.images.find((item) => item.id === imageId); if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 }); await removeImage(id, imageId); if (image.url.startsWith("/uploads/")) await fs.rm(path.join(process.cwd(), "public", image.url), { force: true }); return NextResponse.json({ ok: true }); }
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) { const { id, imageId } = await params; const body = await request.json().catch(() => ({})); if (!body.cover) return NextResponse.json({ error: "Invalid action" }, { status: 400 }); const property = await setCover(id, imageId); return property ? NextResponse.json(property.images) : NextResponse.json({ error: "Not found" }, { status: 404 }); }
