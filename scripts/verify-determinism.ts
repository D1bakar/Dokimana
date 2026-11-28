import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface RunResult {
  label: string;
  exitCode: number | null;
  contentSha256: string;
  root: string;
}

interface ComparisonResult {
  label: string;
  identical: boolean;
  gitDiffExitCode: number | null;
  diffOutput: string;
}

const failures: string[] = [];

function runScan(args: readonly string[]): number | null {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'scan', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.error !== undefined) failures.push(`scan could not start: ${result.error.message}`);
  if (result.status !== 0) {
    failures.push(`scan exited ${String(result.status)}: ${result.stderr.trim()}`);
  }
  return result.status;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringField(bytes: Buffer, field: string): string {
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  if (isRecord(value)) {
    const fieldValue = value[field];
    if (typeof fieldValue === 'string') return fieldValue;
  }
  throw new Error(`impact report does not contain a string ${field}.`);
}

async function readRun(label: string, path: string): Promise<RunResult> {
  const bytes = await readFile(path);
  return {
    label,
    exitCode: 0,
    contentSha256: readStringField(bytes, 'contentSha256'),
    root: readStringField(bytes, 'root'),
  };
}

async function compare(
  label: string,
  leftPath: string,
  rightPath: string,
): Promise<ComparisonResult> {
  const [left, right] = await Promise.all([readFile(leftPath), readFile(rightPath)]);
  const identical = left.equals(right);
  const diff = spawnSync('git', ['diff', '--no-index', '--', leftPath, rightPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (diff.error !== undefined) failures.push(`${label}: git diff could not start`);
  if (diff.status === null || diff.status > 1) {
    failures.push(`${label}: git diff exited ${String(diff.status)}`);
  }
  if (identical !== (diff.status === 0)) {
    failures.push(`${label}: byte comparison and git diff disagree`);
  }
  if (!identical) failures.push(`${label}: files differ`);
  return {
    label,
    identical,
    gitDiffExitCode: diff.status,
    diffOutput: identical ? '' : `${diff.stdout}${diff.stderr}`.trim(),
  };
}

const outputDirectory = await mkdtemp(join(tmpdir(), 'dokimana-determinism-'));
try {
  const repositoryPath = resolve('src/scanner/fixtures/positive');
  const repositoryPathForwardSlash = repositoryPath.replaceAll('\\', '/');
  const oldPath = resolve('fixtures/stripe-old.json');
  const newPath = resolve('fixtures/stripe-new.json');
  const common = [
    '--old',
    oldPath,
    '--new',
    newPath,
    '--old-version',
    'fixture-old',
    '--new-version',
    'fixture-new',
    '--fail-on-changes',
    'false',
  ];

  const paths = {
    impactA: join(outputDirectory, 'impact-a.json'),
    reportA: join(outputDirectory, 'report-a.md'),
    impactB: join(outputDirectory, 'impact-b.json'),
    reportB: join(outputDirectory, 'report-b.md'),
    impactForwardSlash: join(outputDirectory, 'impact-forward-slash.json'),
    reportForwardSlash: join(outputDirectory, 'report-forward-slash.md'),
  };

  const exitCodes = [
    runScan([
      '--repo',
      repositoryPath,
      '--json',
      paths.impactA,
      '--markdown',
      paths.reportA,
      ...common,
    ]),
    runScan([
      '--repo',
      repositoryPath,
      '--json',
      paths.impactB,
      '--markdown',
      paths.reportB,
      ...common,
    ]),
    runScan([
      '--repo',
      repositoryPathForwardSlash,
      '--json',
      paths.impactForwardSlash,
      '--markdown',
      paths.reportForwardSlash,
      ...common,
    ]),
  ];

  const runA = await readRun('windows-path-a', paths.impactA);
  const runB = await readRun('windows-path-b', paths.impactB);
  const runForwardSlash = await readRun('forward-slash-path', paths.impactForwardSlash);
  for (const [index, run] of [runA, runB, runForwardSlash].entries()) {
    if (run.exitCode === 0 && exitCodes[index] !== 0) {
      failures.push(`${run.label}: recorded exit code does not match the scan`);
    }
  }

  const hashes = [runA.contentSha256, runB.contentSha256, runForwardSlash.contentSha256];
  if (new Set(hashes).size !== 1) failures.push('contentSha256 differs between runs');
  const roots = [runA.root, runB.root, runForwardSlash.root];
  if (new Set(roots).size !== 1) failures.push('root differs between path styles');
  if (roots.some((root) => root.includes('\\'))) failures.push('root contains a backslash');

  const comparisons = await Promise.all([
    compare('json-same-path', paths.impactA, paths.impactB),
    compare('markdown-same-path', paths.reportA, paths.reportB),
    compare('json-forward-slash-path', paths.impactA, paths.impactForwardSlash),
    compare('markdown-forward-slash-path', paths.reportA, paths.reportForwardSlash),
  ]);

  console.log(
    JSON.stringify(
      {
        status: failures.length === 0 ? 'pass' : 'fail',
        node: process.version,
        runs: [runA, runB, runForwardSlash].map((run, index) => ({
          ...run,
          exitCode: exitCodes[index] ?? null,
        })),
        comparisons,
        failures,
      },
      null,
      2,
    ),
  );
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
