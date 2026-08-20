import { NextResponse } from "next/server";
import { getProperty, updateProperty } from "@/lib/store";
import { propertySchema } from "@/lib/validation";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const property = await getProperty((await params).id); return property ? NextResponse.json(property) : NextResponse.json({ error: "Not found" }, { status: 404 }); }
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const payload = propertySchema.parse(await request.json()); const property = await updateProperty((await params).id, payload as Parameters<typeof updateProperty>[1]); return property ? NextResponse.json(property) : NextResponse.json({ error: "Not found" }, { status: 404 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 }); } }
