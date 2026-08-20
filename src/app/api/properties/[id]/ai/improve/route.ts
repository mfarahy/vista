import { NextResponse } from "next/server";
import { generateExposeContent } from "@/lib/ai";
import { getProperty, saveExpose } from "@/lib/store";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const id = (await params).id; const property = await getProperty(id); if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 }); const body = await request.json().catch(() => ({})) as { action?: string }; try { const content = await generateExposeContent(property, body.action ? `Aktion: ${body.action}` : ""); await saveExpose(id, content); return NextResponse.json(content); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "AI konnte nicht antworten" }, { status: 502 }); } }
