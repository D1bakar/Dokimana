import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChangeDetector } from './change-detector.js';
import { buildDirectionalIr, buildOpenApiIr, serializeIr } from './ir.js';
import { assertOpenApiInput, buildOpenApiIndex, type OpenApiInput } from './structured-diff.js';

async function readFixture(name: 'operations-old.json' | 'operations-new.json') {
  const value: unknown = JSON.parse(await readFile(resolve('src/diff/fixtures', name), 'utf8'));
  assertOpenApiInput(value, name);
  return value;
}

function smallDocument(reverseKeys: boolean): OpenApiInput {
  const properties = {
    alpha: { type: 'string', enum: ['b', 'a'] },
    beta: { type: 'integer' },
  };
  return {
    openapi: '3.1.0',
    info: { version: 'fixture' },
    components: {
      schemas: {
        Customer: {
          type: 'object',
          properties: reverseKeys ? { beta: properties.beta, alpha: properties.alpha } : properties,
        },
      },
    },
  };
}

describe('normalized OpenAPI IR', () => {
  it('labels before and after sides and preserves source checksums', async () => {
    const oldIndex = buildOpenApiIndex(await readFixture('operations-old.json'));
    const newIndex = buildOpenApiIndex(await readFixture('operations-new.json'));
    const ir = buildDirectionalIr(oldIndex, newIndex, '2025-01-01', '2025-02-01');

    expect(ir.before.direction).toBe('before');
    expect(ir.after.direction).toBe('after');
    expect(ir.before.version).toBe('2025-01-01');
    expect(ir.after.version).toBe('2025-02-01');
    expect(ir.before.checksumSha256).toBe(oldIndex.checksumSha256);
    expect(ir.after.checksumSha256).toBe(newIndex.checksumSha256);
    expect(ir.before.checksumSha256).not.toBe(ir.after.checksumSha256);
  });

  it('gives operations stable ids and direction-neutral labels', async () => {
    const ir = buildOpenApiIr(
      buildOpenApiIndex(await readFixture('operations-old.json')),
      'before',
      '2025-01-01',
    );

    expect([...ir.operations.keys()]).toEqual([
      'delete /v1/charges/{id}',
      'get /v1/customers/{id}',
    ]);
    expect(ir.operations.get('get /v1/customers/{id}')?.label).toBe('GET /v1/customers/{id}');
    expect(ir.operations.get('delete /v1/charges/{id}')?.method).toBe('delete');
  });

  it('serializes identically when schema keys are reordered', () => {
    const before = serializeIr(
      buildOpenApiIr(buildOpenApiIndex(smallDocument(false)), 'before', 'fixture'),
    );
    const reordered = serializeIr(
      buildOpenApiIr(buildOpenApiIndex(smallDocument(true)), 'before', 'fixture'),
    );

    expect(reordered).toEqual(before);
  });

  it('drives the change detector through the directional IR', async () => {
    const ir = buildDirectionalIr(
      buildOpenApiIndex(await readFixture('operations-old.json')),
      buildOpenApiIndex(await readFixture('operations-new.json')),
      '2025-01-01',
      '2025-02-01',
    );

    const changes = new ChangeDetector().diffIr({ ir });

    expect(changes.map((change) => [change.kind, change.resource, change.path])).toEqual(
      expect.arrayContaining([
        ['field_removed', 'Customer', 'address.postal_code'],
        ['field_removed', 'Customer', 'items[].legacy_code'],
        ['endpoint_removed', '/v1/charges/{id}', 'delete'],
      ]),
    );
  });
});
