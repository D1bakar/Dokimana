import type {
  ChangeRecord,
  EvidenceReport,
  ImpactReport,
  UnresolvedItem,
  VerificationResult,
} from '../domain/types.js';
import { explainChange, severityForChange, type ChangeSeverity } from './explanations.js';
import { toPosixPath } from '../util/paths.js';

const SEVERITIES: ChangeSeverity[] = ['high', 'medium', 'low'];

function terminalText(value: string): string {
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || (codePoint >= 127 && codePoint <= 159) ? ' ' : character;
    })
    .join('');
}

function readUnresolved(report: EvidenceReport): UnresolvedItem[] {
  return Array.isArray(report.unresolved) ? report.unresolved : [];
}

function severityCounts(changes: ChangeRecord[]): Record<ChangeSeverity, number> {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const change of changes) counts[severityForChange(change.kind)] += 1;
  return counts;
}

function sortedResources(changes: ChangeRecord[]): string[] {
  return [...new Set(changes.map((change) => change.resource))].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function renderTerminalReport(report: EvidenceReport): string {
  const counts = severityCounts(report.changes);
  const lines = [
    `Dokimana Evidence Report`,
    `Repository: ${terminalText(report.repository)}`,
    `Provider version: ${terminalText(report.providerVersion)}`,
    `Impact analysis: ${report.impactAnalysis}`,
    `Changes: ${report.changes.length} (high ${counts.high}, medium ${counts.medium}, low ${counts.low})`,
    `Affected call sites: ${report.findings.length}`,
    `Needs human review: ${report.needsHuman.length}`,
    `Unresolved sites: ${readUnresolved(report).length}`,
    'Structured changes:',
  ];
  if (report.changes.length === 0) lines.push('  None');
  for (const change of report.changes) {
    lines.push(
      `  - [${terminalText(severityForChange(change.kind))}] [${terminalText(change.context ?? 'unspecified')}] ${terminalText(change.kind)} ${terminalText(change.resource)}${change.path ? `.${terminalText(change.path)}` : ''}: ${terminalText(change.oldValue)} -> ${terminalText(change.newValue ?? 'removed')}`,
    );
    const explanation = explainChange(change.kind);
    lines.push(
      `      Why: ${terminalText(explanation.why)} Check: ${terminalText(explanation.check)}`,
    );
  }
  for (const item of report.needsHuman) {
    const suffix = item.path ? `.${terminalText(item.path)}` : '';
    lines.push(
      `  - [${terminalText(item.context ?? 'unspecified')}] ${terminalText(item.kind)} ${terminalText(item.resource)}${suffix}: ${terminalText(item.reason)}`,
    );
  }
  for (const item of readUnresolved(report)) {
    lines.push(
      `  - [unresolved:${terminalText(item.kind)}] ${terminalText(item.file)}:${item.line}:${item.column}: ${terminalText(item.reason)}`,
    );
  }
  for (const result of report.verification) {
    lines.push(`Verification ${terminalText(result.scenarioId)}: ${result.classification}`);
  }
  lines.push('Limits of this scan:');
  for (const limitation of report.limitations) {
    lines.push(`  - ${terminalText(limitation)}`);
  }
  return lines.join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function inlineCode(value: string): string {
  const singleLine = value.replace(/\r\n?|\n/g, ' ');
  return `<code>${escapeHtml(singleLine).replaceAll('|', '&#124;')}</code>`;
}

function markdownText(value: string): string {
  return escapeHtml(value)
    .split(/\r\n?|\n/)
    .map((line) => line.replace(/([\\`*_{}[\]()#+!|>~-])/g, '\\$1'))
    .join('<br>');
}

function changeLabel(change: ChangeRecord): string {
  const suffix = change.path ? `.${change.path}` : change.operation ? ` ${change.operation}` : '';
  return `${change.kind} ${change.resource}${suffix}`;
}

export function renderMarkdownReport(report: EvidenceReport): string {
  const counts = severityCounts(report.changes);
  const unresolved = readUnresolved(report);
  const lines = [
    '# Dokimana Breaking-Change Evidence',
    '',
    `- **Repository:** ${inlineCode(report.repository)}`,
    `- **Provider version:** ${inlineCode(report.providerVersion)}`,
    `- **Impact analysis:** **${report.impactAnalysis}**`,
    `- **Generated:** ${inlineCode(report.generatedAt)}`,
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '| --- | ---: |',
    `| Structured changes | ${report.changes.length} |`,
    `| High severity changes | ${counts.high} |`,
    `| Medium severity changes | ${counts.medium} |`,
    `| Low severity changes | ${counts.low} |`,
    `| Affected call sites | ${report.findings.length} |`,
    `| Needs human review | ${report.needsHuman.length} |`,
    `| Unresolved sites | ${unresolved.length} |`,
    `| Verification results | ${report.verification.length} |`,
    '',
    '## By severity',
    '',
  ];

  for (const severity of SEVERITIES) {
    const group = report.changes.filter((change) => severityForChange(change.kind) === severity);
    lines.push(`### ${severity} (${group.length})`, '');
    if (group.length === 0) lines.push('_None._', '');
    else {
      for (const change of group) lines.push(`- ${inlineCode(changeLabel(change))}`);
      lines.push('');
    }
  }

  lines.push('## By resource', '');
  if (report.changes.length === 0) lines.push('_No structured changes found._', '');
  else {
    for (const resource of sortedResources(report.changes)) {
      const group = report.changes.filter((change) => change.resource === resource);
      lines.push(`### ${inlineCode(resource)} (${group.length})`, '');
      for (const change of group) {
        const explanation = explainChange(change.kind);
        lines.push(
          `- ${inlineCode(changeLabel(change))} — ${markdownText(explanation.why)} ${markdownText(explanation.check)}`,
        );
      }
      lines.push('');
    }
  }

  lines.push('## Structured Changes', '');
  if (report.changes.length === 0) lines.push('_No structured changes found._', '');
  else {
    lines.push('| Context | Change | Resource | Path | Old value | New value | Evidence |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const change of report.changes) {
      lines.push(
        `| ${inlineCode(change.context ?? 'unspecified')} | ${inlineCode(change.kind)} | ${inlineCode(change.resource)} | ${inlineCode(change.path ?? '—')} | ${inlineCode(change.oldValue)} | ${inlineCode(change.newValue ?? '—')} | ${inlineCode(change.evidence)} |`,
      );
    }
  }

  lines.push('', '## Call-Site Findings', '');
  if (report.findings.length === 0) lines.push('_No impacted call sites found._');
  for (const finding of report.findings) {
    lines.push(
      `- ${inlineCode(`${finding.callSite.file}:${finding.callSite.line}:${finding.callSite.column}`)} — ${markdownText(finding.reason)} (${finding.confidence}: ${markdownText(finding.confidenceReason)})`,
    );
  }

  lines.push('', '## Needs Human Review', '');
  if (report.needsHuman.length === 0) lines.push('_No unsupported changes recorded._');
  for (const item of report.needsHuman) {
    const suffix = item.path ? `.${item.path}` : '';
    lines.push(
      `- ${inlineCode(item.context ?? 'unspecified')} · ${inlineCode(item.kind)} ${inlineCode(`${item.resource}${suffix}`)} — ${markdownText(item.reason)}`,
    );
  }

  lines.push('', '## Unresolved Sites', '');
  if (unresolved.length === 0) lines.push('_No unresolved source patterns recorded._');
  for (const item of unresolved) {
    lines.push(
      `- ${inlineCode(`${item.file}:${item.line}:${item.column}`)} ${inlineCode(item.kind)} — ${markdownText(item.reason)} (${inlineCode(item.snippet)})`,
    );
  }

  lines.push('', '## Verification', '');
  if (report.verification.length === 0) {
    lines.push('_No scenarios ran. Verification is unverified._');
  }
  for (const verification of report.verification) {
    lines.push(
      `- **${inlineCode(verification.scenarioId)}:** ${verification.classification} — ${markdownText(verification.reason)}`,
    );
  }

  lines.push('', '## Limits of this scan', '');
  if (report.limitations.length === 0) lines.push('_No limitations were recorded._');
  for (const limitation of report.limitations) lines.push(`- ${markdownText(limitation)}`);
  return `${lines.join('\n')}\n`;
}

export function assertImpactReport(value: unknown, label: string): asserts value is ImpactReport {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);
  for (const field of ['generatedAt', 'root'] as const) {
    if (typeof value[field] !== 'string' || !value[field]) {
      throw new Error(`${label} must include "${field}" as a non-empty string.`);
    }
  }
  for (const field of [
    'changes',
    'findings',
    'needsHuman',
    'unresolved',
    'unverifiedCallSiteCoverage',
  ] as const) {
    if (value[field] === undefined) value[field] = [];
    if (!Array.isArray(value[field])) throw new Error(`${label}.${field} must be an array.`);
  }
}

export function buildEvidenceReport(input: {
  repository: string;
  providerVersion: string;
  impact: ImpactReport;
  verification: VerificationResult[];
}): EvidenceReport {
  const unresolved = Array.isArray(input.impact.unresolved) ? input.impact.unresolved : [];
  return {
    generatedAt: new Date().toISOString(),
    repository: toPosixPath(input.repository),
    providerVersion: input.providerVersion,
    impactAnalysis: input.impact.findings.length > 0 ? 'static_evidence' : 'none',
    changes: input.impact.changes,
    findings: input.impact.findings.map((finding) => ({
      ...finding,
      callSite: {
        ...finding.callSite,
        file: toPosixPath(finding.callSite.file),
      },
    })),
    needsHuman: input.impact.needsHuman,
    ...(unresolved.length > 0
      ? { unresolved: unresolved.map((item) => ({ ...item, file: toPosixPath(item.file) })) }
      : {}),
    verification: input.verification,
    limitations: [
      ...input.impact.unverifiedCallSiteCoverage,
      'Live Stripe APIs and live keys are never accessed by Dokimana.',
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
