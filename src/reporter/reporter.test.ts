import { describe, expect, it } from 'vitest';
import type { ChangeRecord, ImpactReport } from '../domain/types.js';
import { buildEvidenceReport, renderMarkdownReport, renderTerminalReport } from './reporter.js';

const source = {
  kind: 'openapi' as const,
  provider: 'stripe' as const,
  version: 'fixture',
  fetchedAt: '2025-01-01T00:00:00.000Z',
  checksumSha256: 'fixture',
};

function change(overrides: Partial<ChangeRecord> = {}): ChangeRecord {
  return {
    id: 'change_fixture',
    provider: 'stripe',
    kind: 'field_removed',
    resource: 'Customer|<img src=x onerror=alert(1)>',
    path: 'status\n## forged heading',
    oldValue: '*bold* | `code` <script>',
    breaking: true,
    source,
    evidence: 'Structured diff: field removed',
    ...overrides,
  };
}

function impact(changes: ChangeRecord[]): ImpactReport {
  return {
    generatedAt: '2025-01-01T00:00:00.000Z',
    root: '/workspace/repo',
    changes,
    findings: [],
    unverifiedCallSiteCoverage: [],
  };
}

describe('renderMarkdownReport', () => {
  it('includes structured changes and safely renders untrusted values', () => {
    const report = renderMarkdownReport(
      buildEvidenceReport({
        repository: '/workspace/repo',
        providerVersion: 'fixture',
        impact: impact([change()]),
        patches: [],
        verification: [],
      }),
    );

    expect(report).toContain('## Structured Changes');
    expect(report).toContain('field_removed');
    expect(report).toContain('Customer&#124;&lt;img src=x onerror=alert(1)&gt;');
    expect(report).toContain('status ## forged heading');
    expect(report).toContain('*bold* &#124; `code` &lt;script&gt;');
    expect(report).not.toContain('<img');
    expect(report).not.toContain('<script>');
    expect(report).not.toContain('\n## forged heading');
  });

  it('states explicitly when the input contains no structural changes', () => {
    const report = renderMarkdownReport(
      buildEvidenceReport({
        repository: '/workspace/repo',
        providerVersion: 'fixture',
        impact: impact([]),
        patches: [],
        verification: [],
      }),
    );

    expect(report).toContain('_No structured changes found._');
  });
});

describe('renderTerminalReport', () => {
  it('includes change details and removes control characters from untrusted values', () => {
    const report = renderTerminalReport(
      buildEvidenceReport({
        repository: '/workspace/repo',
        providerVersion: 'fixture',
        impact: impact([change({ resource: 'Customer\u001b[31m' })]),
        patches: [],
        verification: [],
      }),
    );

    expect(report).toContain('field_removed Customer [31m.status');
    expect(report).toContain('*bold* | `code` <script>');
    expect(report).not.toContain('\u001b');
  });
});
