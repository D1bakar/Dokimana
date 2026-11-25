import type { ChangeRecord } from '../domain/types.js';

export interface OpenApiInput {
  openapi?: string;
  info?: { version?: string };
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
  paths?: Record<string, Record<string, unknown>>;
}

export interface OpenApiSchema {
  type?: string | string[];
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  enum?: unknown[];
  $ref?: string;
}

export interface FieldSnapshot {
  resource: string;
  fields: Record<string, string>;
}

export function structuredChangeId(change: Omit<ChangeRecord, 'id'>): string {
  const identity = [
    change.provider,
    change.resource,
    change.kind,
    change.path ?? '',
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
