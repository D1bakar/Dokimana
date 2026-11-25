import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { FixGenerator } from './fix-generator.js';
import type { ChangeRecord, ImpactFinding, ProviderSource } from '../domain/types.js';

describe('FixGenerator', () => {
  it('returns needs_human for a removed field', async () => {
    const source: ProviderSource = {
      kind: 'openapi',
      provider: 'stripe',
      version: 'fixture',
      fetchedAt: '2026-01-01T00:00:00.000Z',
      checksumSha256: 'fixture',
    };
    const change: ChangeRecord = {
      id: 'removed',
      provider: 'stripe',
      kind: 'field_removed',
      resource: 'Customer',
      path: 'legacy_name',
      oldValue: 'string',
      breaking: true,
      source,
      evidence: 'fixture',
    };
    const finding: ImpactFinding = {
      changeId: change.id,
      callSite: {
        file: resolve('src/fixes/fixtures/removed-field.ts'),
        line: 5,
        column: 50,
        operation: 'update',
        fieldPath: ['legacy_name'],
        kind: 'sdk_call',
        snippet: "{ legacy_name: 'Ada' }",
      },
      confidence: 'high',
      reason: 'fixture',
    };
    const patch = await new FixGenerator().generate(change, finding);
    expect(patch.status).toBe('needs_human');
  });

  it('can make an explicit field rename patch', async () => {
    const source: ProviderSource = {
      kind: 'openapi',
      provider: 'stripe',
      version: 'fixture',
      fetchedAt: '2026-01-01T00:00:00.000Z',
      checksumSha256: 'fixture',
    };
    const change: ChangeRecord = {
      id: 'renamed',
      provider: 'stripe',
      kind: 'field_renamed',
      resource: 'Customer',
      path: 'legacy_name',
      oldValue: 'legacy_name',
      newValue: 'name',
      breaking: true,
      source,
      evidence: 'fixture',
    };
    const finding: ImpactFinding = {
      changeId: change.id,
      callSite: {
        file: resolve('src/fixes/fixtures/renamed-field.ts'),
        line: 5,
        column: 50,
        operation: 'update',
        fieldPath: ['legacy_name'],
        kind: 'sdk_call',
        snippet: "{ legacy_name: 'Ada' }",
      },
      confidence: 'high',
      reason: 'fixture',
    };
    const patch = await new FixGenerator().generate(change, finding);
    expect(patch.status).toBe('ready');
    expect(patch.replacement).toContain('name');
  });
});
