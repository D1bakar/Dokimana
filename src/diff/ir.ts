import {
  serializeValue,
  type IndexedOperation,
  type OpenApiIndex,
  type SchemaField,
} from './structured-diff.js';

export type Direction = 'before' | 'after';

export interface IrField {
  path: string;
  type: string;
  required: boolean;
  enumValues: string[];
  expandable: boolean;
}

export interface IrParameter {
  key: string;
  required: boolean;
  type?: string;
  enumValues: string[];
}

export interface IrOperation {
  id: string;
  label: string;
  method: string;
  route: string;
  source: 'path' | 'webhook';
  parameters: ReadonlyMap<string, IrParameter>;
  requestBodyFields: ReadonlyMap<string, IrField>;
  responses: ReadonlyMap<string, ReadonlyMap<string, IrField>>;
}

export interface OpenApiIr {
  direction: Direction;
  version: string;
  checksumSha256: string;
  schemas: ReadonlyMap<string, ReadonlyMap<string, IrField>>;
  expandableFields: ReadonlyMap<string, string[]>;
  operations: ReadonlyMap<string, IrOperation>;
  webhooks: ReadonlyMap<string, ReadonlyMap<string, IrOperation>>;
  index: OpenApiIndex;
}

export interface DirectionalIr {
  before: OpenApiIr;
  after: OpenApiIr;
}

function compareKeys(left: string, right: string): number {
  return left.localeCompare(right);
}

function serializedEnums(values: readonly unknown[] | undefined): string[] {
  return [...(values ?? [])].map(serializeValue).sort(compareKeys);
}

function toIrField(path: string, field: SchemaField): IrField {
  return {
    path,
    type: field.type,
    required: field.required,
    enumValues: serializedEnums(field.enumValues),
    expandable: field.expandable,
  };
}

function toIrFields(fields: ReadonlyMap<string, SchemaField>): ReadonlyMap<string, IrField> {
  return new Map(
    [...fields.entries()]
      .sort(([left], [right]) => compareKeys(left, right))
      .map(([path, field]) => [path, toIrField(path, field)]),
  );
}

function toIrOperation(operation: IndexedOperation): IrOperation {
  const parameters = new Map<string, IrParameter>();
  for (const [key, parameter] of [...operation.parameters.entries()].sort(([left], [right]) =>
    compareKeys(left, right),
  )) {
    parameters.set(key, {
      key,
      required: parameter.required,
      ...(parameter.schemaType === undefined ? {} : { type: parameter.schemaType }),
      enumValues: serializedEnums(parameter.enumValues),
    });
  }

  const responses = new Map<string, ReadonlyMap<string, IrField>>();
  for (const [status, fields] of [...operation.responses.entries()].sort(([left], [right]) =>
    compareKeys(left, right),
  )) {
    responses.set(status, toIrFields(fields));
  }

  return {
    id: operation.key,
    label: `${operation.method.toUpperCase()} ${operation.route}`,
    method: operation.method,
    route: operation.route,
    source: operation.source,
    parameters,
    requestBodyFields: toIrFields(operation.requestBodyFields),
    responses,
  };
}

function operationMap(operations: Iterable<IndexedOperation>): ReadonlyMap<string, IrOperation> {
  const result = new Map<string, IrOperation>();
  for (const operation of operations) {
    result.set(operation.key, toIrOperation(operation));
  }
  return new Map([...result.entries()].sort(([left], [right]) => compareKeys(left, right)));
}

function routeOperationMap(
  byRoute: ReadonlyMap<string, ReadonlyMap<string, IndexedOperation>>,
): ReadonlyMap<string, IrOperation> {
  const operations: IndexedOperation[] = [];
  for (const methods of byRoute.values()) {
    operations.push(...methods.values());
  }
  return operationMap(operations);
}

function webhookOperationMap(
  byEvent: ReadonlyMap<string, ReadonlyMap<string, IndexedOperation>>,
): ReadonlyMap<string, ReadonlyMap<string, IrOperation>> {
  const result = new Map<string, ReadonlyMap<string, IrOperation>>();
  for (const [event, methods] of [...byEvent.entries()].sort(([left], [right]) =>
    compareKeys(left, right),
  )) {
    const converted = new Map<string, IrOperation>();
    for (const [method, operation] of [...methods.entries()].sort(([left], [right]) =>
      compareKeys(left, right),
    )) {
      converted.set(method, toIrOperation(operation));
    }
    result.set(event, converted);
  }
  return result;
}

export function buildOpenApiIr(
  index: OpenApiIndex,
  direction: Direction,
  version: string,
): OpenApiIr {
  const schemas = new Map<string, ReadonlyMap<string, IrField>>();
  for (const [resource, fields] of [...index.schemas.entries()].sort(([left], [right]) =>
    compareKeys(left, right),
  )) {
    schemas.set(resource, toIrFields(fields));
  }

  const expandableFields = new Map<string, string[]>();
  for (const [resource, fields] of [...index.expandableFields.entries()].sort(([left], [right]) =>
    compareKeys(left, right),
  )) {
    expandableFields.set(resource, [...fields].sort(compareKeys));
  }

  return {
    direction,
    version,
    checksumSha256: index.checksumSha256,
    schemas,
    expandableFields,
    operations: routeOperationMap(index.operationsByPath),
    webhooks: webhookOperationMap(index.webhooksByEvent),
    index,
  };
}

export function buildDirectionalIr(
  oldIndex: OpenApiIndex,
  newIndex: OpenApiIndex,
  oldVersion: string,
  newVersion: string,
): DirectionalIr {
  return {
    before: buildOpenApiIr(oldIndex, 'before', oldVersion),
    after: buildOpenApiIr(newIndex, 'after', newVersion),
  };
}

export function serializeIr(ir: OpenApiIr): unknown {
  return {
    direction: ir.direction,
    version: ir.version,
    checksumSha256: ir.checksumSha256,
    schemas: [...ir.schemas.entries()].map(([resource, fields]) => ({
      resource,
      fields: [...fields.values()],
    })),
    expandableFields: [...ir.expandableFields.entries()].map(([resource, fields]) => ({
      resource,
      fields,
    })),
    operations: [...ir.operations.values()].map((operation) => ({
      id: operation.id,
      label: operation.label,
      method: operation.method,
      route: operation.route,
      source: operation.source,
      parameters: [...operation.parameters.values()],
      requestBodyFields: [...operation.requestBodyFields.values()],
      responses: [...operation.responses.entries()].map(([status, fields]) => ({
        status,
        fields: [...fields.values()],
      })),
    })),
    webhooks: [...ir.webhooks.entries()].map(([event, methods]) => ({
      event,
      operations: [...methods.values()].map((operation) => ({
        id: operation.id,
        label: operation.label,
        method: operation.method,
      })),
    })),
  };
}
