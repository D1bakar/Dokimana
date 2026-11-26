import type { EvidenceReport, ImpactReport, VerificationResult } from '../domain/types.js';

function terminalText(value: string): string {
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || (codePoint >= 127 && codePoint <= 159) ? ' ' : character;
    })
    .join('');
}

export function renderTerminalReport(report: EvidenceReport): string {
  const lines = [
    `Dokimana Evidence Report`,
    `Repository: ${terminalText(report.repository)}`,
    `Provider version: ${terminalText(report.providerVersion)}`,
    `Impact coverage: ${report.impactCoverage}`,
    `Changes: ${report.changes.length}`,
    `Affected call sites: ${report.findings.length}`,
    'Structured changes:',
  ];
  if (report.changes.length === 0) lines.push('  None');
  for (const change of report.changes) {
    lines.push(
      `  - ${terminalText(change.kind)} ${terminalText(change.resource)}${change.path ? `.${terminalText(change.path)}` : ''}: ${terminalText(change.oldValue)} -> ${terminalText(change.newValue ?? 'removed')}`,
    );
  }
  for (const result of report.verification) {
    lines.push(`Verification ${terminalText(result.scenarioId)}: ${result.classification}`);
  }
  for (const limitation of report.limitations) {
    lines.push(`Limitation: ${terminalText(limitation)}`);
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
    .map((line) => line.replace(/([\\`*_{}[\]()#+.!|>~-])/g, '\\$1'))
    .join('<br>');
}

export function renderMarkdownReport(report: EvidenceReport): string {
  const lines = [
    '# Dokimana Breaking-Change Evidence',
    '',
    `- **Repository:** ${inlineCode(report.repository)}`,
    `- **Provider version:** ${inlineCode(report.providerVersion)}`,
    `- **Impact coverage:** **${report.impactCoverage}**`,
    `- **Generated:** ${inlineCode(report.generatedAt)}`,
    '',
    '## Structured Changes',
    '',
  ];
  if (report.changes.length === 0) lines.push('_No structured changes found._');
  else {
    lines.push('| Change | Resource | Path | Old value | New value | Evidence |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const change of report.changes) {
      lines.push(
        `| ${inlineCode(change.kind)} | ${inlineCode(change.resource)} | ${inlineCode(change.path ?? '—')} | ${inlineCode(change.oldValue)} | ${inlineCode(change.newValue ?? '—')} | ${inlineCode(change.evidence)} |`,
      );
    }
  }

  lines.push('', '## Call-Site Findings', '');
  if (report.findings.length === 0) lines.push('_No impacted call sites found._');
  for (const finding of report.findings) {
    lines.push(
      `- ${inlineCode(`${finding.callSite.file}:${finding.callSite.line}:${finding.callSite.column}`)} — ${markdownText(finding.reason)} (${finding.confidence})`,
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

  lines.push('', '## Coverage and Limitations', '');
  for (const limitation of report.limitations) lines.push(`- ${markdownText(limitation)}`);
  return `${lines.join('\n')}\n`;
}

export function buildEvidenceReport(input: {
  repository: string;
  providerVersion: string;
  impact: ImpactReport;
  verification: VerificationResult[];
}): EvidenceReport {
  const coverage =
    input.impact.findings.length > 0
      ? input.impact.unverifiedCallSiteCoverage.length > 0
        ? 'partially_verified'
        : 'verified'
      : 'unverified';
  return {
    generatedAt: new Date().toISOString(),
    repository: input.repository,
    providerVersion: input.providerVersion,
    impactCoverage: coverage,
    changes: input.impact.changes,
    findings: input.impact.findings,
    verification: input.verification,
    limitations: [
      ...input.impact.unverifiedCallSiteCoverage,
      'Live Stripe APIs and live keys are never accessed by Dokimana.',
    ],
  };
}
