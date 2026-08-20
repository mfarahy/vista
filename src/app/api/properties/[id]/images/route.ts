import { NextResponse } from "next/server";
import { addImage, getProperty, uploadPath } from "@/lib/store";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  console.info("[api:images] POST request received", { id });
  if (!(await getProperty(id))) {
    console.warn("[api:images] property not found", { id });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const form = await request.formData();
  const files = form
    .getAll("files")
    .filter((file): file is File => file instanceof File);
  console.info("[api:images] files received", { id, fileCount: files.length });
  if (!files.length)
    return NextResponse.json(
      { error: "Keine Bilder gefunden" },
      { status: 400 },
    );
  const images = [];
  await fs.mkdir(uploadPath, { recursive: true });
  for (const file of files) {
    if (!allowed.has(file.type)) {
      console.warn("[api:images] unsupported mime type", {
        id,
        fileName: file.name,
        mimeType: file.type,
      });
      return NextResponse.json(
        { error: "Nur JPG, PNG und WEBP werden unterstützt" },
        { status: 400 },
      );
    }
    if (file.size > 15 * 1024 * 1024) {
      console.warn("[api:images] file too large", {
        id,
        fileName: file.name,
        size: file.size,
      });
      return NextResponse.json(
        { error: "Bilder dürfen maximal 15 MB groß sein" },
        { status: 400 },
      );
    }
    const name = `${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
    await fs.writeFile(
      path.join(uploadPath, name),
      Buffer.from(await file.arrayBuffer()),
    );
    const image = await addImage(id, {
      url: `/uploads/${name}`,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      sequence: 0,
      isCover: false,
    });
    if (image) images.push(image);
    console.info("[api:images] saved uploaded image", {
      id,
      imageId: image?.id,
      url: `/uploads/${name}`,
    });
  }
  return NextResponse.json(images, { status: 201 });
}
