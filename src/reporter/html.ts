import type {
  ChangeRecord,
  EvidenceReport,
  ImpactFinding,
  NeedsHumanItem,
  UnresolvedItem,
  VerificationResult,
} from '../domain/types.js';
import type { ChangeSeverity } from './explanations.js';
import { severityForChange } from './explanations.js';

type ItemStatus = 'change' | 'finding' | 'needs-human' | 'unresolved';

interface HtmlField {
  label: string;
  value: string;
  block?: boolean;
}

interface HtmlItem {
  key: string;
  status: ItemStatus;
  severity: ChangeSeverity;
  resource: string;
  title: string;
  location: string;
  fields: HtmlField[];
}

const SEVERITY_RANK: Record<ChangeSeverity, number> = { high: 3, medium: 2, low: 1 };
const SEVERITIES: ChangeSeverity[] = ['high', 'medium', 'low'];
const STATUSES: ItemStatus[] = ['change', 'finding', 'needs-human', 'unresolved'];
const STATUS_LABELS: Record<ItemStatus, string> = {
  change: 'change',
  finding: 'finding',
  'needs-human': 'needs human',
  unresolved: 'unresolved',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function resourceLabel(value: string): string {
  return value.trim() === '' ? '(unspecified)' : value;
}

function readUnresolved(report: EvidenceReport): UnresolvedItem[] {
  const value = report.unresolved;
  return Array.isArray(value) ? value : [];
}

function sortedChanges(changes: ChangeRecord[]): ChangeRecord[] {
  return [...changes].sort(
    (left, right) =>
      compareStrings(left.resource, right.resource) ||
      compareStrings(left.kind, right.kind) ||
      compareStrings(left.id, right.id) ||
      compareStrings(left.oldValue, right.oldValue),
  );
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

function unresolvedSeverity(
  item: UnresolvedItem,
  changesById: Map<string, ChangeRecord>,
): ChangeSeverity {
  let severity: ChangeSeverity = 'medium';
  for (const id of item.relatedChangeIds) {
    const change = changesById.get(id);
    if (!change) continue;
    const candidate = severityForChange(change.kind);
    if (SEVERITY_RANK[candidate] > SEVERITY_RANK[severity]) severity = candidate;
  }
  return severity;
}

function renderFields(fields: HtmlField[]): string {
  const rows = fields.map((field) => {
    const value = field.block
      ? `<pre class="value-block">${escapeHtml(field.value)}</pre>`
      : `<span class="value">${escapeHtml(field.value)}</span>`;
    return `<div class="field"><dt>${escapeHtml(field.label)}</dt><dd>${value}</dd></div>`;
  });
  return `<dl class="fields">${rows.join('')}</dl>`;
}

function renderItem(item: HtmlItem): string {
  return (
    `<details class="item" data-item="true" data-key="${escapeHtml(item.key)}"` +
    ` data-status="${escapeHtml(item.status)}" data-severity="${escapeHtml(item.severity)}"` +
    ` data-resource="${escapeHtml(item.resource)}">` +
    `<summary><span class="badge ${escapeHtml(item.severity)}">${escapeHtml(item.severity)}</span>` +
    `<strong>${escapeHtml(item.title)}</strong>` +
    `<span class="meta">${escapeHtml(item.location)}</span></summary>` +
    `${renderFields(item.fields)}</details>`
  );
}

function renderRow(item: HtmlItem): string {
  return (
    `<tr data-row="true" data-key="${escapeHtml(item.key)}"` +
    ` data-status="${escapeHtml(item.status)}" data-severity="${escapeHtml(item.severity)}"` +
    ` data-resource="${escapeHtml(item.resource)}">` +
    `<td><span class="badge ${escapeHtml(item.severity)}">${escapeHtml(item.severity)}</span></td>` +
    `<td>${escapeHtml(item.resource)}</td>` +
    `<td>${escapeHtml(STATUS_LABELS[item.status])}</td>` +
    `<td class="mono">${escapeHtml(item.location)}</td>` +
    `<td>${escapeHtml(item.title)}</td></tr>`
  );
}

function renderSeverityGroups(items: HtmlItem[]): string {
  return SEVERITIES.map((severity) => {
    const group = items.filter((item) => item.severity === severity);
    const heading = `${severity} (${String(group.length)})`;
    const body =
      group.length === 0
        ? '<p class="empty">No items in this group.</p>'
        : group.map(renderItem).join('');
    return `<section class="group"><h3>${escapeHtml(heading)}</h3>${body}</section>`;
  }).join('');
}

function renderResourceGroups(items: HtmlItem[]): string {
  const byResource = new Map<string, HtmlItem[]>();
  for (const item of items) {
    const group = byResource.get(item.resource) ?? [];
    group.push(item);
    byResource.set(item.resource, group);
  }
  const names = [...byResource.keys()].sort(compareStrings);
  if (names.length === 0) return '<p class="empty">No resources were recorded.</p>';
  return names
    .map((name) => {
      const group = byResource.get(name) ?? [];
      const heading = `${name} (${String(group.length)})`;
      return `<section class="group"><h3>${escapeHtml(heading)}</h3>${group
        .map(renderItem)
        .join('')}</section>`;
    })
    .join('');
}

function renderVerification(results: VerificationResult[]): string {
  if (results.length === 0) return '<p class="empty">No verification scenarios were recorded.</p>';
  return results
    .map((result) => {
      const fields: HtmlField[] = [
        { label: 'Scenario id', value: result.scenarioId },
        { label: 'Classification', value: result.classification },
        { label: 'Reason', value: result.reason, block: true },
        { label: 'Isolated runner', value: String(result.container.isolated) },
        { label: 'Network', value: result.container.network },
        { label: 'Secrets', value: result.container.secrets },
        { label: 'Executed at', value: result.executedAt ?? '' },
        {
          label: 'Normalized difference',
          value: result.normalizedDifference?.join('\n') ?? '',
          block: true,
        },
        { label: 'Old output', value: JSON.stringify(result.oldOutput ?? null), block: true },
        { label: 'New output', value: JSON.stringify(result.newOutput ?? null), block: true },
      ];
      return (
        `<details class="verification"><summary>${escapeHtml(result.scenarioId)} — ${escapeHtml(result.classification)}</summary>` +
        `${renderFields(fields)}</details>`
      );
    })
    .join('');
}

function renderLimits(limitations: string[]): string {
  if (limitations.length === 0) return '<p class="empty">No limitations were recorded.</p>';
  return `<ul>${limitations.map((limit) => `<li>${escapeHtml(limit)}</li>`).join('')}</ul>`;
}

const STYLES = `
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0 auto; padding: 1.5rem; max-width: 70rem; line-height: 1.5; }
h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
h2 { font-size: 1.2rem; margin-top: 2rem; border-bottom: 1px solid #8886; padding-bottom: 0.25rem; }
h3 { font-size: 1rem; margin: 1rem 0 0.5rem; }
.meta-grid { display: grid; gap: 0.5rem 1.5rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
.meta-grid div, .field { display: grid; grid-template-columns: 10rem 1fr; gap: 0.5rem; }
dt { font-weight: 600; }
dd { margin: 0; overflow-wrap: anywhere; }
.counts { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; list-style: none; padding: 0; }
.filters { display: flex; flex-wrap: wrap; gap: 0.75rem 1.5rem; align-items: end; }
.filters label { display: grid; gap: 0.25rem; }
.visible { font-weight: 600; }
table { border-collapse: collapse; width: 100%; }
caption { text-align: left; padding: 0.5rem 0; font-weight: 600; }
th, td { border: 1px solid #8886; padding: 0.35rem 0.5rem; text-align: left; vertical-align: top; }
th { background: #8882; }
.badge { display: inline-block; border: 1px solid currentColor; border-radius: 0.75rem; padding: 0 0.45rem; font-size: 0.75rem; font-weight: 700; }
.badge.high { color: #a11; }
.badge.medium { color: #a60; }
.badge.low { color: #268; }
.group { margin: 0.5rem 0; border: 1px solid #8884; border-radius: 0.4rem; padding: 0.5rem 0.75rem; }
.item, .verification { margin: 0.4rem 0; border-left: 3px solid #8886; padding: 0.35rem 0.6rem; }
.item summary, .verification summary { cursor: pointer; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; }
.item .meta { opacity: 0.75; }
.fields { margin: 0.6rem 0 0.25rem; }
.field { padding: 0.15rem 0; }
.value-block { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; background: #8882; padding: 0.35rem; }
.mono { font-family: ui-monospace, monospace; }
.empty { opacity: 0.75; font-style: italic; }
[hidden] { display: none !important; }
`;

const FILTER_SCRIPT = `(function () {
  var dataNode = document.getElementById('dokimana-report-data');
  var data = { total: 0 };
  try {
    data = JSON.parse(dataNode && dataNode.textContent ? dataNode.textContent : '{}');
  } catch {
    data = { total: 0 };
  }
  var severity = document.getElementById('filter-severity');
  var resource = document.getElementById('filter-resource');
  var status = document.getElementById('filter-status');
  var visible = document.getElementById('visible-count');
  var entries = Array.prototype.slice.call(document.querySelectorAll('[data-item], [data-row]'));
  function matches(entry) {
    return (severity.value === 'all' || entry.getAttribute('data-severity') === severity.value)
      && (resource.value === 'all' || entry.getAttribute('data-resource') === resource.value)
      && (status.value === 'all' || entry.getAttribute('data-status') === status.value);
  }
  function apply() {
    var count = 0;
    for (var index = 0; index < entries.length; index += 1) {
      var entry = entries[index];
      var show = matches(entry);
      entry.hidden = !show;
      if (show && entry.hasAttribute('data-row')) count += 1;
    }
    if (visible) visible.textContent = String(count) + ' of ' + String(data.total || 0) + ' items shown';
  }
  severity.addEventListener('change', apply);
  resource.addEventListener('change', apply);
  status.addEventListener('change', apply);
  apply();
})();`;

export function renderHtml(report: EvidenceReport): string {
  const changesById = new Map<string, ChangeRecord>(
    report.changes.map((change) => [change.id, change]),
  );
  const unresolved = readUnresolved(report);
  const items: HtmlItem[] = [];

  for (const [index, change] of sortedChanges(report.changes).entries()) {
    const label = resourceLabel(change.resource);
    items.push({
      key: `c-${String(index)}`,
      status: 'change',
      severity: severityForChange(change.kind),
      resource: label,
      title: `${change.kind} on ${label}`,
      location: change.path ?? change.operation ?? change.eventType ?? 'provider specification',
      fields: [
        { label: 'Change id', value: change.id },
        { label: 'Provider', value: change.provider },
        { label: 'Kind', value: change.kind },
        { label: 'Context', value: change.context ?? '' },
        { label: 'Resource', value: change.resource },
        { label: 'Path', value: change.path ?? '' },
        { label: 'Operation', value: change.operation ?? '' },
        { label: 'Event type', value: change.eventType ?? '' },
        { label: 'Breaking', value: String(change.breaking) },
        { label: 'Old value', value: change.oldValue, block: true },
        { label: 'New value', value: change.newValue ?? '', block: true },
        { label: 'Evidence', value: change.evidence, block: true },
      ],
    });
  }

  for (const [index, finding] of sortedFindings(report.findings).entries()) {
    const change = changesById.get(finding.changeId);
    const site = finding.callSite;
    items.push({
      key: `f-${String(index)}`,
      status: 'finding',
      severity: finding.confidence,
      resource: change ? resourceLabel(change.resource) : '(unlinked)',
      title: `Finding — ${site.operation}`,
      location: `${site.file}:${String(site.line)}:${String(site.column)}`,
      fields: [
        { label: 'Change id', value: finding.changeId },
        { label: 'Change kind', value: change?.kind ?? '' },
        { label: 'Context', value: change?.context ?? '' },
        { label: 'Resource', value: change?.resource ?? '' },
        { label: 'Operation', value: site.operation },
        { label: 'OpenAPI operation', value: site.openApiOperation ?? '' },
        { label: 'Field path', value: site.fieldPath.join('.') },
        { label: 'Call site kind', value: site.kind },
        { label: 'Confidence', value: finding.confidence },
        { label: 'Reason', value: finding.reason, block: true },
        { label: 'Confidence reason', value: finding.confidenceReason, block: true },
        { label: 'Snippet', value: site.snippet, block: true },
        { label: 'Evidence', value: change?.evidence ?? '', block: true },
      ],
    });
  }

  for (const [index, item] of sortedNeedsHuman(report.needsHuman).entries()) {
    const change = changesById.get(item.changeId);
    items.push({
      key: `n-${String(index)}`,
      status: 'needs-human',
      severity: severityForChange(item.kind),
      resource: resourceLabel(item.resource),
      title: `Needs human — ${item.kind}`,
      location: item.path ?? item.resource,
      fields: [
        { label: 'Change id', value: item.changeId },
        { label: 'Kind', value: item.kind },
        { label: 'Context', value: item.context ?? '' },
        { label: 'Resource', value: item.resource },
        { label: 'Path', value: item.path ?? '' },
        { label: 'Reason', value: item.reason, block: true },
        { label: 'Operation', value: change?.operation ?? '' },
        { label: 'Evidence', value: change?.evidence ?? '', block: true },
      ],
    });
  }

  for (const [index, item] of sortedUnresolved(unresolved).entries()) {
    items.push({
      key: `u-${String(index)}`,
      status: 'unresolved',
      severity: unresolvedSeverity(item, changesById),
      resource: '(unresolved)',
      title: `Unresolved — ${item.kind}`,
      location: `${item.file}:${String(item.line)}:${String(item.column)}`,
      fields: [
        { label: 'Kind', value: item.kind },
        { label: 'Snippet', value: item.snippet, block: true },
        { label: 'Reason', value: item.reason, block: true },
        { label: 'Related change ids', value: item.relatedChangeIds.join(', ') },
      ],
    });
  }

  const counts = {
    changes: report.changes.length,
    findings: report.findings.length,
    needsHuman: report.needsHuman.length,
    unresolved: unresolved.length,
  };
  const resourceNames = [...new Set(items.map((item) => item.resource))].sort(compareStrings);
  const embeddedData = JSON.stringify({
    total: items.length,
    counts,
    repository: report.repository,
    providerVersion: report.providerVersion,
    impactAnalysis: report.impactAnalysis,
    contentSha256: report.contentSha256,
    limitations: report.limitations,
    resources: resourceNames,
  }).replaceAll('<', '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dokimana Evidence Report</title>
<style>${STYLES}</style>
</head>
<body>
<header>
<h1>Dokimana Evidence Report</h1>
<dl class="meta-grid">
<div><dt>Repository</dt><dd>${escapeHtml(report.repository)}</dd></div>
<div><dt>Provider version</dt><dd>${escapeHtml(report.providerVersion)}</dd></div>
<div><dt>Impact analysis</dt><dd>${escapeHtml(report.impactAnalysis)}</dd></div>
<div><dt>Content SHA-256</dt><dd>${escapeHtml(report.contentSha256)}</dd></div>
</dl>
</header>
<section id="summary">
<h2>Summary</h2>
<ul class="counts">
<li><strong>${escapeHtml(String(counts.changes))}</strong> changes</li>
<li><strong>${escapeHtml(String(counts.findings))}</strong> findings</li>
<li><strong>${escapeHtml(String(counts.needsHuman))}</strong> needing human review</li>
<li><strong>${escapeHtml(String(counts.unresolved))}</strong> unresolved</li>
<li><strong>${escapeHtml(String(report.verification.length))}</strong> verification results</li>
</ul>
<div class="filters">
<label>Severity <select id="filter-severity"><option value="all">All severities</option>${SEVERITIES.map(
    (severity) => `<option value="${escapeHtml(severity)}">${escapeHtml(severity)}</option>`,
  ).join('')}</select></label>
<label>Resource <select id="filter-resource"><option value="all">All resources</option>${resourceNames
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join('')}</select></label>
<label>Status <select id="filter-status"><option value="all">All statuses</option>${STATUSES.map(
    (status) =>
      `<option value="${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status])}</option>`,
  ).join('')}</select></label>
</div>
<p class="visible" id="visible-count" aria-live="polite"></p>
<table>
<caption>Items</caption>
<thead><tr><th>Severity</th><th>Resource</th><th>Status</th><th>Location</th><th>Detail</th></tr></thead>
<tbody>${
    items.length === 0
      ? '<tr><td colspan="5">No items were recorded.</td></tr>'
      : items.map(renderRow).join('')
  }</tbody>
</table>
</section>
<section id="by-severity">
<h2>By severity</h2>
${renderSeverityGroups(items)}
</section>
<section id="by-resource">
<h2>By resource</h2>
${renderResourceGroups(items)}
</section>
<section id="verification">
<h2>Verification</h2>
${renderVerification(report.verification)}
</section>
<section id="limits">
<h2>Coverage and limitations</h2>
${renderLimits(report.limitations)}
</section>
<script type="application/json" id="dokimana-report-data">${embeddedData}</script>
<script>${FILTER_SCRIPT}</script>
</body>
</html>
`;
}
