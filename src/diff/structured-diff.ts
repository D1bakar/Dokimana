import { createHash } from 'node:crypto';
import type { ChangeRecord } from '../domain/types.js';

export type JsonRecord = Record<string, unknown>;

export interface OpenApiInfo extends JsonRecord {
  version?: string;
  title?: string;
}

export interface OpenApiSchema extends JsonRecord {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  enum?: unknown[];
  allOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  nullable?: boolean;
  additionalProperties?: boolean | OpenApiSchema;
  'x-expandableFields'?: string[];
  'x-expansionResources'?: OpenApiExpansionResources;
}

export interface OpenApiExpansionResources extends JsonRecord {
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
}

export interface OpenApiParameterObject extends JsonRecord {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: OpenApiSchema;
  $ref?: string;
}

export interface OpenApiRequestBodyObject extends JsonRecord {
  content?: Record<string, unknown>;
  required?: boolean;
  $ref?: string;
}

export interface OpenApiResponseObject extends JsonRecord {
  content?: Record<string, unknown>;
  $ref?: string;
}

export interface OpenApiOperationObject extends JsonRecord {
  operationId?: string;
  parameters?: OpenApiParameterObject[];
  requestBody?: OpenApiRequestBodyObject;
  responses?: Record<string, OpenApiResponseObject>;
}

export interface OpenApiPathItem extends JsonRecord {
  parameters?: OpenApiParameterObject[];
}

export interface OpenApiComponents extends JsonRecord {
  schemas?: Record<string, OpenApiSchema>;
  parameters?: Record<string, OpenApiParameterObject>;
  requestBodies?: Record<string, OpenApiRequestBodyObject>;
  responses?: Record<string, OpenApiResponseObject>;
}

export interface OpenApiInput extends JsonRecord {
  openapi?: string;
  info?: OpenApiInfo;
  components?: OpenApiComponents;
  paths?: Record<string, OpenApiPathItem>;
  webhooks?: Record<string, OpenApiPathItem>;
}

export interface SchemaField {
  type: string;
  required: boolean;
  enumValues?: unknown[];
  expandable: boolean;
}

export interface OpenApiParameter {
  serialized: string;
  required: boolean;
  schemaType?: string;
  enumValues?: unknown[];
}

export interface IndexedOperation {
  key: string;
  operationId?: string;
  route: string;
  method: string;
  source: 'path' | 'webhook';
  parameters: Map<string, OpenApiParameter>;
  hasRequestBody: boolean;
  requestBodyFields: Map<string, SchemaField>;
  responses: Map<string, Map<string, SchemaField>>;
}

export interface OpenApiIndex {
  document: OpenApiInput;
  schemas: Map<string, Map<string, SchemaField>>;
  expandableFields: Map<string, string[]>;
  operationsById: Map<string, IndexedOperation>;
  operationsByPath: Map<string, Map<string, IndexedOperation>>;
  webhooksByEvent: Map<string, Map<string, IndexedOperation>>;
  checksumSha256: string;
}

export interface FieldSnapshot {
  resource: string;
  fields: Record<string, string>;
}

const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asSchema(value: unknown): OpenApiSchema | undefined {
  return isRecord(value) ? value : undefined;
}

function asSchemaArray(value: unknown): OpenApiSchema[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: OpenApiSchema[] = [];
  for (const entry of value) {
    const schema = asSchema(entry);
    if (schema) result.push(schema);
  }
  return result;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') result.push(entry);
  }
  return result;
}

function validateRecord(value: unknown, label: string): asserts value is JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);
}

export function assertOpenApiInput(
  value: unknown,
  label: string,
): asserts value is OpenApiInput {
  validateRecord(value, label);
  if (typeof value.openapi !== 'string' || value.openapi.length === 0) {
    throw new Error(`${label} must include a non-empty "openapi" version string.`);
  }
  validateRecord(value.info, `${label}.info`);
  if (typeof value.info.version !== 'string' || value.info.version.length === 0) {
    throw new Error(`${label} must include info.version as a non-empty string.`);
  }
  if (value.components !== undefined) {
    validateRecord(value.components, `${label}.components`);
    for (const field of ['schemas', 'parameters', 'requestBodies', 'responses'] as const) {
      if (value.components[field] !== undefined) {
        validateRecord(value.components[field], `${label}.components.${field}`);
      }
    }
  }
  for (const field of ['paths', 'webhooks'] as const) {
    if (value[field] === undefined) continue;
    validateRecord(value[field], `${label}.${field}`);
    for (const [route, item] of Object.entries(value[field])) {
      validateRecord(item, `${label}.${field}.${route}`);
    }
  }
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function serializeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  return JSON.stringify(canonicalize(value)) ?? String(value);
}

export function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function decodePointerToken(token: string): string {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

export function resolveJsonPointer(root: unknown, pointer: string): unknown | undefined {
  if (pointer === '' || pointer === '#') return root;
  if (!pointer.startsWith('#/')) return undefined;

  const fragment = pointer.slice(1);
  let decoded: string;
  try {
    decoded = decodeURIComponent(fragment);
  } catch {
    return undefined;
  }

  let current = root;
  for (const token of decoded.split('/').slice(1).map(decodePointerToken)) {
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
    } else if (isRecord(current)) {
      current = current[token];
    } else {
      return undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

export function resolveOpenApiRef(root: unknown, reference: string): unknown | undefined {
  if (!reference.startsWith('#')) return undefined;
  return resolveJsonPointer(root, reference);
}

interface ResolvedSchema {
  schema: OpenApiSchema;
  seenRefs: Set<string>;
}

function resolveSchema(
  schema: OpenApiSchema,
  document: OpenApiInput,
  seenRefs: ReadonlySet<string>,
): ResolvedSchema | undefined {
  const seen = new Set(seenRefs);
  let current = schema;
  while (typeof current.$ref === 'string') {
    const reference = current.$ref;
    if (seen.has(reference)) return undefined;
    seen.add(reference);
    const next = asSchema(resolveOpenApiRef(document, reference));
    if (!next) return undefined;
    current = next;
  }
  return { schema: current, seenRefs: seen };
}

function compositionBranches(schema: OpenApiSchema, document: OpenApiInput): OpenApiSchema[] {
  const candidates: unknown[] = [];
  for (const field of ['allOf', 'anyOf', 'oneOf'] as const) {
    if (schema[field] !== undefined) candidates.push(schema[field]);
  }
  const expansion = asSchema(schema['x-expansionResources']);
  if (expansion) {
    for (const field of ['allOf', 'anyOf', 'oneOf'] as const) {
      if (expansion[field] !== undefined) candidates.push(expansion[field]);
    }
  }

  const branches: OpenApiSchema[] = [];
  for (const candidate of candidates) {
    const values = asSchemaArray(candidate) ?? [];
    for (const value of values) {
      const resolved = resolveSchema(value, document, new Set());
      if (resolved) branches.push(resolved.schema);
    }
  }
  return branches;
}

function schemaTypes(
  schema: OpenApiSchema,
  document: OpenApiInput,
  seenRefs: ReadonlySet<string>,
): Set<string> {
  const types = new Set<string>();
  if (typeof schema.$ref === 'string') types.add(`ref:${schema.$ref}`);

  if (typeof schema.type === 'string') {
    types.add(schema.type);
  } else if (Array.isArray(schema.type)) {
    for (const type of schema.type) {
      if (typeof type === 'string') types.add(type);
    }
  }
  if (schema.nullable === true) types.add('null');

  if (schema.items) {
    const nested = schemaTypes(schema.items, document, seenRefs);
    types.add(`array<${[...nested].sort().join('|') || 'unknown'}>`);
  }
  if (isRecord(schema.additionalProperties)) {
    const nested = schemaTypes(schema.additionalProperties, document, seenRefs);
    types.add(`map<${[...nested].sort().join('|') || 'unknown'}>`);
  } else if (schema.additionalProperties === true) {
    types.add('map<unknown>');
  }
  if (schema.properties && types.size === 0) types.add('object');

  for (const branch of compositionBranches(schema, document)) {
    const branchRefs = typeof branch.$ref === 'string' ? [branch.$ref] : [];
    if (branchRefs.some((reference) => seenRefs.has(reference))) continue;
    for (const type of schemaTypes(branch, document, new Set([...seenRefs, ...branchRefs]))) {
      types.add(type);
    }
  }

  return types.size > 0 ? types : new Set(['unknown']);
}

function enumValues(
  schema: OpenApiSchema,
  document: OpenApiInput,
  seenRefs: ReadonlySet<string>,
): unknown[] {
  const seen = new Set<string>();
  const values: unknown[] = [];
  const add = (value: unknown): void => {
    const key = serializeValue(value);
    if (seen.has(key)) return;
    seen.add(key);
    values.push(value);
  };

  for (const value of schema.enum ?? []) add(value);
  for (const branch of compositionBranches(schema, document)) {
    const branchRefs = typeof branch.$ref === 'string' ? [branch.$ref] : [];
    if (branchRefs.some((reference) => seenRefs.has(reference))) continue;
    for (const value of enumValues(branch, document, new Set([...seenRefs, ...branchRefs]))) {
      add(value);
    }
  }
  return values;
}

function describeField(
  schema: OpenApiSchema,
  document: OpenApiInput,
  expandable: boolean,
  seenRefs: ReadonlySet<string>,
  required: boolean,
): SchemaField {
  const type = [...schemaTypes(schema, document, seenRefs)].sort().join('|');
  const values = enumValues(schema, document, seenRefs);
  return {
    type,
    required,
    expandable,
    ...(values.length > 0 ? { enumValues: values } : {}),
  };
}

function visitChildren(
  schema: OpenApiSchema,
  document: OpenApiInput,
  prefix: string,
  requiredNames: ReadonlySet<string>,
  expandableNames: ReadonlySet<string>,
  seenRefs: ReadonlySet<string>,
  fields: Map<string, SchemaField>,
): void {
  const resolved = resolveSchema(schema, document, seenRefs);
  if (!resolved) return;
  const current = resolved.schema;
  const required = new Set([...requiredNames, ...(current.required ?? [])]);
  const expandable = new Set([
    ...expandableNames,
    ...(stringArray(current['x-expandableFields']) ?? []),
  ]);

  for (const [name, property] of Object.entries(current.properties ?? {})) {
    const child = asSchema(property);
    if (!child) continue;
    visit(
      child,
      document,
      prefix ? `${prefix}.${name}` : name,
      name,
      required.has(name),
      expandable,
      resolved.seenRefs,
      fields,
    );
  }

  if (current.items) {
    visit(
      current.items,
      document,
      `${prefix}[]`,
      '',
      false,
      new Set(),
      resolved.seenRefs,
      fields,
    );
  }
  if (isRecord(current.additionalProperties)) {
    visit(
      current.additionalProperties,
      document,
      `${prefix}.*`,
      '',
      false,
      new Set(),
      resolved.seenRefs,
      fields,
    );
  }

  for (const branch of compositionBranches(current, document)) {
    visitChildren(branch, document, prefix, required, expandable, resolved.seenRefs, fields);
  }
}

function visit(
  schema: OpenApiSchema,
  document: OpenApiInput,
  path: string,
  fieldName: string,
  required: boolean,
  expandableNames: ReadonlySet<string>,
  seenRefs: ReadonlySet<string>,
  fields: Map<string, SchemaField>,
): void {
  const expandable =
    expandableNames.has(fieldName) || asSchema(schema['x-expansionResources']) !== undefined;
  fields.set(path, describeField(schema, document, expandable, seenRefs, required));
  visitChildren(
    schema,
    document,
    path,
    new Set(schema.required ?? []),
    new Set(),
    seenRefs,
    fields,
  );
}

export function schemaFields(schema: OpenApiSchema, document: OpenApiInput): Map<string, SchemaField> {
  const fields = new Map<string, SchemaField>();
  visitChildren(schema, document, '', new Set(), new Set(), new Set(), fields);
  return fields;
}

function parameterObject(
  value: unknown,
  document: OpenApiInput,
): OpenApiParameterObject | undefined {
  const seen = new Set<string>();
  let current = value;
  while (isRecord(current) && typeof current.$ref === 'string') {
    const reference = current.$ref;
    if (seen.has(reference)) return undefined;
    seen.add(reference);
    const next = resolveOpenApiRef(document, reference);
    if (!isRecord(next)) return undefined;
    current = next;
  }
  return isRecord(current) ? current : undefined;
}

function parameterMap(
  sources: Record<string, unknown>[],
  document: OpenApiInput,
): Map<string, OpenApiParameter> {
  const result = new Map<string, OpenApiParameter>();
  for (const source of sources) {
    const parameters = Array.isArray(source.parameters) ? source.parameters : [];
    for (const value of parameters) {
      const parameter = parameterObject(value, document);
      if (!parameter || typeof parameter.name !== 'string' || typeof parameter.in !== 'string') {
        continue;
      }
      const schema = asSchema(parameter.schema);
      const schemaType = schema
        ? [...schemaTypes(schema, document, new Set())].sort().join('|')
        : undefined;
      const values = schema ? enumValues(schema, document, new Set()) : [];
      const details: OpenApiParameter = {
        serialized: serializeValue({
          name: parameter.name,
          in: parameter.in,
          required: parameter.in === 'path' || parameter.required === true,
          ...(schemaType === undefined ? {} : { schemaType }),
          ...(values.length > 0 ? { enumValues: values } : {}),
        }),
        required: parameter.in === 'path' || parameter.required === true,
        ...(schemaType === undefined ? {} : { schemaType }),
        ...(values.length > 0 ? { enumValues: values } : {}),
      };
      result.set(`${parameter.in}.${parameter.name}`, details);
    }
  }
  return result;
}

function jsonSchema(value: unknown, document: OpenApiInput): OpenApiSchema | undefined {
  const seen = new Set<string>();
  let current = value;
  while (isRecord(current) && typeof current.$ref === 'string') {
    const reference = current.$ref;
    if (seen.has(reference)) return undefined;
    seen.add(reference);
    const next = resolveOpenApiRef(document, reference);
    if (!isRecord(next)) return undefined;
    current = next;
  }
  if (!isRecord(current) || !isRecord(current.content)) return undefined;
  const contentTypes = Object.keys(current.content).sort();
  const contentType =
    contentTypes.find((type) => type === 'application/json') ??
    contentTypes.find((type) => type.endsWith('+json')) ??
    contentTypes[0];
  if (contentType === undefined) return undefined;
  return asSchema(isRecord(current.content[contentType]) ? current.content[contentType].schema : undefined);
}

function indexedOperations(
  entries: Record<string, OpenApiPathItem> | undefined,
  source: 'path' | 'webhook',
  document: OpenApiInput,
): IndexedOperation[] {
  const operations: IndexedOperation[] = [];
  for (const [route, pathItem] of Object.entries(entries ?? {})) {
    for (const [method, value] of Object.entries(pathItem)) {
      if (!httpMethods.has(method.toLowerCase()) || !isRecord(value)) continue;
      const operation: OpenApiOperationObject = value;
      const operationId = typeof operation.operationId === 'string' ? operation.operationId : undefined;
      const normalizedMethod = method.toLowerCase();
      const responses = new Map<string, Map<string, SchemaField>>();
      for (const status of Object.keys(operation.responses ?? {}).sort()) {
        const schema = jsonSchema(operation.responses?.[status], document);
        responses.set(status, schema ? schemaFields(schema, document) : new Map());
      }
      const requestSchema = jsonSchema(operation.requestBody, document);
      operations.push({
        key: operationId ?? `${normalizedMethod} ${route}`,
        ...(operationId === undefined ? {} : { operationId }),
        route,
        method: normalizedMethod,
        source,
        parameters: parameterMap([pathItem, operation], document),
        hasRequestBody: operation.requestBody !== undefined,
        requestBodyFields: requestSchema ? schemaFields(requestSchema, document) : new Map(),
        responses,
      });
    }
  }
  return operations.sort(
    (left, right) =>
      left.route.localeCompare(right.route) || left.method.localeCompare(right.method),
  );
}

export function buildOpenApiIndex(document: OpenApiInput): OpenApiIndex {
  const schemas = new Map<string, Map<string, SchemaField>>();
  const expandableFields = new Map<string, string[]>();
  for (const [name, schema] of Object.entries(document.components?.schemas ?? {})) {
    schemas.set(name, schemaFields(schema, document));
    const expandable = stringArray(schema['x-expandableFields']);
    if (expandable) expandableFields.set(name, expandable);
  }

  const operationsById = new Map<string, IndexedOperation>();
  const operationsByPath = new Map<string, Map<string, IndexedOperation>>();
  const webhooksByEvent = new Map<string, Map<string, IndexedOperation>>();
  for (const operation of indexedOperations(document.paths, 'path', document)) {
    if (operation.operationId) operationsById.set(operation.operationId, operation);
    const methods = operationsByPath.get(operation.route) ?? new Map<string, IndexedOperation>();
    methods.set(operation.method, operation);
    operationsByPath.set(operation.route, methods);
  }
  for (const operation of indexedOperations(document.webhooks, 'webhook', document)) {
    const methods = webhooksByEvent.get(operation.route) ?? new Map<string, IndexedOperation>();
    methods.set(operation.method, operation);
    webhooksByEvent.set(operation.route, methods);
    if (operation.operationId) operationsById.set(operation.operationId, operation);
  }

  return {
    document,
    schemas,
    expandableFields,
    operationsById,
    operationsByPath,
    webhooksByEvent,
    checksumSha256: checksum(document),
  };
}

export function structuredChangeId(change: Omit<ChangeRecord, 'id'>): string {
  const identity = [
    change.provider,
    change.context ?? '',
    change.resource,
    change.kind,
    change.path ?? '',
    change.operation ?? '',
    change.eventType ?? '',
    change.oldValue,
    change.newValue ?? '',
  ].join(':');
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `change_${(hash >>> 0).toString(16)}`;
}
