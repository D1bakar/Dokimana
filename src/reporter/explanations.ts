import type { ChangeKind } from '../domain/types.js';
import { getRule, type RuleSeverity } from '../diff/rules.js';

export type ChangeSeverity = RuleSeverity;

export interface ChangeExplanation {
  why: string;
  check: string;
}

export function explainChange(kind: ChangeKind): ChangeExplanation {
  const rule = getRule(kind);
  return { why: rule.why, check: rule.check };
}

export function severityForChange(kind: ChangeKind): ChangeSeverity {
  return getRule(kind).severity;
}
