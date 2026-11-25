import { createHash } from 'node:crypto';
import type { ChangeKind, ChangeRecord, ProviderSource } from '../domain/types.js';
import { structuredChangeId } from './structured-diff.js';
import type { FieldSnapshot, OpenApiInput } from './structured-diff.js';

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

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isOpenApi(value: OpenApiInput | FieldSnapshot[]): value is OpenApiInput {
  return !Array.isArray(value);
}

function snapshots(value: OpenApiInput | FieldSnapshot[]): FieldSnapshot[] {
  if (Array.isArray(value)) return value;
  if (!value.components?.schemas) return [];
  return Object.entries(value.components.schemas).map(([resource, schema]) => {
    const properties =
      typeof schema.properties === 'object' && schema.properties
        ? (schema.properties as Record<string, { type?: unknown }>)
        : {};
    const fields = Object.fromEntries(
      Object.entries(properties).map(([name, definition]) => [
        name,
        typeof definition.type === 'string' ? definition.type : 'unknown',
      ]),
    );
    return { resource, fields };
  });
}

export class ChangeDetector {
  constructor(private readonly fetcher?: ProviderFetcher) {}

  diff(input: ChangeDetectorInput): ChangeRecord[] {
    const oldSnapshots = snapshots(input.oldDocument);
    const newSnapshots = snapshots(input.newDocument);
    const newByResource = new Map(newSnapshots.map((item) => [item.resource, item]));
    const sourceKind = input.sourceKind ?? 'openapi';
    const newDocumentVersion =
      !isOpenApi(input.newDocument) || !input.newDocument.info?.version
        ? input.newVersion
        : input.newDocument.info.version;
    const source: ProviderSource = {
      kind: sourceKind,
      provider: 'stripe',
      version: newDocumentVersion,
      fetchedAt: new Date().toISOString(),
      checksumSha256: checksum(input.newDocument),
    };

    const records: ChangeRecord[] = [];
    for (const old of oldSnapshots) {
      const next = newByResource.get(old.resource);
      if (!next) {
        records.push(
          this.makeRecord(old.resource, 'endpoint_removed', old.resource, '', undefined, source),
        );
      }
      for (const [fieldName, oldType] of Object.entries(old.fields)) {
        const newType = next?.fields[fieldName];
        if (newType === undefined) {
          records.push(
            this.makeRecord(old.resource, 'field_removed', fieldName, oldType, undefined, source),
          );
          continue;
        }
        if (newType !== oldType) {
          records.push(
            this.makeRecord(
              old.resource,
              'field_type_changed',
              fieldName,
              oldType,
              newType,
              source,
            ),
          );
        }
      }
    }
    return records;
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
