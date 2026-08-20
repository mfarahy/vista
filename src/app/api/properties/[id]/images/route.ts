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
  if (!(await getProperty(id)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const form = await request.formData();
  const files = form
    .getAll("files")
    .filter((file): file is File => file instanceof File);
  if (!files.length)
    return NextResponse.json(
      { error: "Keine Bilder gefunden" },
      { status: 400 },
    );
  const images = [];
  await fs.mkdir(uploadPath, { recursive: true });
  for (const file of files) {
    if (!allowed.has(file.type))
      return NextResponse.json(
        { error: "Nur JPG, PNG und WEBP werden unterstützt" },
        { status: 400 },
      );
    if (file.size > 15 * 1024 * 1024)
      return NextResponse.json(
        { error: "Bilder dürfen maximal 15 MB groß sein" },
        { status: 400 },
      );
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
  }
  return NextResponse.json(images, { status: 201 });
}
