"use client";
import { useRef, useState } from "react";
import { LoaderCircle, RefreshCw, Sparkles, Upload } from "lucide-react";
import { apiAssetUrl, apiFetch } from "@/lib/api";

const DEFAULT_SYSTEM_PROMPT =
  "The input image is a 2D architectural floor plan. Preserve the EXACT room layout: the position and proportions of every wall, door, window, and each room must stay unchanged. Do NOT add, remove, merge, or resize any rooms. Do NOT change the architecture or the overall outline of the building.";

const DEFAULT_USER_PROMPT =
  "Transform the 2D floor plan into a realistic 3D interior/exterior visualization. Add realistic furniture appropriate to each room (sofas, beds, kitchen counters, tables, chairs, etc.). Use realistic materials (wood flooring, tiles, brick, glass, concrete, drywall) and realistic natural lighting with soft shadows. Render as a professional architectural 3D visualization with a slightly elevated isometric view so the full layout is visible. Warm inviting color palette, high detail, photorealistic.";

const IMAGE_SIZES = [
  ["landscape_4_3", "Landscape 4:3"],
  ["landscape_16_9", "Landscape 16:9"],
  ["square", "Square"],
  ["square_hd", "Square HD"],
  ["portrait_4_3", "Portrait 4:3"],
  ["portrait_16_9", "Portrait 16:9"],
] as const;

type Result = { url: string; falUrl: string; seed: number };

export default function FloorplanPage() {
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [userPrompt, setUserPrompt] = useState(DEFAULT_USER_PROMPT);
  const [imageSize, setImageSize] = useState("landscape_4_3");
  const [guidanceScale, setGuidanceScale] = useState("3.5");
  const [numInferenceSteps, setNumInferenceSteps] = useState("28");
  const [seed, setSeed] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined | null) {
    if (!file) return;
    setImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  }

  async function handleGenerate() {
    if (!image) {
      setError("Please upload a 2D floor plan image first.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("image", image);
      form.append("systemPrompt", systemPrompt);
      form.append("userPrompt", userPrompt);
      form.append("imageSize", imageSize);
      form.append("guidanceScale", guidanceScale);
      form.append("numInferenceSteps", numInferenceSteps);
      if (seed.trim()) form.append("seed", seed.trim());

      const response = await apiFetch("/api/floorplan/to3d", {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`);
      setResult(body as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen shell-grid pb-20">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 lg:px-8">
        <a href="/" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#202522] font-serif text-lg text-white">
            R
          </span>
          <span className="text-sm font-bold tracking-[.18em]">RAUMWERK</span>
        </a>
        <span className="hidden text-xs font-bold tracking-[.16em] text-[#758078] sm:block">
          FLOOR PLAN · 3D TEST
        </span>
      </nav>

      <header className="mx-auto max-w-6xl px-6 lg:px-8">
        <p className="text-xs font-bold tracking-[.18em] text-[#607b68]">
          PROOF OF CONCEPT · FAL.AI FLUX 2
        </p>
        <h1 className="serif mt-2 text-4xl tracking-[-.03em]">
          2D floor plan → <em className="text-[#78917d]">3D render</em>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5f6c63]">
          Upload a floor plan image, tune the system and user prompts, and get a
          3D interior/exterior visualization back. Nothing is persisted.
        </p>
      </header>

      <section className="mx-auto mt-8 grid max-w-6xl gap-6 px-6 lg:grid-cols-2 lg:px-8">
        <div className="card flex flex-col gap-5 p-6">
          {/* Image upload */}
          <div>
            <label className="mb-2 block text-xs font-bold tracking-wider text-[#607b68]">
              INPUT IMAGE
            </label>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFile(e.dataTransfer.files?.[0]);
              }}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-dashed border-[#c6d0c6] bg-[#f7faf7] px-4 py-10 text-sm text-[#65736a] transition hover:border-[#92a998] hover:bg-white"
            >
              {previewUrl ? (
                <img src={previewUrl} alt="Floor plan preview" className="max-h-48 rounded-lg object-contain" />
              ) : (
                <>
                  <Upload size={18} />
                  <span>
                    Click or drop a floor plan image
                    <span className="block text-xs text-[#92a198]">JPG · PNG · WEBP, up to 15 MB</span>
                  </span>
                </>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          {/* System prompt */}
          <div>
            <label className="mb-2 block text-xs font-bold tracking-wider text-[#607b68]">
              SYSTEM PROMPT
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              className="field resize-y"
              placeholder="Rules the model must follow"
            />
          </div>

          {/* User prompt */}
          <div>
            <label className="mb-2 block text-xs font-bold tracking-wider text-[#607b68]">
              USER PROMPT
            </label>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              rows={5}
              className="field resize-y"
              placeholder="What to generate"
            />
          </div>

          {/* Parameters */}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold tracking-wider text-[#607b68]">
              IMAGE SIZE
              <select
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value)}
                className="field mt-1"
              >
                {IMAGE_SIZES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold tracking-wider text-[#607b68]">
              GUIDANCE SCALE
              <input
                type="number"
                step="0.1"
                min="0"
                value={guidanceScale}
                onChange={(e) => setGuidanceScale(e.target.value)}
                className="field mt-1"
              />
            </label>
            <label className="text-xs font-bold tracking-wider text-[#607b68]">
              STEPS
              <input
                type="number"
                min="1"
                max="50"
                value={numInferenceSteps}
                onChange={(e) => setNumInferenceSteps(e.target.value)}
                className="field mt-1"
              />
            </label>
            <label className="text-xs font-bold tracking-wider text-[#607b68]">
              SEED (optional)
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="field mt-1"
                placeholder="random"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="btn btn-primary flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <LoaderCircle size={16} className="animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles size={16} /> Generate 3D render
              </>
            )}
          </button>

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          )}
        </div>

        {/* Result */}
        <div className="card flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold tracking-wider text-[#607b68]">
              OUTPUT
            </label>
            {result && (
              <a
                href={apiAssetUrl(result.url)}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary flex items-center gap-2"
              >
                Open full size
              </a>
            )}
          </div>
          <div className="grid flex-1 place-items-center overflow-hidden rounded-xl border border-[#dfe6df] bg-[#f7faf7]">
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-16 text-sm text-[#65736a]">
                <LoaderCircle size={24} className="animate-spin text-[#607b68]" />
                Rendering 3D visualization…
              </div>
            ) : result ? (
              <img
                src={apiAssetUrl(result.url)}
                alt="Generated 3D render"
                className="max-h-[560px] w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-20 text-sm text-[#92a198]">
                <RefreshCw size={22} />
                The generated render will appear here.
              </div>
            )}
          </div>
          {result && (
            <div className="text-xs text-[#65736a]">
              <p>
                Seed: <span className="font-semibold">{result.seed}</span> · Served
                from <code className="rounded bg-[#eef3ee] px-1.5 py-0.5">{result.url}</code>
              </p>
              <p className="mt-1 truncate">
                fal.ai URL:{" "}
                <a href={result.falUrl} target="_blank" rel="noreferrer" className="text-[#607b68] underline">
                  {result.falUrl}
                </a>
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}