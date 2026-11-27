import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { assertOpenApiInput } from '../diff/structured-diff.js';

export type StripeSpecChannel = 'latest' | 'preview' | 'openapi';

export interface FetchStripeSpecInput {
  version: string;
  out: string;
  commit: string;
  channel?: StripeSpecChannel;
  fetchImpl?: typeof fetch;
}

export interface FetchStripeSpecResult {
  version: string;
  commit: string;
  channel: StripeSpecChannel;
  url: string;
  outputPath: string;
  checksumPath: string;
  sha256: string;
  bytes: number;
}

const channels = new Set<StripeSpecChannel>(['latest', 'preview', 'openapi']);

export function validateCommit(commit: string): void {
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error('--commit must be the full 40-character Stripe OpenAPI repository commit SHA.');
  }
}

export function validateVersion(version: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(version)) {
    throw new Error(
      '--version must be a plain Stripe API version string such as 2026-11-18.endive.',
    );
  }
}

export function stripeSpecUrl(commit: string, channel: StripeSpecChannel): string {
  validateCommit(commit);
  if (!channels.has(channel)) {
    throw new Error(`Unknown spec channel "${channel}". Use latest, preview, or openapi.`);
  }
  return `https://raw.githubusercontent.com/stripe/openapi/${commit}/${channel}/openapi.spec3.json`;
}

export async function fetchStripeSpec(input: FetchStripeSpecInput): Promise<FetchStripeSpecResult> {
  validateVersion(input.version);
  validateCommit(input.commit);
  const channel = input.channel ?? 'latest';
  const url = stripeSpecUrl(input.commit, channel);
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('This Node.js runtime does not provide fetch; use Node.js 20 or newer.');
  }

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Unable to download the pinned Stripe spec: HTTP ${response.status}.`);
  }
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The pinned Stripe spec is not valid JSON.');
  }
  assertOpenApiInput(parsed, 'pinned Stripe spec');
  if (parsed.info?.version !== input.version) {
    throw new Error(
      `Requested version ${input.version} but the pinned spec reports ${parsed.info?.version ?? 'no version'}.`,
    );
  }

  const outputPath = resolve(input.out);
  const checksumPath = `${outputPath}.sha256`;
  const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');
  const bytes = Buffer.byteLength(text, 'utf8');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, text, 'utf8');
  await writeFile(checksumPath, `${sha256}  ${basename(outputPath)}\n`, 'utf8');

  return {
    version: input.version,
    commit: input.commit,
    channel,
    url,
    outputPath,
    checksumPath,
    sha256,
    bytes,
  };
}
