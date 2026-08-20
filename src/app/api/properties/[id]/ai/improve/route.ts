import { NextResponse } from "next/server";
import { generateExposeContent } from "@/lib/ai";
import { getProperty, saveExpose } from "@/lib/store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  console.info("[api:ai-improve] POST /api/properties/:id/ai/improve request", {
    id,
  });
  const property = await getProperty(id);
  if (!property) {
    console.warn("[api:ai-improve] property not found", { id });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action ? `Aktion: ${body.action}` : "";
  console.info("[api:ai-improve] generating expose content", {
    id,
    actionLength: action.length,
  });
  try {
    const content = await generateExposeContent(property, action);
    await saveExpose(id, content);
    console.info("[api:ai-improve] expose content generated and saved", {
      id,
      title: content.title,
    });
    return NextResponse.json(content);
  } catch (error) {
    console.error("[api:ai-improve] content generation failed", {
      id,
      error: error instanceof Error ? error.message : "AI konnte nicht antworten",
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "AI konnte nicht antworten",
      },
      { status: 502 },
    );
  }
}
