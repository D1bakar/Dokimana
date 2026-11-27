import type { ChangeContext, ChangeKind, ChangeRecord, ProviderSource } from '../domain/types.js';
import {
  buildOpenApiIndex,
  checksum,
  serializeValue,
  structuredChangeId,
  type FieldSnapshot,
  type IndexedOperation,
  type OpenApiIndex,
  type OpenApiInput,
  type OpenApiParameter,
  type SchemaField,
} from './structured-diff.js';
import { buildDirectionalIr, type DirectionalIr } from './ir.js';

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

export interface IndexedChangeDetectorInput {
  oldIndex: OpenApiIndex;
  newIndex: OpenApiIndex;
  oldVersion?: string;
  newVersion: string;
  sourceKind?: 'openapi' | 'changelog';
}

export interface IrChangeDetectorInput {
  ir: DirectionalIr;
  sourceKind?: 'openapi' | 'changelog';
}

interface RecordMetadata {
  operation?: string;
  eventType?: string;
}

type Recorder = (
  context: ChangeContext,
  resource: string,
  kind: ChangeKind,
  path: string | undefined,
  oldValue: string,
  newValue: string | undefined,
  metadata?: RecordMetadata,
) => void;

function isOpenApi(value: OpenApiInput | FieldSnapshot[]): value is OpenApiInput {
  return !Array.isArray(value);
}

function snapshotFields(snapshots: FieldSnapshot[]): Map<string, Map<string, SchemaField>> {
  return new Map(
    snapshots.map((snapshot) => [
      snapshot.resource,
      new Map(
        Object.entries(snapshot.fields).map(([path, type]) => [
          path,
          { type, required: false, expandable: false },
        ]),
      ),
    ]),
  );
}

function uniquePathOperations(index: OpenApiIndex): IndexedOperation[] {
  const operations = new Set<IndexedOperation>();
  for (const methods of index.operationsByPath.values()) {
    for (const operation of methods.values()) operations.add(operation);
  }
  return [...operations];
}

function operationLabel(operation: IndexedOperation): string {
  return `${operation.method.toUpperCase()} ${operation.route}`;
}

function refTargets(type: string): Set<string> {
  return new Set([...type.matchAll(/ref:([^\s|>]+)/g)].map((match) => match[1] ?? ''));
}

export class ChangeDetector {
  constructor(private readonly fetcher?: ProviderFetcher) {}

  diff(input: ChangeDetectorInput): ChangeRecord[] {
    if (isOpenApi(input.oldDocument) && isOpenApi(input.newDocument)) {
      return this.diffIndexes({
        oldIndex: buildOpenApiIndex(input.oldDocument),
        newIndex: buildOpenApiIndex(input.newDocument),
        oldVersion: input.oldVersion,
        newVersion: input.newVersion,
        ...(input.sourceKind === undefined ? {} : { sourceKind: input.sourceKind }),
      });
    }

    const source: ProviderSource = {
      kind: input.sourceKind ?? 'openapi',
      provider: 'stripe',
      version: input.newVersion,
      checksumSha256: checksum(input.newDocument),
    };
    const records: ChangeRecord[] = [];
    const record = this.recorder(records, source);
    const oldFields = snapshotFields(isOpenApi(input.oldDocument) ? [] : input.oldDocument);
    const newFields = snapshotFields(isOpenApi(input.newDocument) ? [] : input.newDocument);
    for (const [resource, fields] of oldFields) {
      const nextFields = newFields.get(resource);
      if (!nextFields) continue;
      diffFieldMaps('schema', resource, fields, nextFields, record);
    }
    return this.sort(records);
  }

  diffIndexes(input: IndexedChangeDetectorInput): ChangeRecord[] {
    const ir = buildDirectionalIr(
      input.oldIndex,
      input.newIndex,
      input.oldVersion ?? input.oldIndex.document.info?.version ?? 'before',
      input.newIndex.document.info?.version ?? input.newVersion,
    );
    return this.diffIr({
      ir,
      ...(input.sourceKind === undefined ? {} : { sourceKind: input.sourceKind }),
    });
  }

  diffIr(input: IrChangeDetectorInput): ChangeRecord[] {
    const source: ProviderSource = {
      kind: input.sourceKind ?? 'openapi',
      provider: 'stripe',
      version: input.ir.after.version,
      checksumSha256: input.ir.after.checksumSha256,
    };
    const records: ChangeRecord[] = [];
    const record = this.recorder(records, source);

    this.diffSchemas(input.ir, record);
    this.diffOperations(input.ir, record);
    this.diffWebhooks(input.ir, record);
    return this.sort(records);
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

  private diffSchemas(ir: DirectionalIr, record: Recorder): void {
    const before = ir.before.index;
    const after = ir.after.index;
    for (const [resource, oldFields] of before.schemas) {
      const newFields = after.schemas.get(resource);
      if (!newFields) {
        record('schema', resource, 'schema_removed', undefined, `schema:${resource}`, undefined);
        continue;
      }
      diffFieldMaps('schema', resource, oldFields, newFields, record);

      const oldExpandable = new Set(before.expandableFields.get(resource) ?? []);
      const newExpandable = new Set(after.expandableFields.get(resource) ?? []);
      for (const field of oldExpandable) {
        if (!newExpandable.has(field)) {
          record('schema', resource, 'expandable_field_removed', field, 'expandable', undefined);
        }
      }

      for (const [path, oldField] of oldFields) {
        if (!oldField.expandable) continue;
        const newField = newFields.get(path);
        if (!newField) continue;
        const newTargets = refTargets(newField.type);
        for (const target of refTargets(oldField.type)) {
          if (!newTargets.has(target)) {
            record('schema', resource, 'expandable_target_removed', path, target, undefined);
          }
        }
      }
    }
  }

  private diffOperations(ir: DirectionalIr, record: Recorder): void {
    const before = ir.before.index;
    const after = ir.after.index;
    for (const oldOperation of uniquePathOperations(before)) {
      const newOperation =
        (oldOperation.operationId
          ? after.operationsById.get(oldOperation.operationId)
          : undefined) ?? after.operationsByPath.get(oldOperation.route)?.get(oldOperation.method);
      const operation = operationLabel(oldOperation);
      if (!newOperation) {
        record(
          'operation',
          oldOperation.route,
          'endpoint_removed',
          oldOperation.method,
          operation.toLowerCase(),
          undefined,
          { operation },
        );
        continue;
      }
      diffParameters(oldOperation.key, oldOperation.parameters, newOperation.parameters, record, {
        operation,
      });
      if (oldOperation.hasRequestBody && !newOperation.hasRequestBody) {
        record(
          'request_body',
          oldOperation.key,
          'request_body_removed',
          undefined,
          'request body',
          undefined,
          { operation },
        );
      }
      diffFieldMaps(
        'request_body',
        oldOperation.key,
        oldOperation.requestBodyFields,
        newOperation.requestBodyFields,
        record,
        { operation },
      );

      for (const [status, oldFields] of oldOperation.responses) {
        const newFields = newOperation.responses.get(status);
        if (!newFields) {
          record(
            'response',
            `${oldOperation.key} ${status}`,
            'response_removed',
            undefined,
            `response ${status}`,
            undefined,
            { operation },
          );
          continue;
        }
        diffFieldMaps('response', `${oldOperation.key} ${status}`, oldFields, newFields, record, {
          operation,
        });
      }
    }
  }

  private diffWebhooks(ir: DirectionalIr, record: Recorder): void {
    const before = ir.before.index;
    const after = ir.after.index;
    for (const [event, oldMethods] of before.webhooksByEvent) {
      const newMethods = after.webhooksByEvent.get(event);
      if (!newMethods) {
        record(
          'webhook_event',
          event,
          'webhook_removed',
          undefined,
          `webhook ${event}`,
          undefined,
          {
            eventType: event,
          },
        );
        continue;
      }
      for (const [method, oldOperation] of oldMethods) {
        const newOperation = newMethods.get(method);
        if (!newOperation) {
          record(
            'webhook_event',
            event,
            'webhook_removed',
            method,
            `${method} ${event}`,
            undefined,
            { eventType: event },
          );
          continue;
        }
        diffFieldMaps(
          'webhook_event',
          event,
          oldOperation.requestBodyFields,
          newOperation.requestBodyFields,
          record,
          { eventType: event },
        );
      }
    }
  }

  private recorder(records: ChangeRecord[], source: ProviderSource): Recorder {
    return (context, resource, kind, path, oldValue, newValue, metadata) => {
      const base = {
        provider: 'stripe' as const,
        context,
        kind,
        resource,
        ...(path === undefined ? {} : { path }),
        ...(metadata?.operation === undefined ? {} : { operation: metadata.operation }),
        ...(metadata?.eventType === undefined ? {} : { eventType: metadata.eventType }),
        oldValue,
        breaking: true as const,
        source,
        evidence: `Structured diff: ${context} ${kind} ${resource}${path ? `.${path}` : ''}`,
      };
      const complete = newValue === undefined ? base : { ...base, newValue };
      records.push({ id: structuredChangeId({ ...complete, breaking: true }), ...complete });
    };
  }

  private sort(records: ChangeRecord[]): ChangeRecord[] {
    return records.sort((left, right) => left.id.localeCompare(right.id));
  }
}

function diffFieldMaps(
  context: ChangeContext,
  resource: string,
  oldFields: Map<string, SchemaField>,
  newFields: Map<string, SchemaField>,
  record: Recorder,
  metadata?: RecordMetadata,
): void {
  for (const [path, oldField] of oldFields) {
    const newField = newFields.get(path);
    if (!newField) {
      record(context, resource, 'field_removed', path, oldField.type, undefined, metadata);
      continue;
    }
    if (oldField.type !== newField.type) {
      record(context, resource, 'field_type_changed', path, oldField.type, newField.type, metadata);
    }
    if (!oldField.required && newField.required) {
      record(context, resource, 'field_became_required', path, 'optional', 'required', metadata);
    }
    if (oldField.enumValues && newField.enumValues) {
      const nextValues = new Set(newField.enumValues.map(serializeValue));
      for (const value of oldField.enumValues) {
        if (!nextValues.has(serializeValue(value))) {
          record(
            context,
            resource,
            'enum_value_removed',
            path,
            serializeValue(value),
            undefined,
            metadata,
          );
        }
      }
    }
  }
}

function diffParameters(
  resource: string,
  oldParameters: Map<string, OpenApiParameter>,
  newParameters: Map<string, OpenApiParameter>,
  record: Recorder,
  metadata?: RecordMetadata,
): void {
  for (const [path, oldParameter] of oldParameters) {
    const newParameter = newParameters.get(path);
    if (!newParameter) {
      record(
        'request_parameter',
        resource,
        'parameter_removed',
        path,
        oldParameter.serialized,
        undefined,
        metadata,
      );
      continue;
    }
    if (!oldParameter.required && newParameter.required) {
      record(
        'request_parameter',
        resource,
        'parameter_became_required',
        path,
        'optional',
        'required',
        metadata,
      );
    }
    if (
      oldParameter.schemaType !== undefined &&
      newParameter.schemaType !== undefined &&
      oldParameter.schemaType !== newParameter.schemaType
    ) {
      record(
        'request_parameter',
        resource,
        'parameter_type_changed',
        path,
        oldParameter.schemaType,
        newParameter.schemaType,
        metadata,
      );
    }
    if (oldParameter.enumValues && newParameter.enumValues) {
      const nextValues = new Set(newParameter.enumValues.map(serializeValue));
      for (const value of oldParameter.enumValues) {
        if (!nextValues.has(serializeValue(value))) {
          record(
            'request_parameter',
            resource,
            'parameter_enum_value_removed',
            path,
            serializeValue(value),
            undefined,
            metadata,
          );
        }
      }
    }
  }
}
