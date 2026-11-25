import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ChangeDetector } from './change-detector.js';
import type { OpenApiInput } from './structured-diff.js';

describe('ChangeDetector', () => {
  it('reports a removed field as a breaking change', async () => {
    const oldDocument = JSON.parse(
      await readFile(resolve('src/diff/fixtures/stripe-removal.json'), 'utf8'),
    ) as OpenApiInput;
    const newDocument: OpenApiInput = {
      openapi: '3.1.0',
      info: { version: '2025-01-01' },
      components: { schemas: { Customer: { properties: { id: { type: 'string' } } } } },
    };
    const changes = new ChangeDetector().diff({
      oldDocument,
      newDocument,
      oldVersion: '2025-01-01',
      newVersion: '2025-01-01',
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.kind).toBe('field_removed');
    expect(changes[0]?.path).toBe('legacy_name');
  });

  it('detects nested fields, removed enum values, removed parameters, and removed operations', async () => {
    const oldDocument = JSON.parse(
      await readFile(resolve('src/diff/fixtures/operations-old.json'), 'utf8'),
    ) as OpenApiInput;
    const newDocument = JSON.parse(
      await readFile(resolve('src/diff/fixtures/operations-new.json'), 'utf8'),
    ) as OpenApiInput;

    const changes = new ChangeDetector().diff({
      oldDocument,
      newDocument,
      oldVersion: '2025-01-01',
      newVersion: '2025-02-01',
    });

    expect(
      changes.map(({ kind, resource, path, oldValue }) => [kind, resource, path, oldValue]),
    ).toEqual(
      expect.arrayContaining([
        ['field_removed', 'Customer', 'address.postal_code', 'string'],
        ['field_removed', 'Customer', 'items[].legacy_code', 'string'],
        ['field_type_changed', 'Customer', 'id', 'string'],
        ['enum_value_removed', 'Customer', 'status', 'pending'],
        [
          'parameter_removed',
          'get /v1/customers/{id}',
          'query.old_filter',
          expect.stringContaining('old_filter'),
        ],
        [
          'parameter_removed',
          'get /v1/customers/{id}',
          'query.api_version',
          expect.stringContaining('api_version'),
        ],
        ['endpoint_removed', '/v1/charges/{id}', 'delete', 'delete /v1/charges/{id}'],
      ]),
    );
    expect(changes).toHaveLength(7);
  });

  it('reports a removed schema as a schema change rather than an endpoint removal', () => {
    const changes = new ChangeDetector().diff({
      oldDocument: {
        components: { schemas: { Deprecated: { properties: { id: { type: 'string' } } } } },
        paths: {},
      },
      newDocument: { components: { schemas: {} }, paths: {} },
      oldVersion: 'old',
      newVersion: 'new',
    });

    expect(changes).toHaveLength(1);
    expect(changes[0]?.kind).toBe('schema_removed');
    expect(changes[0]?.kind).not.toBe('endpoint_removed');
  });

  it('returns stable change identifiers independent of source timestamps', () => {
    const input = {
      oldDocument: [{ resource: 'Customer', fields: { legacy_name: 'string' } }],
      newDocument: [{ resource: 'Customer', fields: {} }],
      oldVersion: 'old',
      newVersion: 'new',
    };

    const first = new ChangeDetector().diff(input);
    const second = new ChangeDetector().diff(input);

    expect(first.map(({ id }) => id)).toEqual(second.map(({ id }) => id));
  });
});
