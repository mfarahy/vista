import dotenv from 'dotenv';
dotenv.config();

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

import { fal } from '@fal-ai/client';
import { OpenAIDocumentUnderstandingProvider } from '../src/lib/document-understanding/openai-provider.js';
import type { DocumentUnderstandingInput } from '../src/lib/document-understanding/types.js';

/**
 * Phase 9 real-API verification (WEG + photo intelligence).
 *
 * Runs the REAL OpenAI understanding provider against:
 *  - the project's own real documents (text embedded in the upload PDFs),
 *  - a realistic German WEG sample (Teilungserklärung) clearly marked as
 *    synthetic — no Teilungserklärung file exists in the project,
 *  - real property photos generated with the configured FAL image provider.
 *
 * This script makes paid API calls. It is intentionally NOT part of the test
 * suite; run it manually: `npx tsx scripts/weg-photo-verify.ts`.
 */

const provider = new OpenAIDocumentUnderstandingProvider();

function pdfText(fileName: string): string | null {
  const filePath = path.join(process.cwd(), 'public', 'uploads', fileName);
  try {
    const raw = fs.readFileSync(filePath, 'latin1');
    return raw
      .match(/\((?:[^()\\]|\\.)*\)/g)
      ?.map((token) => token.slice(1, -1).replace(/\\\(/g, '(').replace(/\\\)/g, ')'))
      .join('\n');
  } catch {
    return null;
  }
}

async function understand(input: DocumentUnderstandingInput) {
  const started = Date.now();
  const result = await provider.analyzeDocument(input);
  return { result, durationMs: Date.now() - started };
}

function printResult(
  label: string,
  input: DocumentUnderstandingInput,
  out: Awaited<ReturnType<typeof understand>>,
) {
  const { result, durationMs } = out;
  console.log(`\n=== ${label} (${durationMs} ms) ===`);
  console.log(`type: ${result.documentType} | keepInLibrary: ${result.keepInLibrary}`);
  console.log(`tags: ${result.tags.join(', ')}`);
  console.log(`summary: ${result.summary}`);
  if (result.wizardFields.length) {
    console.log('wizardFields:');
    for (const field of result.wizardFields) {
      console.log(`  - ${field.field} = ${String(field.value)} | beleg: ${field.evidence ?? '—'}`);
    }
  }
  if (result.additionalInformation.length) {
    console.log('additionalInformation:');
    for (const info of result.additionalInformation) {
      console.log(`  - ${info.key} = ${String(info.value)} | beleg: ${info.evidence ?? '—'}`);
    }
  }
  if (result.photo) {
    console.log(
      `photo: ${result.photo.photoType} | cover: ${result.photo.coverSuitability}${result.photo.coverSuitabilityReason ? ` (${result.photo.coverSuitabilityReason})` : ''}`,
    );
    if (result.photo.photoTags.length) {
      console.log(
        `photoTags: ${result.photo.photoTags.map((tag) => `${tag.tag} (${tag.evidence})`).join(', ')}`,
      );
    }
    console.log(`visualDescription: ${result.photo.visualDescription}`);
  }
  return result;
}

async function generatePhoto(prompt: string, outFile: string): Promise<Buffer> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) throw new Error('FAL_KEY is not configured.');
  fal.config({ credentials: apiKey });
  console.log(`Generating photo via FAL: ${prompt}`);
  const response = await fal.run('fal-ai/fast-sdxl', {
    input: { prompt, image_size: 'square_hd', num_inference_steps: 28, output_format: 'jpeg' },
  });
  const image = (response.data as { images?: Array<{ url: string }> }).images?.[0];
  if (!image?.url) throw new Error('FAL returned no image.');
  const bytes = Buffer.from(await (await fetch(image.url)).arrayBuffer());
  await fsPromises.writeFile(outFile, bytes);
  return bytes;
}

async function main(): Promise<void> {
  console.log('Phase 9 real-API verification (paid OpenAI calls)');
  const photosOnly = process.argv.includes('--photos-only');

  // 1. Real project documents (text embedded in the upload PDFs) — regression.
  if (!photosOnly) {
    const realDocuments: Array<[string, string]> = [
      ['Kaufvertrag (echt)', '593cdcb5-fce7-4bed-b0e6-0eebfb7221dd-kaufvertrag.pdf'],
      ['Mietvertrag (echt)', '324de987-f6a8-49c9-aae0-fa28a18f6c7c-mietvertrag.pdf'],
      ['Grundbuchauszug (echt)', '66ec0c19-5252-4083-96da-f08d7465dbaf-grundbuchauszug.pdf'],
      ['Energieausweis (echt)', '212e465d-bd84-4483-bf16-a9af4f5ec9b4-energieausweis.pdf'],
    ];
    for (const [label, file] of realDocuments) {
      const text = pdfText(file);
      if (!text) {
        console.log(`\n=== ${label}: PDF nicht lesbar (übersprungen)`);
        continue;
      }
      const input: DocumentUnderstandingInput = {
        documentId: file,
        filename: file,
        mimeType: 'application/pdf',
        text,
      };
      printResult(label, input, await understand(input));
    }

    // 2. Realistic German WEG sample (Teilungserklärung). No Teilungserklärung
    //    file exists in the project; this synthetic sample is used ONLY for
    //    verification and is clearly marked as such.
    const wegText = [
      'TEILUNGSERKLAERUNG UND GEMEINSCHAFTSORDNUNG',
      'Objekt: Wohnanlage Sonnenallee 12, 12045 Berlin',
      'Der Eigentümer teilt das Grundstück gemäß § 8 WEG in Wohnungseigentum auf.',
      'Miteigentumsanteil: 145/10.000 zu Wohnung Nr. 4, 2. Obergeschoss links,',
      'Wohnfläche ca. 82 m², bestehend aus 3 Zimmern.',
      'Sondernutzungsrecht am Kellerraum Nr. 4 und am Stellplatz Nr. 7.',
      'Verwalter: Hausverwaltung Sonnenallee GmbH, Berlin',
      'Hausgeld: 350,00 EUR monatlich',
      'Instandhaltungsrücklage: 85.000 EUR (Stand 31.12.2025)',
      'Die Wohnungseigentümer beschließen die Einrichtung der Instandhaltungsrücklage gemäß § 19 Abs. 2 Nr. 4 WEG.',
      'Zugang zu Garten: Die Wohnung Nr. 4 verfügt über einen Gartenanteil.',
    ].join('\n');
    printResult(
      'Teilungserklärung (synthetisches WEG-Beispiel zur Verifikation)',
      {
        documentId: 'teilungserklaerung-sample',
        filename: 'teilungserklaerung-sample.pdf',
        mimeType: 'application/pdf',
        text: wegText,
      },
      await understand({
        documentId: 'teilungserklaerung-sample',
        filename: 'teilungserklaerung-sample.pdf',
        mimeType: 'application/pdf',
        text: wegText,
      }),
    );
  }

  // 3. Real property photos generated with FAL, analyzed with the image bytes.
  const photoPrompts: Array<[string, string]> = [
    [
      'exterior',
      'Photo of a modern German apartment building exterior with a tidy front garden, blue sky, real estate photography',
    ],
    [
      'living_room',
      'Photo of a bright living room with parquet floor, large windows, sofa and access to a balcony, real estate photography',
    ],
    [
      'kitchen',
      'Photo of a modern fitted kitchen with high cabinets, tiled worktop, real estate photography',
    ],
    [
      'bathroom',
      'Photo of a bathroom with bathtub and glass shower, tiled walls, real estate photography',
    ],
  ];
  const outDir = path.join(process.cwd(), 'data', 'photo-verify');
  await fsPromises.mkdir(outDir, { recursive: true });
  for (const [expected, prompt] of photoPrompts) {
    try {
      const bytes = await generatePhoto(prompt, path.join(outDir, `${expected}.jpg`));
      const input: DocumentUnderstandingInput = {
        documentId: `photo-${expected}`,
        filename: `${expected}.jpg`,
        mimeType: 'image/jpeg',
        text: '',
        image: { content: bytes, mimeType: 'image/jpeg' },
      };
      const out = await understand(input);
      const result = printResult(`Foto ${expected} (erwartet: ${expected})`, input, out);
      const ok =
        result.photo?.photoType === expected ||
        (result.photo?.photoType === 'other' && expected === 'other');
      console.log(
        `→ Foto-Klassifikation plausibel: ${ok ? 'ja' : 'prüfen (visuelle Mehrdeutigkeit möglich)'}`,
      );
    } catch (error) {
      console.log(
        `\n=== Foto ${expected}: fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log('\nVerifikation abgeschlossen.');
}

main().catch((error) => {
  console.error(
    `Verifikation fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
