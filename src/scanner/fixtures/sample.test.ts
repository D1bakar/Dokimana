import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { RepoScanner } from '../repo-scanner.js';
import type { ChangeRecord, ProviderSource } from '../../domain/types.js';

describe('RepoScanner', () => {
  it('finds Stripe SDK call fields', async () => {
    const source: ProviderSource = {
      kind: 'openapi',
      provider: 'stripe',
      version: 'fixture',
      fetchedAt: new Date(0).toISOString(),
      checksumSha256: 'fixture',
    };
    const change: ChangeRecord = {
      id: 'change_legacy_name',
      provider: 'stripe',
      kind: 'field_removed',
      resource: 'Customer',
      path: 'legacy_name',
      oldValue: 'string',
      breaking: true,
      source,
      evidence: 'fixture',
    };
    const report = await new RepoScanner().scan(resolve('src/scanner/fixtures'), [change]);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.callSite.fieldPath).toEqual(['legacy_name']);
  });
});
