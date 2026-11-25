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
});
