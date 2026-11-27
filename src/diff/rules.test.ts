import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ChangeContext, ChangeKind } from '../domain/types.js';
import { explainChange, severityForChange } from '../reporter/explanations.js';
import { allRules, getRule, getRuleById, renderRulesMarkdown, RULES } from './rules.js';

const EXPECTED_RULES: readonly (readonly [string, ChangeKind, 'high' | 'medium'])[] = [
  ['DOK-001', 'field_removed', 'high'],
  ['DOK-002', 'field_renamed', 'high'],
  ['DOK-003', 'field_type_changed', 'high'],
  ['DOK-004', 'field_became_required', 'high'],
  ['DOK-005', 'schema_removed', 'high'],
  ['DOK-006', 'expandable_field_removed', 'medium'],
  ['DOK-007', 'expandable_target_removed', 'medium'],
  ['DOK-008', 'parameter_removed', 'high'],
  ['DOK-009', 'parameter_renamed', 'high'],
  ['DOK-010', 'parameter_became_required', 'high'],
  ['DOK-011', 'parameter_type_changed', 'high'],
  ['DOK-012', 'parameter_enum_value_removed', 'medium'],
  ['DOK-013', 'request_body_removed', 'high'],
  ['DOK-014', 'response_removed', 'high'],
  ['DOK-015', 'endpoint_removed', 'high'],
  ['DOK-016', 'webhook_removed', 'high'],
  ['DOK-017', 'enum_value_removed', 'medium'],
];

const VALID_CONTEXTS: readonly ChangeContext[] = [
  'schema',
  'operation',
  'request_parameter',
  'request_body',
  'response',
  'webhook_event',
];

describe('rule registry', () => {
  it('assigns one stable id and severity to every declared change kind', () => {
    const actual = allRules().map((rule) => [rule.id, rule.kind, rule.severity] as const);

    expect(actual).toEqual(EXPECTED_RULES);
    expect(new Set(RULES.map((rule) => rule.id)).size).toBe(RULES.length);
    expect(new Set(RULES.map((rule) => rule.kind)).size).toBe(RULES.length);
  });

  it('uses only valid, unique, non-empty contexts', () => {
    for (const rule of allRules()) {
      expect(rule.contexts.length).toBeGreaterThan(0);
      expect(new Set(rule.contexts).size).toBe(rule.contexts.length);
      for (const context of rule.contexts) {
        expect(VALID_CONTEXTS).toContain(context);
      }
    }
  });

  it('resolves rules by kind and by stable id', () => {
    for (const rule of allRules()) {
      expect(getRule(rule.kind)).toBe(rule);
      expect(getRuleById(rule.id)).toBe(rule);
    }

    expect(getRuleById('DOK-999')).toBeUndefined();
    expect(() => getRule('unknown_change_kind' as ChangeKind)).toThrow(
      'No rule registered for change kind: unknown_change_kind',
    );
  });

  it('delegates explanations and severities to the registry', () => {
    for (const rule of allRules()) {
      expect(explainChange(rule.kind)).toEqual({ why: rule.why, check: rule.check });
      expect(severityForChange(rule.kind)).toBe(rule.severity);
    }
  });

  it('keeps generated rule documentation in sync with the registry', async () => {
    const documented = await readFile(resolve('docs/RULES.md'), 'utf8');

    expect(documented).toBe(renderRulesMarkdown());
  });
});
