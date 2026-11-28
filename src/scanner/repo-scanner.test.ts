import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { RepoScanner } from './repo-scanner.js';
import type { ChangeKind, ChangeRecord, ProviderSource } from '../domain/types.js';

const source: ProviderSource = {
  kind: 'openapi',
  provider: 'stripe',
  version: 'fixture',
  checksumSha256: 'fixture',
};

function change(path: string, kind: ChangeKind = 'field_removed'): ChangeRecord {
  return {
    id: `change_${kind}_${path}`.replaceAll('.', '_'),
    provider: 'stripe',
    kind,
    resource: 'Customer',
    path,
    oldValue: 'string',
    breaking: true,
    source,
    evidence: 'fixture',
  };
}

function scanFixture(directory: string, changes: ChangeRecord[]) {
  return new RepoScanner().scan(resolve('src/scanner/fixtures', directory), changes);
}

describe('RepoScanner', () => {
  it('matches exact object-literal keys on a Stripe client call', async () => {
    const report = await scanFixture('positive', [change('legacy_name')]);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.callSite.fieldPath).toEqual(['legacy_name']);
    expect(report.findings[0]?.callSite.kind).toBe('sdk_call');
    expect(report.findings[0]?.callSite.operation).toBe('customers.update');
    expect(report.findings[0]?.confidence).toBe('high');
  });

  it('maps newly required fields to call sites instead of treating them as resource-level', async () => {
    const report = await scanFixture('positive', [change('legacy_name', 'field_became_required')]);
    expect(report.findings).toHaveLength(1);
    expect(report.unverifiedCallSiteCoverage.some((note) => note.includes('resource-level'))).toBe(
      false,
    );
  });

  it('does not match non-Stripe clients or substring keys', async () => {
    const report = await scanFixture('negative', [change('legacy_name')]);
    expect(report.findings).toHaveLength(0);
  });

  it('matches nested object and array-item field paths', async () => {
    const report = await scanFixture('nested', [
      change('address.line1'),
      change('items[].legacy_name'),
    ]);
    expect(report.findings).toHaveLength(2);
    expect(report.findings.map((finding) => finding.callSite.fieldPath)).toEqual([
      ['address', 'line1'],
      ['items', '[]', 'legacy_name'],
    ]);
  });

  it('resolves object literals assigned to a local variable', async () => {
    const report = await scanFixture('resolved', [change('legacy_name')]);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.confidence).toBe('medium');
  });

  it('finds property access and destructuring on Stripe results', async () => {
    const report = await scanFixture('derived', [change('legacy_name')]);
    expect(report.findings).toHaveLength(2);
    expect(report.findings.every((finding) => finding.callSite.kind === 'sdk_field')).toBe(true);
    expect(report.findings.every((finding) => finding.confidence === 'medium')).toBe(true);
  });

  it('reports spread arguments as unverified instead of matching', async () => {
    const report = await scanFixture('dynamic', [change('legacy_name')]);
    expect(report.findings).toHaveLength(0);
    expect(report.unverifiedCallSiteCoverage.some((note) => note.includes('spread'))).toBe(true);
  });

  it('reports the full operation for an inline Stripe client', async () => {
    const report = await scanFixture('inline', [change('legacy_name')]);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.callSite.operation).toBe('customers.update');
  });

  it('detects Stripe clients created through require()', async () => {
    const report = await scanFixture('require', [change('legacy_name')]);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.callSite.file.endsWith('client.js')).toBe(true);
  });

  it('skips ignored directories such as vendor', async () => {
    const report = await scanFixture('ignored', [change('legacy_name')]);
    expect(report.findings).toHaveLength(0);
  });

  it('records resource-level changes as needs_human instead of guessing call sites', async () => {
    const report = await scanFixture('positive', [change('get', 'endpoint_removed')]);
    expect(report.findings).toHaveLength(0);
    expect(report.needsHuman).toHaveLength(1);
    expect(report.needsHuman[0]).toMatchObject({
      kind: 'endpoint_removed',
      resource: 'Customer',
    });
    expect(report.needsHuman[0]?.reason).toContain('review manually');
    expect(
      report.unverifiedCallSiteCoverage.some((note) => note.includes('need human review')),
    ).toBe(true);
  });

  it('states which source extensions and ignored directories were used', async () => {
    const report = await scanFixture('positive', [change('legacy_name')]);
    expect(
      report.unverifiedCallSiteCoverage.some((note) => note.includes('extensions inspected')),
    ).toBe(true);
    expect(
      report.unverifiedCallSiteCoverage.some((note) => note.includes('ignored directories')),
    ).toBe(true);
  });
});
