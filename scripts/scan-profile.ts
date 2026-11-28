import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { ChangeRecord, ProviderSource } from '../src/domain/types.js';
import {
  RepoScanner,
  type MemorySnapshot,
  type ScanPhaseName,
  type ScanProfile,
} from '../src/scanner/repo-scanner.js';

interface RunMeasurement {
  readonly wallMs: number;
  readonly findingCount: number;
  readonly profile: ScanProfile;
  readonly before: MemorySnapshot;
  readonly after: MemorySnapshot;
}

const source: ProviderSource = {
  kind: 'openapi',
  provider: 'stripe',
  version: 'synthetic-profile',
  checksumSha256: 'synthetic-profile',
};

const change: ChangeRecord = {
  id: 'change_field_removed_legacy_name',
  provider: 'stripe',
  kind: 'field_removed',
  context: 'request_body',
  resource: 'Customer',
  path: 'legacy_name',
  oldValue: 'string',
  operation: 'POST /v1/customers/{customer}',
  breaking: true,
  source,
  evidence: 'synthetic profile fixture',
};

const iterations = parsePositiveInteger(process.argv[2] ?? '3', 'iterations');
const fileCount = parsePositiveInteger(process.argv[3] ?? '5000', 'file count');
const root = await mkdtemp(join(tmpdir(), 'dokimana-scan-profile-'));

try {
  await generateSyntheticRepo(root, fileCount);
  const runs: RunMeasurement[] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    collectGarbage();
    const before = memorySnapshot();
    const startedAt = performance.now();
    let profile: ScanProfile | undefined;
    const report = await new RepoScanner().scan(root, [change], {
      onProfile: (value) => {
        profile = value;
      },
    });
    const wallMs = performance.now() - startedAt;
    const after = memorySnapshot();
    if (profile === undefined) throw new Error('The scan did not emit a profile.');
    runs.push({ wallMs, findingCount: report.findings.length, profile, before, after });
  }

  console.log(
    JSON.stringify(
      {
        workload: {
          syntheticFiles: fileCount,
          changeCount: 1,
          iterations,
          generatedInTemporaryDirectory: true,
        },
        medianWallMs: round(median(runs.map((run) => run.wallMs))),
        medianPhaseMs: {
          collectSources: round(medianPhase(runs, 'collectSources')),
          createProject: round(medianPhase(runs, 'createProject')),
          buildIndex: round(medianPhase(runs, 'buildIndex')),
          scanFiles: round(medianPhase(runs, 'scanFiles')),
          buildReport: round(medianPhase(runs, 'buildReport')),
        },
        medianMemoryDeltaBytes: {
          heapUsed: Math.round(
            median(runs.map((run) => run.after.heapUsedBytes - run.before.heapUsedBytes)),
          ),
          rss: Math.round(median(runs.map((run) => run.after.rssBytes - run.before.rssBytes))),
        },
        runs: runs.map((run) => ({
          wallMs: round(run.wallMs),
          findingCount: run.findingCount,
          profile: run.profile,
          before: run.before,
          after: run.after,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}

async function generateSyntheticRepo(root: string, fileCount: number): Promise<void> {
  const batchSize = 250;
  for (let start = 0; start < fileCount; start += batchSize) {
    const writes: Promise<void>[] = [];
    const end = Math.min(start + batchSize, fileCount);
    for (let index = start; index < end; index += 1) {
      writes.push(
        writeFile(
          join(root, `module-${String(index).padStart(5, '0')}.ts`),
          moduleSource(index),
          'utf8',
        ),
      );
    }
    await Promise.all(writes);
  }
}

function moduleSource(index: number): string {
  const id = String(index);
  return `import Stripe from 'stripe';

const stripe = new Stripe('sk_test_profile');
const payload = { legacy_name: 'name_${id}', metadata: { tier: 'profile' } };

export async function updateCustomer${id}() {
  const customer = await stripe.customers.update('cus_${id}', payload);
  return customer.metadata;
}
`;
}

function medianPhase(runs: readonly RunMeasurement[], name: ScanPhaseName): number {
  return median(
    runs.map((run) => {
      const phase = run.profile.phases.find((item) => item.name === name);
      if (phase === undefined) throw new Error(`Missing profile phase: ${name}`);
      return phase.durationMs;
    }),
  );
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function memorySnapshot(): MemorySnapshot {
  const usage = process.memoryUsage();
  return { heapUsedBytes: usage.heapUsed, rssBytes: usage.rss };
}

function collectGarbage(): void {
  globalThis.gc?.();
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
