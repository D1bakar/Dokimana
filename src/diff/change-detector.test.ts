import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ChangeDetector } from './change-detector.js';
import {
  assertOpenApiInput,
  buildOpenApiIndex,
  resolveJsonPointer,
  type OpenApiInput,
  type OpenApiSchema,
} from './structured-diff.js';

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

  it('detects parameters becoming required and changing schema type', async () => {
    const oldDocument = JSON.parse(
      await readFile(resolve('src/diff/fixtures/parameter-changes-old.json'), 'utf8'),
    ) as OpenApiInput;
    const newDocument = JSON.parse(
      await readFile(resolve('src/diff/fixtures/parameter-changes-new.json'), 'utf8'),
    ) as OpenApiInput;

    const changes = new ChangeDetector().diff({
      oldDocument,
      newDocument,
      oldVersion: '2025-01-01',
      newVersion: '2025-02-01',
    });

    expect(
      changes.map(({ kind, resource, path, oldValue, newValue }) => [
        kind,
        resource,
        path,
        oldValue,
        newValue,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [
          'parameter_became_required',
          'get /v1/customers/{id}',
          'query.limit',
          'optional',
          'required',
        ],
        ['parameter_type_changed', 'get /v1/customers/{id}', 'query.limit', 'integer', 'string'],
      ]),
    );
    expect(changes).toHaveLength(2);
  });

  it('detects schema fields that become required, including nested fields', async () => {
    const oldDocument = JSON.parse(
      await readFile(resolve('src/diff/fixtures/schema-required-old.json'), 'utf8'),
    ) as OpenApiInput;
    const newDocument = JSON.parse(
      await readFile(resolve('src/diff/fixtures/schema-required-new.json'), 'utf8'),
    ) as OpenApiInput;

    const changes = new ChangeDetector().diff({
      oldDocument,
      newDocument,
      oldVersion: '2025-01-01',
      newVersion: '2025-02-01',
    });

    expect(
      changes.map(({ kind, resource, path, oldValue, newValue }) => [
        kind,
        resource,
        path,
        oldValue,
        newValue,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['field_became_required', 'Customer', 'address', 'optional', 'required'],
        ['field_became_required', 'Customer', 'address.city', 'optional', 'required'],
      ]),
    );
    expect(changes).toHaveLength(2);
  });

  it('detects removed parameter enum values without flagging removed constraints', async () => {
    const oldDocument = JSON.parse(
      await readFile(resolve('src/diff/fixtures/parameter-enum-old.json'), 'utf8'),
    ) as OpenApiInput;
    const newDocument = JSON.parse(
      await readFile(resolve('src/diff/fixtures/parameter-enum-new.json'), 'utf8'),
    ) as OpenApiInput;

    const changes = new ChangeDetector().diff({
      oldDocument,
      newDocument,
      oldVersion: '2025-01-01',
      newVersion: '2025-02-01',
    });

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: 'parameter_enum_value_removed',
      resource: 'get /v1/customers',
      path: 'query.include',
      oldValue: 'full',
    });
  });

  it('does not flag a removed schema enum constraint as a breaking value removal', () => {
    const changes = new ChangeDetector().diff({
      oldDocument: {
        openapi: '3.1.0',
        info: { version: 'old' },
        components: {
          schemas: { Customer: { properties: { status: { type: 'string', enum: ['open'] } } } },
        },
      },
      newDocument: {
        openapi: '3.1.0',
        info: { version: 'new' },
        components: {
          schemas: { Customer: { properties: { status: { type: 'string' } } } },
        },
      },
      oldVersion: 'old',
      newVersion: 'new',
    });

    expect(changes).toHaveLength(0);
  });

  it('resolves local component schema references when comparing nested fields', async () => {
    const oldDocument = JSON.parse(
      await readFile(resolve('src/diff/fixtures/referenced-old.json'), 'utf8'),
    ) as OpenApiInput;
    const newDocument = JSON.parse(
      await readFile(resolve('src/diff/fixtures/referenced-new.json'), 'utf8'),
    ) as OpenApiInput;

    const changes = new ChangeDetector().diff({
      oldDocument,
      newDocument,
      oldVersion: '2025-01-01',
      newVersion: '2025-02-01',
    });

    expect(changes.map(({ kind, resource, path }) => [kind, resource, path])).toEqual(
      expect.arrayContaining([
        ['field_removed', 'Address', 'legacy_code'],
        ['field_removed', 'Customer', 'billing_address.legacy_code'],
      ]),
    );
    expect(changes).toHaveLength(2);
  });

  it('terminates when local schema references are recursive', () => {
    const recursiveDocument: OpenApiInput = {
      components: {
        schemas: {
          Node: {
            properties: {
              parent: { $ref: '#/components/schemas/Node' },
            },
          },
        },
      },
    };

    expect(() =>
      new ChangeDetector().diff({
        oldDocument: recursiveDocument,
        newDocument: recursiveDocument,
        oldVersion: 'old',
        newVersion: 'new',
      }),
    ).not.toThrow();
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
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe('assertOpenApiInput', () => {
  it('rejects an empty JSON object instead of treating it as an empty contract', () => {
    expect(() => assertOpenApiInput({}, 'old.json')).toThrow(/old.json must include/);
  });

  it('accepts the shape used by the synthetic fixtures', () => {
    expect(() =>
      assertOpenApiInput(
        { openapi: '3.1.0', info: { version: 'fixture' }, components: { schemas: {} } },
        'old.json',
      ),
    ).not.toThrow();
  });
});

async function readRealFixture(name: 'stripe-real-old.json' | 'stripe-real-new.json') {
  const value: unknown = JSON.parse(await readFile(resolve('src/diff/fixtures', name), 'utf8'));
  assertOpenApiInput(value, name);
  return value;
}

describe('real Stripe spec excerpts', () => {
  it('diffs schema, parameter, request body, response, and webhook contexts separately', async () => {
    const [oldDocument, newDocument] = await Promise.all([
      readRealFixture('stripe-real-old.json'),
      readRealFixture('stripe-real-new.json'),
    ]);
    const changes = new ChangeDetector().diff({
      oldDocument,
      newDocument,
      oldVersion: '2025-03-31.stripe-real-old',
      newVersion: '2026-03-31.stripe-real-new',
    });

    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          context: 'schema',
          kind: 'field_removed',
          resource: 'Customer',
          path: 'phone',
        }),
        expect.objectContaining({
          context: 'schema',
          kind: 'field_type_changed',
          resource: 'Customer',
          path: 'balance',
          oldValue: 'integer',
          newValue: 'string',
        }),
        expect.objectContaining({
          context: 'schema',
          kind: 'field_became_required',
          resource: 'Customer',
          path: 'email',
        }),
        expect.objectContaining({
          context: 'request_parameter',
          kind: 'parameter_type_changed',
          resource: 'GetCustomersCustomer',
          path: 'query.expand',
          oldValue: 'array<string>',
          newValue: 'string',
        }),
        expect.objectContaining({
          context: 'request_body',
          kind: 'enum_value_removed',
          resource: 'PostCustomers',
          path: 'tax_exempt',
          oldValue: 'reverse',
        }),
        expect.objectContaining({
          context: 'response',
          kind: 'field_removed',
          resource: 'GetCustomersCustomer 200',
          path: 'account_balance',
        }),
        expect.objectContaining({
          context: 'webhook_event',
          kind: 'field_removed',
          resource: 'customer.created',
          path: 'data.previous_attributes',
        }),
      ]),
    );
    expect(new Set(changes.map((change) => change.context))).toEqual(
      new Set(['schema', 'request_parameter', 'request_body', 'response', 'webhook_event']),
    );
    for (const change of changes) expect(change.evidence).toContain(change.context ?? '');
  });

  it('indexes real-shape operations by operationId and route', async () => {
    const document = await readRealFixture('stripe-real-old.json');
    const index = buildOpenApiIndex(document);

    expect(index.operationsById.get('GetCustomersCustomer')?.route).toBe(
      '/v1/customers/{customer}',
    );
    expect(index.operationsByPath.get('/v1/customers/{customer}')?.get('get')?.operationId).toBe(
      'GetCustomersCustomer',
    );
    expect(index.webhooksByEvent.get('customer.created')?.get('post')?.operationId).toBe(
      'CustomerCreatedWebhook',
    );
  });

  it('represents nullable, expandable, anyOf, and additionalProperties fields', async () => {
    const document = await readRealFixture('stripe-real-old.json');
    const customer = buildOpenApiIndex(document).schemas.get('Customer');

    expect(customer?.get('default_source')?.expandable).toBe(true);
    expect(customer?.get('default_source')?.type).toContain('null');
    expect(customer?.get('default_source')?.type).toContain('ref:#/components/schemas/Card');
    expect(customer?.get('address')?.type).toContain('ref:#/components/schemas/Address');
    expect(customer?.get('metadata')?.type).toBe('map<string>');
    expect(customer?.get('preferred_locales')?.type).toContain('array<string>');
  });
});

describe('JSON Pointer resolution', () => {
  it('resolves escaped nested pointers across component collections', () => {
    const document: OpenApiInput = {
      openapi: '3.1.0',
      info: { version: 'fixture' },
      components: {
        schemas: {
          'A/B': {
            type: 'object',
            properties: { nested: { type: 'object', properties: { legacy_code: { type: 'string' } } } },
          },
          Root: { $ref: '#/components/schemas/A~1B' },
        },
        parameters: {
          expand: { name: 'expand', in: 'query', schema: { type: 'string' } },
        },
      },
    };

    expect(resolveJsonPointer(document, '#/components/schemas/A~1B')).toBe(
      document.components?.schemas?.['A/B'],
    );
    expect(buildOpenApiIndex(document).schemas.get('Root')?.has('nested.legacy_code')).toBe(true);
  });

  it('terminates on circular refs and reports removed expandable fields', () => {
    const sharedSchema: OpenApiSchema = {
      type: 'object',
      properties: {
        self: { $ref: '#/components/schemas/Node' },
        value: { type: 'string' },
      },
      'x-expandableFields': ['self'],
    };
    const oldDocument: OpenApiInput = {
      openapi: '3.1.0',
      info: { version: 'old' },
      components: { schemas: { Node: sharedSchema } },
    };
    const newDocument: OpenApiInput = {
      openapi: '3.1.0',
      info: { version: 'new' },
      components: {
        schemas: {
          Node: { ...sharedSchema, 'x-expandableFields': [] },
        },
      },
    };

    const changes = new ChangeDetector().diff({
      oldDocument,
      newDocument,
      oldVersion: 'old',
      newVersion: 'new',
    });

    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          context: 'schema',
          kind: 'expandable_field_removed',
          resource: 'Node',
          path: 'self',
        }),
      ]),
    );
    expect(changes.some((change) => change.kind === 'field_removed')).toBe(false);
  });
});
