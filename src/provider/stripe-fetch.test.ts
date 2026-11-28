import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fetchStripeSpec,
  stripeSpecUrl,
  validateCommit,
  type FetchStripeSpecInput,
} from './stripe-fetch.js';

const commit = '0f6d4dfafe157c10df393ce8a27d00b186ab3955';
const version = '2026-11-18.endive';

function spec(reportedVersion = version) {
  return {
    openapi: '3.0.0',
    info: { title: 'Stripe API', version: reportedVersion },
    components: { schemas: { customer: { type: 'object' } } },
    paths: {},
  };
}

function mockFetch(body: unknown): typeof fetch {
  return (input) => {
    expect(input).toBe(stripeSpecUrl(commit, 'latest'));
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
}

describe('fetchStripeSpec', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dokimana-fetch-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function input(overrides: Partial<FetchStripeSpecInput> = {}): FetchStripeSpecInput {
    return {
      version,
      commit,
      out: join(directory, 'openapi.spec3.json'),
      fetchImpl: mockFetch(spec()),
      ...overrides,
    };
  }

  it('downloads only the pinned commit and writes a matching sha256 sidecar', async () => {
    const result = await fetchStripeSpec(input());

    expect(result.url).toBe(
      `https://raw.githubusercontent.com/stripe/openapi/${commit}/latest/openapi.spec3.json`,
    );
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await readFile(result.checksumPath, 'utf8')).toContain(result.sha256);
    expect(await readFile(result.outputPath, 'utf8')).toContain(version);
  });

  it('refuses a spec whose reported version differs from the requested version', async () => {
    await expect(
      fetchStripeSpec(input({ fetchImpl: mockFetch(spec('2025-01-01.alpha')) })),
    ).rejects.toThrow(/Requested version/);
  });

  it('requires a full commit SHA', () => {
    expect(() => {
      validateCommit('master');
    }).toThrow(/40-character/);
  });
});
