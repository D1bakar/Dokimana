import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildOpenApiIndex,
  canonicalize,
  checksum,
  type OpenApiInput,
} from './diff/structured-diff.js';
import { buildOpenApiIr, serializeIr } from './diff/ir.js';
import type { ChangeRecord, EvidenceReport, UnresolvedItem } from './domain/types.js';
import { renderMarkdownReport } from './reporter/reporter.js';
import { toPosixPath } from './util/paths.js';

const PROPERTY_PARAMETERS = { numRuns: 200, seed: 0x444f4b49 } as const;
const HOSTILE_MARKER = '<script>alert(1)</script>';

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, nested]) => [key, reverseObjectKeys(nested)]),
    );
  }
  return value;
}

const nameArb = fc.string({ minLength: 1, maxLength: 12 }).map((value) => `k_${value}`);

const schemaArb = fc.record({
  type: fc.constant('object'),
  properties: fc.dictionary(
    nameArb,
    fc.record({
      type: fc.constantFrom('string', 'integer', 'boolean'),
      enum: fc.array(fc.oneof(fc.string({ maxLength: 5 }), fc.integer()), { maxLength: 3 }),
    }),
  ),
  required: fc.array(nameArb, { maxLength: 3 }),
  'x-expandableFields': fc.array(nameArb, { maxLength: 3 }),
});

const documentArb: fc.Arbitrary<OpenApiInput> = fc.record({
  openapi: fc.constant('3.1.0'),
  info: fc.record({ version: fc.constant('fixture') }),
  components: fc.record({ schemas: fc.dictionary(nameArb, schemaArb) }),
  paths: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 12 }).map((route) => `/v1/${route}`),
    fc.record({ get: fc.constant({}), post: fc.constant({}) }),
  ),
  webhooks: fc.dictionary(nameArb, fc.record({ post: fc.constant({}) })),
});

const hostileStringArb = fc
  .tuple(
    fc.string({ maxLength: 20, unit: fc.constantFrom('a', 'b', ' ', '|', '\n', '`', '*') }),
    fc.string({ maxLength: 20, unit: fc.constantFrom('a', 'b', ' ', '|', '\n', '`', '*') }),
  )
  .map(([prefix, suffix]) => `${prefix}${HOSTILE_MARKER}${suffix}`);

describe('property-based invariants', () => {
  it('produces the same checksum and IR regardless of object key order', () => {
    fc.assert(
      fc.property(documentArb, (document) => {
        const reordered = reverseObjectKeys(document);
        expect(reordered).not.toBe(document);

        const originalIr = buildOpenApiIr(buildOpenApiIndex(document), 'before', 'fixture');
        const reorderedIr = buildOpenApiIr(
          buildOpenApiIndex(reordered as OpenApiInput),
          'before',
          'fixture',
        );

        expect(checksum(reordered)).toBe(checksum(document));
        expect(JSON.stringify(canonicalize(reordered))).toBe(
          JSON.stringify(canonicalize(document)),
        );
        expect(serializeIr(reorderedIr)).toEqual(serializeIr(originalIr));
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it('normalizes every generated path to an idempotent POSIX form', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const normalized = toPosixPath(value);

        expect(normalized).not.toContain('\\');
        expect(toPosixPath(normalized)).toBe(normalized);
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it('escapes hostile strings in every rendered report surface', () => {
    fc.assert(
      fc.property(hostileStringArb, (hostile) => {
        const change: ChangeRecord = {
          id: 'change_property',
          provider: 'stripe',
          kind: 'field_removed',
          context: 'schema',
          resource: hostile,
          path: hostile,
          oldValue: hostile,
          newValue: hostile,
          breaking: true,
          source: {
            kind: 'openapi',
            provider: 'stripe',
            version: hostile,
            checksumSha256: 'fixture',
          },
          evidence: hostile,
        };
        const unresolved: UnresolvedItem = {
          file: hostile,
          line: 1,
          column: 1,
          kind: 'dynamic_call',
          snippet: hostile,
          reason: hostile,
          relatedChangeIds: [change.id],
        };
        const report: EvidenceReport = {
          contentSha256: 'a'.repeat(64),
          repository: hostile,
          providerVersion: hostile,
          impactAnalysis: 'static_evidence',
          changes: [change],
          findings: [],
          needsHuman: [
            {
              changeId: change.id,
              kind: change.kind,
              ...(change.context === undefined ? {} : { context: change.context }),
              resource: hostile,
              path: hostile,
              reason: hostile,
            },
          ],
          unresolved: [unresolved],
          verification: [
            {
              scenarioId: hostile,
              classification: 'could_not_run',
              reason: hostile,
              container: { isolated: true, network: 'none', secrets: 'none' },
            },
          ],
          limitations: [hostile],
        };

        const markdown = renderMarkdownReport(report);

        expect(markdown).not.toContain(HOSTILE_MARKER);
        expect(markdown).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
