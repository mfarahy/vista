import { NextResponse } from "next/server";
import { getProperty, saveExpose } from "@/lib/store";
import { exposeContentInputSchema } from "@/lib/validation";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  console.info("[api:expose] GET /api/properties/:id/expose request", { id });
  const property = await getProperty(id);
  if (!property) {
    console.warn("[api:expose] property not found", { id });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  console.info("[api:expose] GET completed", { id, hasExpose: Boolean(property.expose) });
  return NextResponse.json(property.expose);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  console.info("[api:expose] PUT /api/properties/:id/expose request", { id });
  try {
     const content = exposeContentInputSchema.parse(await request.json());
    const expose = await saveExpose(id, content);
    if (!expose) {
      console.warn("[api:expose] property not found for save", { id });
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.info("[api:expose] PUT completed", { id, exposeId: expose.id });
    return NextResponse.json(expose);
  } catch (error) {
    console.error("[api:expose] PUT failed", {
      id,
      error: error instanceof Error ? error.message : "Invalid content",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid content" },
      { status: 400 },
    );
  }
}
