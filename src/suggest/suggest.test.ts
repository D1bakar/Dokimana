import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChangeRecord, ImpactReport } from '../domain/types.js';
import { suggestChanges } from './suggest.js';

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot === undefined) return;
  await rm(tempRoot, { recursive: true, force: true });
  tempRoot = undefined;
});

async function writeFixture(files: Record<string, string>): Promise<string> {
  tempRoot = await mkdtemp(join(tmpdir(), 'dokimana-suggest-'));
  for (const [name, content] of Object.entries(files)) {
    const target = join(tempRoot, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return tempRoot;
}

function makeChange(overrides: Partial<ChangeRecord> = {}): ChangeRecord {
  return {
    id: 'change-1',
    provider: 'stripe',
    kind: 'field_removed',
    context: 'schema',
    resource: 'customer',
    path: 'old_field',
    oldValue: 'old_field',
    breaking: true,
    source: {
      kind: 'openapi',
      provider: 'stripe',
      version: '2026-01-01',
      checksumSha256: 'synthetic-checksum',
    },
    evidence: 'synthetic fixture',
    ...overrides,
  };
}

function makeReport(root: string, changes: ChangeRecord[]): ImpactReport {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    root,
    changes,
    findings: [],
    needsHuman: [],
    unresolved: [],
    unverifiedCallSiteCoverage: [],
  };
}

describe('suggestChanges', () => {
  it('renames a mapped field at statically identifiable sites', async () => {
    const root = await writeFixture({
      'src/client.ts': `import Stripe from 'stripe';

const stripe = new Stripe('fake-key');
const params = {
  old_field: 'value',
};
const result = await stripe.customers.create(params);
const { old_field } = result;
console.log(result.old_field);
console.log(result?.old_field);
`,
    });

    const result = suggestChanges({
      root,
      impact: makeReport(root, [makeChange()]),
      mappings: { 'customer.old_field': 'new_field' },
    });

    expect(result.applied).toHaveLength(4);
    expect(result.applied.every((item) => item.kind === 'field_renamed')).toBe(true);
    expect(result.patch).toContain('--- a/src/client.ts');
    expect(result.patch).toContain('+++ b/src/client.ts');
    expect(result.patch).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
    expect(result.patch).toContain("+  new_field: 'value',");
    expect(result.patch).toContain('+const { new_field: old_field } = result;');
    expect(result.patch).toContain('+console.log(result.new_field);');
    expect(result.patch).toContain('+console.log(result?.new_field);');
    expect(result.patch).not.toContain(root);
    expect(result.summary).toEqual({
      renames: 4,
      removals: 0,
      needsHuman: 0,
      filesChanged: 1,
    });
  });

  it('removes a mapped field only at unambiguous line boundaries', async () => {
    const root = await writeFixture({
      'src/params.ts': `const params = {
  legacy_id: 'x',
  keep: true,
};
params.legacy_id;
`,
    });

    const result = suggestChanges({
      root,
      impact: makeReport(root, [
        makeChange({
          id: 'change-removal',
          path: 'legacy_id',
          oldValue: 'legacy_id',
        }),
      ]),
      mappings: { legacy_id: null },
    });

    expect(result.applied).toHaveLength(2);
    expect(result.applied.every((item) => item.kind === 'field_removed')).toBe(true);
    expect(result.applied.every((item) => item.after === '')).toBe(true);
    expect(result.patch).toContain("-  legacy_id: 'x',");
    expect(result.patch).toContain('-params.legacy_id;');
    expect(result.patch).not.toContain('+  legacy_id');
    expect(result.patch).not.toContain(root);
    expect(result.summary).toEqual({
      renames: 0,
      removals: 2,
      needsHuman: 0,
      filesChanged: 1,
    });
  });

  it('does not patch enum value removals and records a review checklist', async () => {
    const root = await writeFixture({
      'src/status.ts': `export type Status = 'active' | 'archived';
`,
    });

    const result = suggestChanges({
      root,
      impact: makeReport(root, [
        makeChange({
          id: 'change-enum',
          kind: 'enum_value_removed',
          path: 'status',
          oldValue: 'archived',
        }),
      ]),
      mappings: { 'customer.status': 'active' },
    });

    expect(result.patch).toBe('');
    expect(result.applied).toEqual([]);
    expect(result.needsHuman).toHaveLength(1);
    expect(result.needsHuman[0]?.reason).toContain('[ ] callers');
    expect(result.needsHuman[0]?.reason).toContain('[ ] defaults');
    expect(result.needsHuman[0]?.reason).toContain('[ ] validation');
    expect(result.needsHuman[0]?.reason).toContain('[ ] tests');
    expect(result.summary).toEqual({
      renames: 0,
      removals: 0,
      needsHuman: 1,
      filesChanged: 0,
    });
  });
});
