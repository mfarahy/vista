import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vista-broker-profile-test-'));
process.env.DATA_DIR = tempDir;
process.env.UPLOAD_DIR = path.join(tempDir, 'uploads');

const { createApp } = await import('../app.js');
const { createProperty, updateProperty } = await import('../lib/store.js');
const { emptyProperty, emptyExposeData } = await import('../lib/types.js');

async function createLegacyAgent(agent: Record<string, string | null>) {
  const property = await createProperty();
  const payload = emptyProperty();
  payload.exposeData = {
    ...(property.exposeData ?? emptyExposeData()),
    agent: {
      name: null,
      company: null,
      phone: null,
      email: null,
      website: null,
      photo: null,
      logo: null,
      ...agent,
    },
  };
  await updateProperty(property.id, payload);
  return property;
}

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Max Mustermann',
    jobTitle: 'Immobilienmakler',
    company: 'Muster Immobilien GmbH',
    photo: null,
    logo: null,
    address: { street: 'Musterstraße', houseNumber: '1', postalCode: '10115', city: 'Berlin', country: 'Deutschland' },
    website: 'https://www.muster-immobilien.de',
    phone: '+49 30 123456',
    mobile: null,
    email: 'kontakt@muster-immobilien.de',
    tagline: null,
    description: 'Wir begleiten Sie bei Kauf und Verkauf.',
    awards: ['Ausgezeichnete Agentur 2025'],
    recommendations: '„Hervorragende Betreuung.“',
    recommendationUrl: 'https://www.example.com/bewertungen',
    externalLinks: [{ label: 'Portfolio', url: 'https://www.example.com/portfolio' }],
    additionalImages: [],
    ...overrides,
  };
}

describe('Broker Profile API', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp({});
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

  it('GET returns an empty profile when nothing is configured', async () => {
    const response = await fetch(`${baseUrl}/api/broker-profile`);
    assert.equal(response.status, 200);
    const profile = (await response.json()) as {
      name: string;
      company: string | null;
      awards: string[];
      externalLinks: unknown[];
    };
    // JSON transport drops undefined keys; the empty profile only has an
    // address when one was explicitly configured.
    assert.equal(profile.name, '');
    assert.equal(profile.company, null);
    assert.deepEqual(profile.awards, []);
    assert.deepEqual(profile.externalLinks, []);
  });

  it('GET seeds the profile from the most recent legacy agent data', async () => {
    await createLegacyAgent({ name: 'Alte Agentur', company: 'Alt GmbH' });
    await createLegacyAgent({
      name: 'Max Mustermann',
      company: 'Muster Immobilien GmbH',
      phone: '+49 30 123456',
      email: 'kontakt@muster-immobilien.de',
      website: 'https://www.muster-immobilien.de',
    });

    const response = await fetch(`${baseUrl}/api/broker-profile`);
    const profile = (await response.json()) as { name: string; company: string | null };
    assert.equal(profile.name, 'Max Mustermann');
    assert.equal(profile.company, 'Muster Immobilien GmbH');
  });

  it('PUT persists the profile and GET returns it afterwards', async () => {
    const put = await fetch(`${baseUrl}/api/broker-profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeProfile()),
    });
    assert.equal(put.status, 200);
    const saved = (await put.json()) as { name: string; awards: string[] };
    assert.equal(saved.name, 'Max Mustermann');
    assert.equal(saved.awards[0], 'Ausgezeichnete Agentur 2025');

    const get = await fetch(`${baseUrl}/api/broker-profile`);
    const profile = (await get.json()) as { name: string; website: string | null };
    assert.equal(profile.name, 'Max Mustermann');
    assert.equal(profile.website, 'https://www.muster-immobilien.de');
  });

  it('PUT rejects a profile without a name', async () => {
    const response = await fetch(`${baseUrl}/api/broker-profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeProfile({ name: '' })),
    });
    assert.equal(response.status, 400);
  });

  it('PUT rejects invalid email and URL values', async () => {
    const email = await fetch(`${baseUrl}/api/broker-profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeProfile({ email: 'keine-mail' })),
    });
    assert.equal(email.status, 400);

    const url = await fetch(`${baseUrl}/api/broker-profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeProfile({ website: 'ftp://nicht-erlaubt' })),
    });
    assert.equal(url.status, 400);
  });

  it('POST /image stores an upload under /uploads/broker/ and returns its URL', async () => {
    const body = new FormData();
    body.append(
      'files',
      new File([Buffer.from('fake-image-bytes')], 'foto.jpg', { type: 'image/jpeg' }),
    );
    const response = await fetch(`${baseUrl}/api/broker-profile/image`, {
      method: 'POST',
      body,
    });
    assert.equal(response.status, 201);
    const { url } = (await response.json()) as { url: string };
    assert.match(url, /^\/uploads\/broker\/.+-foto\.jpg$/);
    const file = await fs.readFile(
      path.join(tempDir, 'uploads', 'broker', path.basename(url)),
    );
    assert.equal(file.toString(), 'fake-image-bytes');
  });
});