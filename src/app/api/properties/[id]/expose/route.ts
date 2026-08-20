import { NextResponse } from "next/server";
import { getProperty, saveExpose } from "@/lib/store";
import { exposeContentSchema } from "@/lib/validation";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const property = await getProperty((await params).id); return property ? NextResponse.json(property.expose) : NextResponse.json({ error: "Not found" }, { status: 404 }); }
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const content = exposeContentSchema.parse(await request.json()); const expose = await saveExpose((await params).id, content); return expose ? NextResponse.json(expose) : NextResponse.json({ error: "Not found" }, { status: 404 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid content" }, { status: 400 }); } }
