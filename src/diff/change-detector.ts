import { createHash } from 'node:crypto';
import type { ChangeKind, ChangeRecord, ProviderSource } from '../domain/types.js';
import { structuredChangeId } from './structured-diff.js';
import type { FieldSnapshot, OpenApiInput, OpenApiSchema } from './structured-diff.js';

const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

export interface ProviderFetcher {
  fetchOpenApi(provider: 'stripe', version: string): Promise<OpenApiInput>;
  fetchChangelog(provider: 'stripe', version: string): Promise<unknown>;
}

export interface ChangeDetectorInput {
  oldDocument: OpenApiInput | FieldSnapshot[];
  newDocument: OpenApiInput | FieldSnapshot[];
  oldVersion: string;
  newVersion: string;
  sourceKind?: 'openapi' | 'changelog';
}

interface SchemaField {
  type: string;
  enumValues?: unknown[];
}

interface OpenApiOperation {
  route: string;
  method: string;
  parameters: Map<string, OpenApiParameter>;
}

interface OpenApiParameter {
  serialized: string;
  required: boolean;
  schemaType?: string;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isOpenApi(value: OpenApiInput | FieldSnapshot[]): value is OpenApiInput {
  return !Array.isArray(value);
}

function resolveSchemaReference(
  reference: string,
  document: OpenApiInput,
): OpenApiSchema | undefined {
  const prefix = '#/components/schemas/';
  if (!reference.startsWith(prefix)) return undefined;

  const path = reference.slice(prefix.length).split('/');
  if (path.length !== 1) return undefined;

  const name = path[0]?.replace(/~1/g, '/').replace(/~0/g, '~');
  return name ? document.components?.schemas?.[name] : undefined;
}

function schemaFields(schema: OpenApiSchema, document: OpenApiInput): Map<string, SchemaField> {
  const fields = new Map<string, SchemaField>();
  const visitChildren = (
    current: OpenApiSchema,
    prefix: string,
    resolvingReferences: Set<string>,
  ): void => {
    for (const [name, property] of Object.entries(current.properties ?? {})) {
      visit(property, prefix ? `${prefix}.${name}` : name, resolvingReferences);
    }
    if (current.items) visit(current.items, `${prefix}[]`, resolvingReferences);

    if (current.$ref && !resolvingReferences.has(current.$ref)) {
      const referencedSchema = resolveSchemaReference(current.$ref, document);
      if (referencedSchema) {
        visitChildren(referencedSchema, prefix, new Set([...resolvingReferences, current.$ref]));
      }
    }
  };
  const visit = (
    current: OpenApiSchema,
    prefix: string,
    resolvingReferences: Set<string>,
  ): void => {
    const type =
      typeof current.type === 'string'
        ? current.type
        : Array.isArray(current.type)
          ? current.type.join('|')
          : current.$ref
            ? `ref:${current.$ref}`
            : current.properties
              ? 'object'
              : current.items
                ? 'array'
                : 'unknown';

    if (prefix) {
      const field = current.enum ? { type, enumValues: current.enum } : { type };
      fields.set(prefix, field);
    }

    visitChildren(current, prefix, resolvingReferences);
  };

  visitChildren(schema, '', new Set());
  return fields;
}

function openApiSchemaFields(
  value: OpenApiInput | FieldSnapshot[],
): Map<string, Map<string, SchemaField>> {
  if (Array.isArray(value)) {
    return new Map(
      value.map((snapshot) => [
        snapshot.resource,
        new Map(Object.entries(snapshot.fields).map(([path, type]) => [path, { type }])),
      ]),
    );
  }

  return new Map(
    Object.entries(value.components?.schemas ?? {}).map(([resource, schema]) => [
      resource,
      schemaFields(schema, value),
    ]),
  );
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  return JSON.stringify(canonicalize(value)) ?? String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function operationEntries(document: OpenApiInput): OpenApiOperation[] {
  const operations: OpenApiOperation[] = [];
  for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
    if (!isRecord(pathItem)) continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (httpMethods.has(method.toLowerCase()) && isRecord(operation)) {
        operations.push({
          route,
          method: method.toLowerCase(),
          parameters: parameterMap(pathItem, operation),
        });
      }
    }
  }
  return operations.sort(
    (left, right) =>
      left.route.localeCompare(right.route) || left.method.localeCompare(right.method),
  );
}

function parameterMap(...operations: Record<string, unknown>[]): Map<string, OpenApiParameter> {
  const result = new Map<string, OpenApiParameter>();
  for (const operation of operations) {
    const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
    for (const parameter of parameters) {
      if (
        !isRecord(parameter) ||
        typeof parameter.name !== 'string' ||
        typeof parameter.in !== 'string'
      ) {
        continue;
      }
      const path = `${parameter.in}.${parameter.name}`;
      const schema = isRecord(parameter.schema) ? parameter.schema : undefined;
      const schemaType =
        typeof schema?.type === 'string'
          ? schema.type
          : Array.isArray(schema?.type) && schema.type.every((type) => typeof type === 'string')
            ? [...schema.type].sort().join('|')
            : undefined;
      const details: OpenApiParameter = {
        serialized: serializeValue(parameter),
        required: parameter.in === 'path' || parameter.required === true,
        ...(schemaType === undefined ? {} : { schemaType }),
      };
      result.set(path, details);
    }
  }
  return result;
}

export class ChangeDetector {
  constructor(private readonly fetcher?: ProviderFetcher) {}

  diff(input: ChangeDetectorInput): ChangeRecord[] {
    const oldSchemas = openApiSchemaFields(input.oldDocument);
    const newSchemas = openApiSchemaFields(input.newDocument);
    const oldOpenApi = isOpenApi(input.oldDocument) ? input.oldDocument : undefined;
    const newOpenApi = isOpenApi(input.newDocument) ? input.newDocument : undefined;
    const newDocumentVersion = !newOpenApi?.info?.version
      ? input.newVersion
      : newOpenApi.info.version;
    const source: ProviderSource = {
      kind: input.sourceKind ?? 'openapi',
      provider: 'stripe',
      version: newDocumentVersion,
      fetchedAt: new Date().toISOString(),
      checksumSha256: checksum(input.newDocument),
    };

    const records: ChangeRecord[] = [];
    for (const [resource, oldFields] of oldSchemas) {
      const newFields = newSchemas.get(resource);
      if (!newFields) {
        records.push(
          this.makeRecord(
            resource,
            'schema_removed',
            resource,
            `schema:${resource}`,
            undefined,
            source,
          ),
        );
        continue;
      }

      for (const [path, oldField] of oldFields) {
        const newField = newFields.get(path);
        if (!newField) {
          records.push(
            this.makeRecord(resource, 'field_removed', path, oldField.type, undefined, source),
          );
          continue;
        }

        if (oldField.type !== newField.type) {
          records.push(
            this.makeRecord(
              resource,
              'field_type_changed',
              path,
              oldField.type,
              newField.type,
              source,
            ),
          );
        }

        if (oldField.enumValues) {
          const nextValues = new Set((newField.enumValues ?? []).map(serializeValue));
          for (const value of oldField.enumValues) {
            if (!nextValues.has(serializeValue(value))) {
              records.push(
                this.makeRecord(
                  resource,
                  'enum_value_removed',
                  path,
                  serializeValue(value),
                  undefined,
                  source,
                ),
              );
            }
          }
        }
      }
    }

    if (oldOpenApi?.paths && newOpenApi?.paths) {
      const oldOperations = operationEntries(oldOpenApi);
      const newOperations = new Map(
        operationEntries(newOpenApi).map((entry) => [`${entry.method} ${entry.route}`, entry]),
      );
      for (const { route, method, parameters: oldParameters } of oldOperations) {
        const operationId = `${method} ${route}`;
        const newOperation = newOperations.get(operationId);
        if (!newOperation) {
          records.push(
            this.makeRecord(route, 'endpoint_removed', method, operationId, undefined, source),
          );
          continue;
        }

        const nextParameters = newOperation.parameters;
        for (const [parameterPath, oldParameter] of oldParameters) {
          const nextParameter = nextParameters.get(parameterPath);
          if (!nextParameter) {
            records.push(
              this.makeRecord(
                operationId,
                'parameter_removed',
                parameterPath,
                oldParameter.serialized,
                undefined,
                source,
              ),
            );
            continue;
          }

          if (!oldParameter.required && nextParameter.required) {
            records.push(
              this.makeRecord(
                operationId,
                'parameter_became_required',
                parameterPath,
                'optional',
                'required',
                source,
              ),
            );
          }

          if (
            oldParameter.schemaType !== undefined &&
            nextParameter.schemaType !== undefined &&
            oldParameter.schemaType !== nextParameter.schemaType
          ) {
            records.push(
              this.makeRecord(
                operationId,
                'parameter_type_changed',
                parameterPath,
                oldParameter.schemaType,
                nextParameter.schemaType,
                source,
              ),
            );
          }
        }
      }
    }

    return records.sort((left, right) => left.id.localeCompare(right.id));
  }

  async fetchAndDiff(
    provider: 'stripe',
    oldVersion: string,
    newVersion: string,
  ): Promise<ChangeRecord[]> {
    if (!this.fetcher) throw new Error('No provider fetcher configured');
    const [oldDocument, newDocument] = await Promise.all([
      this.fetcher.fetchOpenApi(provider, oldVersion),
      this.fetcher.fetchOpenApi(provider, newVersion),
    ]);
    return this.diff({ oldDocument, newDocument, oldVersion, newVersion });
  }

  private makeRecord(
    resource: string,
    kind: ChangeKind,
    path: string,
    oldValue: string,
    newValue: string | undefined,
    source: ProviderSource,
  ): ChangeRecord {
    const base = {
      provider: 'stripe' as const,
      kind,
      resource,
      path,
      oldValue,
      breaking: true as const,
      source,
      evidence: `Structured diff: ${inputKind(kind)} ${resource}.${path}`,
    };
    const complete = newValue === undefined ? base : { ...base, newValue };
    return { id: structuredChangeId({ ...complete, breaking: true }), ...complete };
  }
}

function inputKind(kind: ChangeKind): string {
  return kind.replaceAll('_', ' ');
}
