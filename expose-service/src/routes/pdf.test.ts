import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vista-pdf-route-test-'));
process.env.DATA_DIR = tempDir;
process.env.UPLOAD_DIR = path.join(tempDir, 'uploads');

const { createApp } = await import('../app.js');
const {
  createProperty,
  getProperty,
  saveMarketingContent,
  saveExposeConfiguration,
  updateProperty,
} = await import('../lib/store.js');
const { defaultExposeConfiguration } = await import('../lib/expose-configuration.js');
const { emptyProperty } = await import('../lib/types.js');
import type { MarketingContentRecord } from '../lib/marketing-content/types.js';

const mockPdf = Buffer.from('%PDF-1.4 mock expose document');

const marketing: MarketingContentRecord = {
  title: { value: 'Helle Wohnung mit Balkon', source: 'ai' },
  subtitle: { value: 'Weserstraße 42, Berlin-Neukölln', source: 'ai' },
  highlights: { value: ['Südwest-Balkon', 'Fußbodenheizung'], source: 'ai' },
  propertyDescription: { value: 'Beschreibungstext', source: 'ai' },
  equipmentDescription: { value: 'Ausstattungstext', source: 'ai' },
  locationDescription: { value: 'Lagetext', source: 'ai' },
};

describe('POST /api/properties/:id/pdf', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp({ renderPdf: async (_propertyId) => mockPdf });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns 404 for a missing property without calling the renderer', async () => {
    const response = await fetch(`${baseUrl}/api/properties/does-not-exist/pdf`, {
      method: 'POST',
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Not found' });
  });

  it('returns a PDF with the correct content type and sanitized filename', async () => {
    const property = await createProperty();
    const response = await fetch(`${baseUrl}/api/properties/${property.id}/pdf`, {
      method: 'POST',
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    const disposition = response.headers.get('content-disposition') ?? '';
    assert.ok(disposition.startsWith('attachment'), disposition);
    assert.ok(disposition.includes('filename'), disposition);
    assert.ok(disposition.includes(`Expose_${property.id}`), disposition);
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(body.toString('ascii', 0, 4), '%PDF');
    assert.deepEqual(body, mockPdf);
  });

  it('uses the sanitized property address in the download filename', async () => {
    const property = await createProperty();
    const payload = emptyProperty();
    payload.address = 'Weserstraße 42';
    payload.zipCode = '12045';
    payload.city = 'Berlin';
    payload.district = 'Neukölln';
    delete payload.exposeData;
    await updateProperty(property.id, payload);
    const response = await fetch(`${baseUrl}/api/properties/${property.id}/pdf`, {
      method: 'POST',
    });
    assert.equal(response.status, 200);
    const disposition = response.headers.get('content-disposition') ?? '';
    const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    assert.ok(match, disposition);
    assert.equal(decodeURIComponent(match![1]), 'Expose_Weserstraße_42.pdf');
  });

  it('does not change property, marketing, or expose configuration on success', async () => {
    const property = await createProperty();
    await saveMarketingContent(property.id, marketing);
    const configuration = {
      ...defaultExposeConfiguration(),
      sections: defaultExposeConfiguration().sections.map((section) =>
        section.type === 'energy' ? { ...section, visible: false } : section,
      ),
      selectedCoverImageId: 'img-cover',
      galleryImageIds: ['img-a', 'img-b'],
      contentOverrides: { title: 'Eigener Titel', highlights: ['Eigenes Highlight'] },
    };
    await saveExposeConfiguration(property.id, configuration);
    const before = JSON.parse(JSON.stringify(await getProperty(property.id)));

    const response = await fetch(`${baseUrl}/api/properties/${property.id}/pdf`, {
      method: 'POST',
    });
    assert.equal(response.status, 200);

    const after = JSON.parse(JSON.stringify(await getProperty(property.id)));
    assert.deepEqual(after, before);
  });

  it('returns 502 and keeps all data unchanged when PDF generation fails', async () => {
    const failingApp = createApp({
      renderPdf: async () => {
        throw new Error('chromium exploded');
      },
    });
    const failingServer = failingApp.listen(0);
    await new Promise<void>((resolve) => failingServer.once('listening', resolve));
    try {
      const failingBaseUrl = `http://127.0.0.1:${(failingServer.address() as AddressInfo).port}`;
      const property = await createProperty();
      await saveMarketingContent(property.id, marketing);
      await saveExposeConfiguration(property.id, defaultExposeConfiguration());
      const before = JSON.parse(JSON.stringify(await getProperty(property.id)));

      const response = await fetch(`${failingBaseUrl}/api/properties/${property.id}/pdf`, {
        method: 'POST',
      });
      assert.equal(response.status, 502);
      const body = (await response.json()) as { error?: string };
      assert.ok(body.error, 'expected an error message');
      assert.ok(!body.error!.includes('chromium'), 'stack traces must not leak to the user');

      const after = JSON.parse(JSON.stringify(await getProperty(property.id)));
      assert.deepEqual(after, before);
    } finally {
      await new Promise<void>((resolve, reject) =>
        failingServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
