import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RepoScanner } from '../src/scanner/repo-scanner.js';
import type { ChangeRecord, UnresolvedKind } from '../src/domain/types.js';

interface TruthFinding {
  file: string;
  fieldPath: string;
  operation: string;
  kind: string;
  confidence: 'high' | 'medium' | 'low';
}

interface TruthUnresolved {
  file: string;
  kind: UnresolvedKind;
  reason: string;
}

interface BenchmarkTruth {
  findings: TruthFinding[];
  unresolved: TruthUnresolved[];
}

interface ManifestEntry {
  name: string;
  description: string;
}

interface BenchmarkProjectResult {
  name: string;
  expectedFindings: number;
  actualFindings: number;
  exactFindingMatches: number;
  missingFindings: string[];
  extraFindings: string[];
  expectedUnresolved: number;
  actualUnresolved: number;
  exactUnresolvedMatches: number;
}

const source = {
  kind: 'openapi' as const,
  provider: 'stripe' as const,
  version: 'accuracy-fixture',
  checksumSha256: 'accuracy-fixture',
};

const manifestPath = resolve('benchmarks/manifest.json');
const manifestValue: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
const manifest = parseManifest(manifestValue);

const projects: BenchmarkProjectResult[] = [];
for (const entry of manifest) {
  const truthPath = resolve('benchmarks/projects', entry.name, 'truth.json');
  const truthValue: unknown = JSON.parse(await readFile(truthPath, 'utf8'));
  const truth = parseTruth(truthValue, truthPath);
  const changes = truth.findings.map((finding, index) => makeChange(finding.fieldPath, index));
  const report = await new RepoScanner().scan(resolve('benchmarks/projects', entry.name), changes);

  const expected = truth.findings
    .map((finding) => findingKey(finding.file, finding.fieldPath))
    .sort(compareStrings);
  const actual = report.findings
    .map((finding) => findingKey(finding.callSite.file, finding.callSite.fieldPath.join('.')))
    .sort(compareStrings);
  const expectedUnresolved = truth.unresolved
    .map((item) => `${item.file}|${item.kind}`)
    .sort(compareStrings);
  const actualUnresolved = report.unresolved
    .map((item) => `${item.file}|${item.kind}`)
    .sort(compareStrings);

  projects.push({
    name: entry.name,
    expectedFindings: expected.length,
    actualFindings: actual.length,
    exactFindingMatches: expected.filter((key) => actual.includes(key)).length,
    missingFindings: expected.filter((key) => !actual.includes(key)),
    extraFindings: actual.filter((key) => !expected.includes(key)),
    expectedUnresolved: expectedUnresolved.length,
    actualUnresolved: actualUnresolved.length,
    exactUnresolvedMatches: expectedUnresolved.filter((key) => actualUnresolved.includes(key))
      .length,
  });
}

console.log(JSON.stringify({ projects }, null, 2));

function makeChange(path: string, index: number): ChangeRecord {
  return {
    id: `accuracy_change_${index}`,
    provider: 'stripe',
    kind: 'field_removed',
    context: 'schema',
    resource: 'Customer',
    path,
    oldValue: 'fixture',
    breaking: true,
    source,
    evidence: 'Accuracy benchmark truth file',
  };
}

function findingKey(file: string, fieldPath: string): string {
  return `${file.replaceAll('\\', '/')}|${fieldPath}`;
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function parseManifest(value: unknown): ManifestEntry[] {
  if (!Array.isArray(value)) throw new Error('benchmarks/manifest.json must contain an array.');
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`benchmarks/manifest.json entry ${index} must be an object.`);
    }
    const name = requiredString(entry.name, `benchmarks/manifest.json entry ${index} name`);
    const description = requiredString(
      entry.description,
      `benchmarks/manifest.json entry ${index} description`,
    );
    return { name, description };
  });
}

function parseTruth(value: unknown, label: string): BenchmarkTruth {
  if (!isRecord(value)) throw new Error(`${label} must contain a JSON object.`);
  if (!Array.isArray(value.findings) || !Array.isArray(value.unresolved)) {
    throw new Error(`${label} must include findings and unresolved arrays.`);
  }

  const findings = value.findings.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`${label} finding ${index} must be an object.`);
    return {
      file: requiredString(entry.file, `${label} finding ${index} file`),
      fieldPath: requiredString(entry.fieldPath, `${label} finding ${index} fieldPath`),
      operation: requiredString(entry.operation, `${label} finding ${index} operation`),
      kind: requiredString(entry.kind, `${label} finding ${index} kind`),
      confidence: parseConfidence(entry.confidence, `${label} finding ${index} confidence`),
    };
  });

  const unresolved = value.unresolved.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`${label} unresolved ${index} must be an object.`);
    return {
      file: requiredString(entry.file, `${label} unresolved ${index} file`),
      kind: parseUnresolvedKind(entry.kind, `${label} unresolved ${index} kind`),
      reason: requiredString(entry.reason, `${label} unresolved ${index} reason`),
    };
  });

  return { findings, unresolved };
}

function parseConfidence(value: unknown, label: string): TruthFinding['confidence'] {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  throw new Error(`${label} must be high, medium, or low.`);
}

function parseUnresolvedKind(value: unknown, label: string): UnresolvedKind {
  if (
    value === 'dynamic_call' ||
    value === 'rest_call' ||
    value === 'spread_argument' ||
    value === 'unresolved_import' ||
    value === 'unknown_type' ||
    value === 'dynamic_webhook_case'
  ) {
    return value;
  }
  throw new Error(`${label} is not a supported unresolved kind.`);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
