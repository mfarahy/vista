import { NextResponse } from "next/server";
import { createProperty, listProperties } from "@/lib/store";
export async function GET() { return NextResponse.json(await listProperties()); }
export async function POST() { return NextResponse.json(await createProperty(), { status: 201 }); }
