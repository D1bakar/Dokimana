import type {
  ChangeKind,
  ChangeRecord,
  EvidenceReport,
  ImpactFinding,
  NeedsHumanItem,
  UnresolvedItem,
} from '../domain/types.js';
import { explainChange, severityForChange } from './explanations.js';

type SarifLevel = 'error' | 'warning' | 'note';

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  help: { text: string };
  defaultConfiguration: { level: SarifLevel };
}

interface SarifLocation {
  physicalLocation?: {
    artifactLocation: { uri: string };
    region?: { startLine: number; startColumn: number };
  };
  logicalLocations?: Array<{ name: string }>;
}

interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: { text: string };
  locations?: SarifLocation[];
  logicalLocations?: Array<{ name: string }>;
  partialFingerprints?: Record<string, string>;
  properties: Record<string, unknown>;
}

interface SarifRun {
  tool: { driver: { name: string; rules: SarifRule[] } };
  results: SarifResult[];
  properties: Record<string, unknown>;
}

interface SarifDocument {
  version: '2.1.0';
  runs: SarifRun[];
}

interface RuleDetail {
  why: string;
  check: string;
  level: SarifLevel;
}

interface EvidenceReportWithUnresolved extends EvidenceReport {
  unresolved?: UnresolvedItem[];
}

const RULE_PREFIX = 'dokimana/';
const NEEDS_HUMAN_RULE_ID = `${RULE_PREFIX}needs-human`;
const UNRESOLVED_RULE_ID = `${RULE_PREFIX}unresolved`;
const UNLINKED_FINDING_RULE_ID = `${RULE_PREFIX}unlinked-finding`;

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function levelFromSeverity(severity: 'high' | 'medium' | 'low'): SarifLevel {
  if (severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  return 'note';
}

function changeRuleId(kind: ChangeKind): string {
  return kind;
}

function readUnresolved(report: EvidenceReport): UnresolvedItem[] {
  const value = (report as EvidenceReportWithUnresolved).unresolved;
  return Array.isArray(value) ? value : [];
}

function startPosition(value: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function changeSiteFingerprint(finding: ImpactFinding): string {
  const input = JSON.stringify([
    finding.changeId,
    finding.callSite.file,
    finding.callSite.line,
    finding.callSite.column,
    finding.callSite.fieldPath,
  ]);
  return `v1:${hashText(input)}`;
}

function sortedFindings(findings: ImpactFinding[]): ImpactFinding[] {
  return [...findings].sort(
    (left, right) =>
      compareStrings(left.callSite.file, right.callSite.file) ||
      left.callSite.line - right.callSite.line ||
      left.callSite.column - right.callSite.column ||
      compareStrings(left.changeId, right.changeId) ||
      compareStrings(
        left.callSite.fieldPath.join('\u0000'),
        right.callSite.fieldPath.join('\u0000'),
      ) ||
      compareStrings(left.reason, right.reason),
  );
}

function sortedNeedsHuman(items: NeedsHumanItem[]): NeedsHumanItem[] {
  return [...items].sort(
    (left, right) =>
      compareStrings(left.resource, right.resource) ||
      compareStrings(left.changeId, right.changeId) ||
      compareStrings(left.kind, right.kind) ||
      compareStrings(left.reason, right.reason),
  );
}

function sortedUnresolved(items: UnresolvedItem[]): UnresolvedItem[] {
  return [...items].sort(
    (left, right) =>
      compareStrings(left.file, right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      compareStrings(left.kind, right.kind) ||
      compareStrings(left.reason, right.reason),
  );
}

export function renderSarif(report: EvidenceReport): string {
  const changesById = new Map<string, ChangeRecord>(
    report.changes.map((change) => [change.id, change]),
  );
  const unresolved = readUnresolved(report);
  const findings = sortedFindings(report.findings);
  const needsHuman = sortedNeedsHuman(report.needsHuman);
  const unresolvedItems = sortedUnresolved(unresolved);

  const kinds = [
    ...new Set([
      ...report.changes.map((change) => change.kind),
      ...report.needsHuman.map((item) => item.kind),
    ]),
  ].sort(compareStrings);

  const ruleDetails = new Map<string, RuleDetail>();
  for (const kind of kinds) {
    const explanation = explainChange(kind);
    ruleDetails.set(changeRuleId(kind), {
      why: explanation.why,
      check: explanation.check,
      level: levelFromSeverity(severityForChange(kind)),
    });
  }
  if (needsHuman.length > 0) {
    ruleDetails.set(NEEDS_HUMAN_RULE_ID, {
      why: 'A change was recorded for human review because no supported mapping is available.',
      check:
        'Review the change and record a supported mapping only if the supplied sources document one.',
      level: 'warning',
    });
  }
  if (unresolvedItems.length > 0) {
    ruleDetails.set(UNRESOLVED_RULE_ID, {
      why: 'A source pattern could not be resolved by the scanner.',
      check: 'Inspect the source pattern and decide whether it needs manual tracing.',
      level: 'warning',
    });
  }
  if (findings.some((finding) => !changesById.has(finding.changeId))) {
    ruleDetails.set(UNLINKED_FINDING_RULE_ID, {
      why: 'A finding refers to a change identifier that is not present in this report.',
      check: 'Inspect the finding and confirm which change it relates to.',
      level: 'warning',
    });
  }

  const rules: SarifRule[] = [...ruleDetails.entries()]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([id, detail]) => ({
      id,
      name: id.replace(/[^A-Za-z0-9_]+/g, '_'),
      shortDescription: { text: detail.why },
      help: { text: `${detail.why} ${detail.check}` },
      defaultConfiguration: { level: detail.level },
    }));

  const results: SarifResult[] = [];

  for (const finding of findings) {
    const change = changesById.get(finding.changeId);
    const callSite = finding.callSite;
    results.push({
      ruleId: change ? changeRuleId(change.kind) : UNLINKED_FINDING_RULE_ID,
      level: levelFromSeverity(finding.confidence),
      message: { text: finding.reason },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: callSite.file },
            region: {
              startLine: startPosition(callSite.line),
              startColumn: startPosition(callSite.column),
            },
          },
        },
      ],
      partialFingerprints: { 'dokimana/change-site/v1': changeSiteFingerprint(finding) },
      properties: {
        changeId: finding.changeId,
        kind: change?.kind ?? null,
        context: change?.context ?? null,
        operation: callSite.operation,
        changeOperation: change?.operation ?? null,
        openApiOperation: callSite.openApiOperation ?? null,
        fieldPath: callSite.fieldPath,
        callSiteKind: callSite.kind,
        snippet: callSite.snippet,
        confidence: finding.confidence,
        confidenceReason: finding.confidenceReason,
        evidence: change?.evidence ?? null,
        limitations: report.limitations.slice(),
      },
    });
  }

  for (const item of needsHuman) {
    const change = changesById.get(item.changeId);
    results.push({
      ruleId: NEEDS_HUMAN_RULE_ID,
      level: levelFromSeverity(severityForChange(item.kind)),
      message: { text: item.reason },
      locations: [
        {
          physicalLocation: { artifactLocation: { uri: report.repository } },
          logicalLocations: [{ name: report.repository }],
        },
      ],
      partialFingerprints: {
        'dokimana/needs-human/v1': hashText(
          JSON.stringify([item.changeId, item.kind, item.resource, item.path ?? null, item.reason]),
        ),
      },
      properties: {
        changeId: item.changeId,
        kind: item.kind,
        context: item.context ?? null,
        resource: item.resource,
        path: item.path ?? null,
        operation: change?.operation ?? null,
        eventType: change?.eventType ?? null,
        evidence: change?.evidence ?? null,
        limitations: report.limitations.slice(),
      },
    });
  }

  for (const item of unresolvedItems) {
    results.push({
      ruleId: UNRESOLVED_RULE_ID,
      level: 'warning',
      message: { text: item.reason },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: item.file },
            region: {
              startLine: startPosition(item.line),
              startColumn: startPosition(item.column),
            },
          },
        },
      ],
      partialFingerprints: {
        'dokimana/unresolved/v1': hashText(
          JSON.stringify([
            item.file,
            item.line,
            item.column,
            item.kind,
            item.snippet,
            item.relatedChangeIds,
          ]),
        ),
      },
      properties: {
        kind: item.kind,
        snippet: item.snippet,
        relatedChangeIds: item.relatedChangeIds.slice(),
        limitations: report.limitations.slice(),
      },
    });
  }

  const document: SarifDocument = {
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'Dokimana', rules } },
        results,
        properties: {
          generatedAt: report.generatedAt,
          repository: report.repository,
          providerVersion: report.providerVersion,
          impactAnalysis: report.impactAnalysis,
          counts: {
            changes: report.changes.length,
            findings: report.findings.length,
            needsHuman: report.needsHuman.length,
            unresolved: unresolved.length,
            verification: report.verification.length,
          },
        },
      },
    ],
  };

  return JSON.stringify(document, null, 2);
}
