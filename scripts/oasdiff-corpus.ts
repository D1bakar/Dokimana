import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChangeDetector } from '../src/diff/change-detector.js';
import type {
  OpenApiInput,
  OpenApiOperationObject,
  OpenApiSchema,
} from '../src/diff/structured-diff.js';

export const OASDIFF_VERSION = '1.41.0';
export const TRIAGED_PAIR_COUNT = 25;
const DOCUMENT_PATH = 'docs/DIVERGENCES.md';

type JsonObject = Record<string, unknown>;
type Mutation = (document: OpenApiInput) => void;

interface CorpusCase {
  id: string;
  label: string;
  assessment: 'aligned' | 'partial' | 'gap' | 'out-of-scope';
  note: string;
  mutate: Mutation;
}

interface CorpusResult {
  id: string;
  label: string;
  oasdiffIds: string[];
  dokimanaKinds: string[];
  assessment?: CorpusCase['assessment'];
  note?: string;
}

const TRIAGE: Readonly<Record<string, { assessment: CorpusCase['assessment']; note: string }>> = {
  'DOKC-001': {
    assessment: 'partial',
    note: 'Both flag removal; oasdiff separates request and required-response surfaces, Dokimana reports field_removed.',
  },
  'DOKC-002': {
    assessment: 'gap',
    note: 'Both see removal only; rename is not identified by either tool.',
  },
  'DOKC-003': { assessment: 'aligned', note: 'Both flag type changes.' },
  'DOKC-004': { assessment: 'aligned', note: 'Both flag requiredness change.' },
  'DOKC-005': {
    assessment: 'gap',
    note: 'oasdiff reports none for an unreferenced schema removal; Dokimana reports schema_removed.',
  },
  'DOKC-006': {
    assessment: 'gap',
    note: 'oasdiff ignores x-expandableFields; Dokimana reports its removal.',
  },
  'DOKC-007': {
    assessment: 'gap',
    note: 'Neither reports the x-expansionResources branch removal.',
  },
  'DOKC-008': { assessment: 'aligned', note: 'Both flag parameter removal.' },
  'DOKC-009': {
    assessment: 'gap',
    note: 'Both see removal only; rename is not identified by either tool.',
  },
  'DOKC-010': { assessment: 'aligned', note: 'Both flag requiredness change.' },
  'DOKC-011': {
    assessment: 'gap',
    note: 'oasdiff reports none for query parameter type change; Dokimana reports parameter_type_changed.',
  },
  'DOKC-012': { assessment: 'aligned', note: 'Both flag enum-value removal.' },
  'DOKC-013': {
    assessment: 'partial',
    note: 'Both flag request body removal; Dokimana also reports removed body fields.',
  },
  'DOKC-014': { assessment: 'aligned', note: 'Both flag response removal.' },
  'DOKC-015': {
    assessment: 'aligned',
    note: 'Both flag operation removal; check IDs differ.',
  },
  'DOKC-016': { assessment: 'aligned', note: 'Both flag webhook removal.' },
  'DOKC-017': { assessment: 'aligned', note: 'Both flag enum-value removal.' },
  'DOKC-018': {
    assessment: 'out-of-scope',
    note: 'Neither reports a breaking change for this additive change.',
  },
  'DOKC-019': {
    assessment: 'out-of-scope',
    note: 'Neither reports a breaking change for this additive change.',
  },
  'DOKC-020': {
    assessment: 'out-of-scope',
    note: 'Neither reports a breaking change for this additive change.',
  },
  'DOKC-021': {
    assessment: 'out-of-scope',
    note: 'Neither reports a breaking change for this additive change.',
  },
  'DOKC-022': {
    assessment: 'out-of-scope',
    note: 'Neither reports a breaking change for this additive change.',
  },
  'DOKC-023': {
    assessment: 'out-of-scope',
    note: 'Neither reports a breaking change for this metadata-only edit.',
  },
  'DOKC-024': {
    assessment: 'out-of-scope',
    note: 'Neither reports a breaking change for this operationId edit.',
  },
  'DOKC-025': {
    assessment: 'out-of-scope',
    note: 'Neither reports a breaking change for this summary edit.',
  },
};

function asObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function schema(document: OpenApiInput, name: string): OpenApiSchema {
  const value = document.components?.schemas?.[name];
  if (!value) throw new Error(`Missing schema ${name}`);
  return value;
}

function properties(value: OpenApiSchema): JsonObject {
  return asObject(value.properties, 'schema.properties');
}

function operation(document: OpenApiInput, route: string, method: string): JsonObject {
  const value = document.paths?.[route]?.[method];
  if (value === undefined) throw new Error(`Missing operation ${method} ${route}`);
  return asObject(value, `operation ${method} ${route}`);
}

function parameterList(value: JsonObject): JsonObject[] {
  if (!Array.isArray(value.parameters)) throw new Error('parameters must be an array');
  return value.parameters.map((entry) => asObject(entry, 'parameter'));
}

function removeField(value: JsonObject, key: string): void {
  Reflect.deleteProperty(value, key);
}

function exampleResponse(): JsonObject {
  return {
    description: 'Example response',
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/Example' } },
    },
  };
}

function requestBody(): JsonObject {
  return {
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/Example' } },
    },
  };
}

function baseDocument(): OpenApiInput {
  return {
    openapi: '3.1.0',
    info: { title: 'OAS diff corpus', version: 'corpus' },
    servers: [{ url: 'https://old.example.invalid' }],
    components: {
      schemas: {
        Example: {
          type: 'object',
          description: 'Synthetic comparison fixture',
          required: ['id', 'status'],
          properties: {
            id: { type: 'string' },
            status: {
              type: 'string',
              description: 'Current status',
              default: 'active',
              example: 'active',
              enum: ['active', 'pending'],
            },
            count: { type: 'integer' },
            nested: { type: 'object', properties: { flag: { type: 'boolean' } } },
            choice: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
            combined: {
              allOf: [
                { type: 'object', properties: { first: { type: 'string' } } },
                { type: 'object', properties: { second: { type: 'string' } } },
              ],
            },
            anyChoice: { anyOf: [{ type: 'string' }, { type: 'integer' }] },
          },
          'x-expandableFields': ['nested'],
          'x-expansionResources': { oneOf: [{ $ref: '#/components/schemas/Related' }] },
        },
        Related: { type: 'object', properties: { id: { type: 'string' } } },
        Unused: { type: 'object', properties: { legacy: { type: 'string' } } },
      },
    },
    paths: {
      '/v1/examples': {
        get: {
          operationId: 'listExamples',
          summary: 'List examples',
          description: 'List synthetic examples',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            {
              name: 'state',
              in: 'query',
              schema: { type: 'string', enum: ['open', 'closed'] },
            },
          ],
          responses: { '200': exampleResponse() },
        },
        post: {
          operationId: 'createExample',
          requestBody: requestBody(),
          responses: { '201': exampleResponse() },
        },
      },
    },
    webhooks: {
      'example.updated': {
        post: {
          operationId: 'exampleUpdated',
          requestBody: requestBody(),
          responses: { '200': exampleResponse() },
        },
      },
    },
  };
}

export const CORPUS: readonly CorpusCase[] = [
  {
    id: 'DOKC-001',
    label: 'schema field removed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      removeField(properties(schema(document, 'Example')), 'status');
    },
  },
  {
    id: 'DOKC-002',
    label: 'schema field renamed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const fields = properties(schema(document, 'Example'));
      const status = fields.status;
      delete fields.status;
      fields.state = status;
    },
  },
  {
    id: 'DOKC-003',
    label: 'schema field type changed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const field = properties(schema(document, 'Example')).status as OpenApiSchema;
      field.type = 'integer';
    },
  },
  {
    id: 'DOKC-004',
    label: 'schema field became required',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const example = schema(document, 'Example');
      example.required = ['id', 'status', 'count'];
    },
  },
  {
    id: 'DOKC-005',
    label: 'unused schema removed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const schemas = asObject(document.components?.schemas ?? {}, 'components.schemas');
      removeField(schemas, 'Unused');
    },
  },
  {
    id: 'DOKC-006',
    label: 'expandable field removed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const example = schema(document, 'Example');
      example['x-expandableFields'] = [];
    },
  },
  {
    id: 'DOKC-007',
    label: 'expansion target removed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const example = schema(document, 'Example');
      example['x-expansionResources'] = { oneOf: [] };
    },
  },
  {
    id: 'DOKC-008',
    label: 'query parameter removed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const get = operation(document, '/v1/examples', 'get');
      get.parameters = parameterList(get).filter((entry) => entry.name !== 'limit');
    },
  },
  {
    id: 'DOKC-009',
    label: 'query parameter renamed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const get = operation(document, '/v1/examples', 'get');
      const parameters = parameterList(get);
      const limit = parameters.find((entry) => entry.name === 'limit');
      if (!limit) throw new Error('Missing limit parameter');
      limit.name = 'offset';
    },
  },
  {
    id: 'DOKC-010',
    label: 'query parameter became required',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const get = operation(document, '/v1/examples', 'get');
      const limit = parameterList(get).find((entry) => entry.name === 'limit');
      if (!limit) throw new Error('Missing limit parameter');
      limit.required = true;
    },
  },
  {
    id: 'DOKC-011',
    label: 'query parameter type changed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const get = operation(document, '/v1/examples', 'get');
      const limit = parameterList(get).find((entry) => entry.name === 'limit');
      if (!limit) throw new Error('Missing limit parameter');
      limit.schema = { type: 'string' };
    },
  },
  {
    id: 'DOKC-012',
    label: 'query parameter enum value removed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const get = operation(document, '/v1/examples', 'get');
      const state = parameterList(get).find((entry) => entry.name === 'state');
      const schemaValue = asObject(state?.schema, 'state.schema');
      schemaValue.enum = ['open'];
    },
  },
  {
    id: 'DOKC-013',
    label: 'request body removed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      removeField(operation(document, '/v1/examples', 'post'), 'requestBody');
    },
  },
  {
    id: 'DOKC-014',
    label: 'response removed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      removeField(operation(document, '/v1/examples', 'get'), 'responses');
    },
  },
  {
    id: 'DOKC-015',
    label: 'endpoint removed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const pathItem = asObject(document.paths?.['/v1/examples'], 'path item');
      removeField(pathItem, 'post');
    },
  },
  {
    id: 'DOKC-016',
    label: 'webhook removed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      removeField(asObject(document.webhooks, 'webhooks'), 'example.updated');
    },
  },
  {
    id: 'DOKC-017',
    label: 'schema enum value removed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const status = properties(schema(document, 'Example')).status as OpenApiSchema;
      status.enum = ['active'];
    },
  },
  {
    id: 'DOKC-018',
    label: 'schema field added',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      properties(schema(document, 'Example')).nickname = { type: 'string' };
    },
  },
  {
    id: 'DOKC-019',
    label: 'query parameter added',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const get = operation(document, '/v1/examples', 'get');
      get.parameters = [
        ...parameterList(get),
        { name: 'cursor', in: 'query', schema: { type: 'string' } },
      ];
    },
  },
  {
    id: 'DOKC-020',
    label: 'response added',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const get = operation(document, '/v1/examples', 'get');
      const responses = asObject(get.responses, 'responses');
      responses['201'] = exampleResponse();
    },
  },
  {
    id: 'DOKC-021',
    label: 'endpoint added',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const pathItem = asObject(document.paths?.['/v1/examples'], 'path item');
      pathItem.put = {
        operationId: 'replaceExample',
        requestBody: requestBody(),
        responses: { '200': exampleResponse() },
      } satisfies OpenApiOperationObject;
    },
  },
  {
    id: 'DOKC-022',
    label: 'webhook added',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      asObject(document.webhooks, 'webhooks')['example.deleted'] = {
        post: {
          operationId: 'exampleDeleted',
          requestBody: requestBody(),
          responses: { '200': exampleResponse() },
        },
      };
    },
  },
  {
    id: 'DOKC-023',
    label: 'description changed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      const info = asObject(document.info, 'info');
      info.description = 'Updated synthetic corpus';
    },
  },
  {
    id: 'DOKC-024',
    label: 'operationId changed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      operation(document, '/v1/examples', 'get').operationId = 'listExamplesV2';
    },
  },
  {
    id: 'DOKC-025',
    label: 'summary changed',
    assessment: 'partial',
    note: 'Triage pending',
    mutate: (document) => {
      operation(document, '/v1/examples', 'get').summary = 'Fetch examples';
    },
  },
  {
    id: 'DOKC-026',
    label: 'nullable added',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      (properties(schema(document, 'Example')).status as OpenApiSchema).nullable = true;
    },
  },
  {
    id: 'DOKC-027',
    label: 'oneOf branch removed',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      const choice = properties(schema(document, 'Example')).choice as OpenApiSchema;
      choice.oneOf = [{ type: 'string' }];
    },
  },
  {
    id: 'DOKC-028',
    label: 'allOf branch removed',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      const combined = properties(schema(document, 'Example')).combined as OpenApiSchema;
      combined.allOf = [{ type: 'object', properties: { first: { type: 'string' } } }];
    },
  },
  {
    id: 'DOKC-029',
    label: 'anyOf branch removed',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      const anyChoice = properties(schema(document, 'Example')).anyChoice as OpenApiSchema;
      anyChoice.anyOf = [{ type: 'string' }];
    },
  },
  {
    id: 'DOKC-030',
    label: 'readOnly added',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      (properties(schema(document, 'Example')).status as OpenApiSchema).readOnly = true;
    },
  },
  {
    id: 'DOKC-031',
    label: 'writeOnly added',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      (properties(schema(document, 'Example')).status as OpenApiSchema).writeOnly = true;
    },
  },
  {
    id: 'DOKC-032',
    label: 'deprecated added',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      (properties(schema(document, 'Example')).status as OpenApiSchema).deprecated = true;
    },
  },
  {
    id: 'DOKC-033',
    label: 'format changed',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      (properties(schema(document, 'Example')).status as OpenApiSchema).format = 'date-time';
    },
  },
  {
    id: 'DOKC-034',
    label: 'pattern added',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      (properties(schema(document, 'Example')).status as OpenApiSchema).pattern = '^active$';
    },
  },
  {
    id: 'DOKC-035',
    label: 'minLength set',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      (properties(schema(document, 'Example')).status as OpenApiSchema).minLength = 1;
    },
  },
  {
    id: 'DOKC-036',
    label: 'maxLength set',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      (properties(schema(document, 'Example')).status as OpenApiSchema).maxLength = 10;
    },
  },
  {
    id: 'DOKC-037',
    label: 'default removed',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      removeField(properties(schema(document, 'Example')).status as JsonObject, 'default');
    },
  },
  {
    id: 'DOKC-038',
    label: 'example removed',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      removeField(properties(schema(document, 'Example')).status as JsonObject, 'example');
    },
  },
  {
    id: 'DOKC-039',
    label: 'additionalProperties allowed',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      schema(document, 'Example').additionalProperties = true;
    },
  },
  {
    id: 'DOKC-040',
    label: 'server URL changed',
    assessment: 'partial',
    note: 'Not triaged',
    mutate: (document) => {
      document.servers = [{ url: 'https://new.example.invalid' }];
    },
  },
];

function markdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function markdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const escaped = rows.map((row) => row.map(markdownCell));
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...escaped.map((row) => row[index]?.length ?? 0)),
  );
  const renderRow = (row: readonly string[]) =>
    `| ${row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join(' | ')} |`;
  return [
    renderRow(headers),
    `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`,
    ...escaped.map(renderRow),
  ].join('\n');
}

function renderDocument(results: readonly CorpusResult[]): string {
  const triaged = results.slice(0, TRIAGED_PAIR_COUNT);
  const pending = results.slice(TRIAGED_PAIR_COUNT);
  return [
    '# oasdiff Divergences',
    '',
    `Generated by \`npm run oasdiff:corpus\`. Do not edit this file manually.`,
    '',
    `Pinned oasdiff version: \`v${OASDIFF_VERSION}\`. The corpus is synthetic and local; the comparison never calls Stripe or fetches remote specifications.`,
    '',
    'Only the first 25 pairs are triaged. The remaining pairs are listed as pending and are not evidence of coverage.',
    '',
    '## Triaged pairs',
    '',
    markdownTable(
      ['Pair', 'Change', 'oasdiff IDs', 'Dokimana kinds', 'Assessment', 'Triage note'],
      triaged.map((result) => [
        result.id,
        result.label,
        result.oasdiffIds.length > 0 ? result.oasdiffIds.join(', ') : 'none',
        result.dokimanaKinds.length > 0 ? result.dokimanaKinds.join(', ') : 'none',
        result.assessment ?? 'unset',
        result.note ?? '',
      ]),
    ),
    '',
    '## Pending pairs',
    '',
    markdownTable(
      ['Pair', 'Change', 'Status'],
      pending.map((result) => [result.id, result.label, 'pending triage']),
    ),
    '',
  ].join('\n');
}

function parseArguments(argv: readonly string[]): { binary: string } {
  let binary = 'oasdiff';
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--oasdiff') {
      const value = argv[index + 1];
      if (value === undefined) throw new Error('--oasdiff requires a path');
      binary = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${String(argv[index])}`);
  }
  return { binary };
}

function assertVersion(binary: string): void {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`Unable to read oasdiff version: ${result.error?.message ?? result.stderr}`);
  }
  const version = result.stdout.trim();
  if (version !== `oasdiff version ${OASDIFF_VERSION}`) {
    throw new Error(`Expected ${OASDIFF_VERSION}, found ${version}`);
  }
}

async function run(): Promise<void> {
  const { binary } = parseArguments(process.argv.slice(2));
  assertVersion(binary);

  const directory = await mkdtemp(join(tmpdir(), 'dokimana-oasdiff-'));
  const detector = new ChangeDetector();
  const results: CorpusResult[] = [];
  try {
    for (const corpusCase of CORPUS) {
      const before = baseDocument();
      const after = JSON.parse(JSON.stringify(before)) as OpenApiInput;
      corpusCase.mutate(after);
      await writeFile(join(directory, 'before.json'), JSON.stringify(before, null, 2));
      await writeFile(join(directory, 'after.json'), JSON.stringify(after, null, 2));

      const comparison = spawnSync(
        binary,
        ['breaking', '-f', 'json', '--', 'before.json', 'after.json'],
        { cwd: directory, encoding: 'utf8' },
      );
      if (comparison.error || comparison.status !== 0) {
        throw new Error(
          `oasdiff failed for ${corpusCase.id}: ${comparison.error?.message ?? comparison.stderr}`,
        );
      }
      const findings: unknown = JSON.parse(comparison.stdout);
      if (!Array.isArray(findings))
        throw new Error(`Unexpected oasdiff output for ${corpusCase.id}`);
      const oasdiffIds = [
        ...new Set(
          findings
            .map((finding) => asObject(finding, 'oasdiff finding').id)
            .filter((id): id is string => typeof id === 'string'),
        ),
      ].sort();
      const changes = detector.diff({
        oldDocument: before,
        newDocument: after,
        oldVersion: 'before',
        newVersion: 'after',
      });
      const dokimanaKinds = [...new Set(changes.map((change) => change.kind))].sort();
      const triage = TRIAGE[corpusCase.id];
      if (results.length < TRIAGED_PAIR_COUNT && triage === undefined) {
        throw new Error(`Missing triage for ${corpusCase.id}`);
      }

      results.push({
        id: corpusCase.id,
        label: corpusCase.label,
        oasdiffIds,
        dokimanaKinds,
        ...(triage === undefined ? {} : triage),
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  await writeFile(DOCUMENT_PATH, renderDocument(results), 'utf8');
  const triagedResults = results.filter((result) => result.assessment !== undefined);
  const aligned = triagedResults.filter((result) => result.assessment === 'aligned').length;
  console.log(
    `Compared ${String(results.length)} pairs with oasdiff v${OASDIFF_VERSION}; wrote ${DOCUMENT_PATH} (${String(aligned)}/${String(triagedResults.length)} aligned).`,
  );
}

await run();
