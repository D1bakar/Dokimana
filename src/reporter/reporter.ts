import type { EvidenceReport, ImpactReport, Patch, VerificationResult } from '../domain/types.js';

export function renderTerminalReport(report: EvidenceReport): string {
  const lines = [
    `ApiProof Evidence Report`,
    `Repository: ${report.repository}`,
    `Provider version: ${report.providerVersion}`,
    `Impact coverage: ${report.impactCoverage}`,
    `Changes: ${report.changes.length}`,
    `Affected call sites: ${report.findings.length}`,
    `Ready patches: ${report.patches.filter((patch) => patch.status === 'ready').length}`,
    `Needs-human patches: ${report.patches.filter((patch) => patch.status === 'needs_human').length}`,
  ];
  for (const result of report.verification) {
    lines.push(`Verification ${result.scenarioId}: ${result.classification}`);
  }
  for (const limitation of report.limitations) lines.push(`Limitation: ${limitation}`);
  return lines.join('\n');
}

export function renderMarkdownReport(report: EvidenceReport): string {
  const lines = [
    '# ApiProof Breaking-Change Evidence',
    '',
    `- **Repository:** ${report.repository}`,
    `- **Provider version:** ${report.providerVersion}`,
    `- **Impact coverage:** **${report.impactCoverage}**`,
    `- **Generated:** ${report.generatedAt}`,
    '',
    '## Call-Site Findings',
    '',
  ];
  if (report.findings.length === 0) lines.push('_No impacted call sites found._');
  for (const finding of report.findings) {
    lines.push(
      `- ${finding.callSite.file}:${finding.callSite.line} — ${finding.reason} (${finding.confidence})`,
    );
  }

  lines.push('', '## Patches', '');
  if (report.patches.length === 0) lines.push('_No patches generated._');
  for (const patch of report.patches) {
    lines.push(`### ${patch.status === 'ready' ? 'Ready' : 'Needs human'}: ${patch.id}`);
    lines.push('');
    lines.push(patch.explanation);
  }

  lines.push('', '## Verification', '');
  if (report.verification.length === 0) {
    lines.push('_No scenarios ran. Verification is unverified._');
  }
  for (const verification of report.verification) {
    lines.push(
      `- **${verification.scenarioId}:** ${verification.classification} — ${verification.reason}`,
    );
  }

  lines.push('', '## Coverage and Limitations', '');
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  return `${lines.join('\n')}\n`;
}

export function buildEvidenceReport(input: {
  repository: string;
  providerVersion: string;
  impact: ImpactReport;
  patches: Patch[];
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
    patches: input.patches,
    verification: input.verification,
    limitations: [
      ...input.impact.unverifiedCallSiteCoverage,
      'Live Stripe APIs and live keys are never accessed by ApiProof.',
    ],
  };
}
