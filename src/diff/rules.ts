import type { ChangeContext, ChangeKind } from '../domain/types.js';

export type RuleSeverity = 'high' | 'medium' | 'low';

export interface RuleDefinition {
  id: string;
  kind: ChangeKind;
  contexts: readonly ChangeContext[];
  severity: RuleSeverity;
  why: string;
  check: string;
}

export const RULES: readonly RuleDefinition[] = [
  {
    id: 'DOK-001',
    kind: 'field_removed',
    contexts: ['schema', 'request_body', 'response', 'webhook_event'],
    severity: 'high',
    why: 'A field present in the old supplied specification is absent in the new one.',
    check:
      'Find code that reads or writes this field and confirm how each site handles its absence.',
  },
  {
    id: 'DOK-002',
    kind: 'field_renamed',
    contexts: ['schema', 'request_body', 'response', 'webhook_event'],
    severity: 'high',
    why: "A field's name changed between the supplied specifications.",
    check: 'Find code using the old name and confirm whether it should use the new name.',
  },
  {
    id: 'DOK-003',
    kind: 'field_type_changed',
    contexts: ['schema', 'request_body', 'response', 'webhook_event'],
    severity: 'high',
    why: "A field's declared type differs between the supplied specifications.",
    check: 'Find code that assigns or reads this field and confirm the new type still fits.',
  },
  {
    id: 'DOK-004',
    kind: 'field_became_required',
    contexts: ['schema', 'request_body', 'response', 'webhook_event'],
    severity: 'high',
    why: 'A field that could previously be omitted is now required by the supplied specification.',
    check: 'Find code that builds objects without this field and confirm it now supplies a value.',
  },
  {
    id: 'DOK-005',
    kind: 'schema_removed',
    contexts: ['schema'],
    severity: 'high',
    why: 'A schema present in the old supplied specification is absent in the new one.',
    check:
      'Find code and types that reference this schema and confirm how they should handle its absence.',
  },
  {
    id: 'DOK-006',
    kind: 'expandable_field_removed',
    contexts: ['schema'],
    severity: 'medium',
    why: 'A field that could be expanded is absent in the new supplied specification.',
    check:
      'Find expand arrays and field reads that name this field and confirm how they should handle its absence.',
  },
  {
    id: 'DOK-007',
    kind: 'expandable_target_removed',
    contexts: ['schema'],
    severity: 'medium',
    why: 'A target that could be expanded is no longer listed for this field in the supplied specification.',
    check:
      'Find expand arrays that name this target and confirm how they should handle its absence.',
  },
  {
    id: 'DOK-008',
    kind: 'parameter_removed',
    contexts: ['request_parameter'],
    severity: 'high',
    why: 'A request parameter present in the old supplied specification is absent in the new one.',
    check: 'Find calls that pass this parameter and confirm how each site handles its absence.',
  },
  {
    id: 'DOK-009',
    kind: 'parameter_renamed',
    contexts: ['request_parameter'],
    severity: 'high',
    why: "A request parameter's name changed between the supplied specifications.",
    check: 'Find calls that pass the old name and confirm whether they should use the new name.',
  },
  {
    id: 'DOK-010',
    kind: 'parameter_became_required',
    contexts: ['request_parameter'],
    severity: 'high',
    why: 'A request parameter that could previously be omitted is now required by the supplied specification.',
    check: 'Find calls that omit this parameter and confirm they now supply a value.',
  },
  {
    id: 'DOK-011',
    kind: 'parameter_type_changed',
    contexts: ['request_parameter'],
    severity: 'high',
    why: "A request parameter's declared type differs between the supplied specifications.",
    check: 'Find calls that pass this parameter and confirm the values still match the new type.',
  },
  {
    id: 'DOK-012',
    kind: 'parameter_enum_value_removed',
    contexts: ['request_parameter'],
    severity: 'medium',
    why: 'A value the old supplied specification allowed for a parameter is no longer listed.',
    check: 'Find calls that pass this value and confirm which value is documented as supported.',
  },
  {
    id: 'DOK-013',
    kind: 'request_body_removed',
    contexts: ['request_body'],
    severity: 'high',
    why: 'The request body for an operation is absent in the new supplied specification.',
    check: 'Find calls that send a body to this operation and confirm how they should handle that.',
  },
  {
    id: 'DOK-014',
    kind: 'response_removed',
    contexts: ['response'],
    severity: 'high',
    why: 'A response shape for an operation is absent in the new supplied specification.',
    check: 'Find code that reads fields from that response and confirm how it handles its absence.',
  },
  {
    id: 'DOK-015',
    kind: 'endpoint_removed',
    contexts: ['operation'],
    severity: 'high',
    why: 'An operation present in the old supplied specification is absent in the new one.',
    check: 'Find calls to this operation and confirm how each site handles its absence.',
  },
  {
    id: 'DOK-016',
    kind: 'webhook_removed',
    contexts: ['webhook_event'],
    severity: 'high',
    why: 'A webhook event type present in the old supplied specification is absent in the new one.',
    check: 'Find handlers for this event type and confirm how each handles its absence.',
  },
  {
    id: 'DOK-017',
    kind: 'enum_value_removed',
    contexts: ['schema', 'request_body', 'response', 'webhook_event'],
    severity: 'medium',
    why: 'A value the old supplied specification allowed for a field is no longer listed.',
    check:
      'Find code that reads or writes this value and confirm which value is documented as supported.',
  },
];

const byKind = new Map<ChangeKind, RuleDefinition>(RULES.map((rule) => [rule.kind, rule]));
const byId = new Map<string, RuleDefinition>(RULES.map((rule) => [rule.id, rule]));

export function allRules(): readonly RuleDefinition[] {
  return [...RULES].sort((left, right) => left.id.localeCompare(right.id));
}

export function getRule(kind: ChangeKind): RuleDefinition {
  const rule = byKind.get(kind);
  if (!rule) throw new Error(`No rule registered for change kind: ${kind}`);
  return rule;
}

export function getRuleById(id: string): RuleDefinition | undefined {
  return byId.get(id);
}

function markdownCell(value: string): string {
  return value.replaceAll('|', '\\|');
}

function markdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const escapedRows = rows.map((row) => row.map(markdownCell));
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...escapedRows.map((row) => row[index]?.length ?? 0)),
  );
  const renderRow = (row: readonly string[]) =>
    `| ${row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join(' | ')} |`;
  const separator = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;
  return [renderRow(headers), separator, ...escapedRows.map(renderRow)].join('\n');
}

export function renderRulesMarkdown(rules: readonly RuleDefinition[] = allRules()): string {
  const headers = ['ID', 'Kind', 'Contexts', 'Severity', 'Why', 'Check'];
  const rows = [...rules]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((rule) => [
      rule.id,
      rule.kind,
      rule.contexts.join(', '),
      rule.severity,
      rule.why,
      rule.check,
    ]);
  const lines = [
    '# Dokimana Rule Registry',
    '',
    'Generated by `npm run docs:rules`. Do not edit this file manually.',
    '',
    'Rule IDs are stable identifiers. They describe supported change kinds and the review question each rule asks; they do not claim runtime proof.',
    '',
    markdownTable(headers, rows),
  ];
  return `${lines.join('\n')}\n`;
}
