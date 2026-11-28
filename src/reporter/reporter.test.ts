import { describe, expect, it } from 'vitest';
import type { ChangeRecord, ImpactReport } from '../domain/types.js';
import {
  assertImpactReport,
  buildEvidenceReport,
  renderMarkdownReport,
  renderTerminalReport,
} from './reporter.js';

const source = {
  kind: 'openapi' as const,
  provider: 'stripe' as const,
  version: 'fixture',
  checksumSha256: 'fixture',
};

function change(overrides: Partial<ChangeRecord> = {}): ChangeRecord {
  return {
    id: 'change_fixture',
    provider: 'stripe',
    context: 'schema',
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
    contentSha256: 'a'.repeat(64),
    root: '/workspace/repo',
    changes,
    findings: [],
    needsHuman: [],
    unresolved: [],
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
        verification: [],
      }),
    );

    expect(report).toContain('## Summary');
    expect(report).toContain('## By severity');
    expect(report).toContain('## By resource');
    expect(report).toContain('## Limits of this scan');
    expect(report).toContain('## Structured Changes');
    expect(report).toContain(
      '| Context | Change | Resource | Path | Old value | New value | Evidence |',
    );
    expect(report).toContain('schema');
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
        verification: [],
      }),
    );

    expect(report).toContain('_No structured changes found._');
  });

  it('lists unsupported changes as needs_human', () => {
    const input = impact([change({ kind: 'endpoint_removed' })]);
    input.needsHuman = [
      {
        changeId: 'change_fixture',
        context: 'operation',
        kind: 'endpoint_removed',
        resource: 'delete /v1/customers/{id}',
        reason: 'No static call-site mapping is defined; review manually.',
      },
    ];
    const report = renderMarkdownReport(
      buildEvidenceReport({
        repository: '/workspace/repo',
        providerVersion: 'fixture',
        impact: input,
        verification: [],
      }),
    );

    expect(report).toContain('## Needs Human Review');
    expect(report).toContain('operation');
    expect(report).toContain('endpoint_removed');
    expect(report).toContain('review manually');
  });

  it('records unresolved sites instead of silently skipping them', () => {
    const input = impact([change()]);
    input.unresolved = [
      {
        file: 'src/dynamic.ts',
        line: 8,
        column: 3,
        kind: 'dynamic_call',
        snippet: 'client[method]()',
        reason: 'Runtime method name.',
        relatedChangeIds: ['change_fixture'],
      },
    ];
    const report = renderMarkdownReport(
      buildEvidenceReport({
        repository: '/workspace/repo',
        providerVersion: 'fixture',
        impact: input,
        verification: [],
      }),
    );
    expect(report).toContain('## Unresolved Sites');
    expect(report).toContain('dynamic_call');
    expect(report).toContain('Runtime method name.');
  });
});

describe('buildEvidenceReport', () => {
  it('normalizes repository, call-site, and unresolved paths to forward slashes', () => {
    const input = impact([]);
    input.findings.push({
      changeId: 'change_fixture',
      callSite: {
        file: 'C:\\repo\\src\\client.ts',
        line: 1,
        column: 1,
        operation: 'customers.update',
        fieldPath: ['legacy_name'],
        kind: 'sdk_call',
        snippet: 'stripe.customers.update(id, { legacy_name: "x" })',
      },
      confidence: 'high',
      reason: 'Fixture finding.',
      confidenceReason: 'Fixture evidence.',
    });
    input.unresolved = [
      {
        file: '..\\src\\dynamic.ts',
        line: 2,
        column: 3,
        kind: 'dynamic_call',
        snippet: 'client[method]()',
        reason: 'Runtime method name.',
        relatedChangeIds: [],
      },
    ];

    const report = buildEvidenceReport({
      repository: 'C:\\repo',
      providerVersion: 'fixture',
      impact: input,
      verification: [],
    });

    expect(report.repository).toBe('C:/repo');
    expect(report.findings[0]?.callSite.file).toBe('C:/repo/src/client.ts');
    expect(report.unresolved?.[0]?.file).toBe('../src/dynamic.ts');
  });
});

describe('renderTerminalReport', () => {
  it('includes change details and removes control characters from untrusted values', () => {
    const report = renderTerminalReport(
      buildEvidenceReport({
        repository: '/workspace/repo',
        providerVersion: 'fixture',
        impact: impact([change({ resource: 'Customer\u001b[31m' })]),
        verification: [],
      }),
    );

    expect(report).toContain('[schema] field_removed Customer [31m.status');
    expect(report).toContain('*bold* | `code` <script>');
    expect(report).not.toContain('\u001b');
  });
});

describe('buildEvidenceReport', () => {
  it('derives the same content hash from the same inputs', () => {
    const input = {
      repository: '/workspace/repo',
      providerVersion: 'fixture',
      impact: impact([change()]),
      verification: [],
    };

    const first = buildEvidenceReport(input);
    const second = buildEvidenceReport(input);

    expect(first.contentSha256).toBe(second.contentSha256);
    expect(first.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toHaveProperty('generatedAt');
  });
});

describe('assertImpactReport', () => {
  it('rejects a JSON object that is not an impact report', () => {
    expect(() => {
      assertImpactReport({}, 'fixture-impact.json');
    }).toThrow(/must include/);
  });

  it('normalizes older reports without a needsHuman array', () => {
    const value: unknown = {
      contentSha256: 'a'.repeat(64),
      root: '/workspace/repo',
      changes: [],
      findings: [],
      unverifiedCallSiteCoverage: [],
    };
    assertImpactReport(value, 'fixture-impact.json');
    expect(Array.isArray((value as { needsHuman: unknown }).needsHuman)).toBe(true);
  });
});
