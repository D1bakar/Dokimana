import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface PerformanceBudget {
  workload: string;
  oldPath: string;
  newPath: string;
  iterations: number;
  oldBytes: number;
  newBytes: number;
  changes: number;
  maxTotalMs: number;
  maxAverageMs: number;
  provenance: string;
}

interface BenchmarkMeasurement {
  iterations: number;
  oldBytes: number;
  newBytes: number;
  changes: number;
  totalMs: number;
  averageMs: number;
}

const budgetPath = resolve('config/performance-budget.json');
const budgetValue: unknown = JSON.parse(await readFile(budgetPath, 'utf8'));
if (!isRecord(budgetValue)) throw new Error(`${budgetPath} must contain a JSON object.`);
const budget = budgetValue as unknown as PerformanceBudget;

const result = spawnSync(
  process.execPath,
  [
    resolve('node_modules/tsx/dist/cli.mjs'),
    resolve('scripts/benchmark.ts'),
    resolve(budget.oldPath),
    resolve(budget.newPath),
    String(budget.iterations),
  ],
  { encoding: 'utf8' },
);

if (result.error !== undefined) throw result.error;
if (result.status !== 0) {
  const detail = `${result.stdout}${result.stderr}`.trim();
  throw new Error(`Benchmark failed with exit code ${String(result.status)}: ${detail}`);
}

const measurementValue: unknown = JSON.parse(result.stdout.trim());
if (!isRecord(measurementValue)) throw new Error('Benchmark output must be a JSON object.');
const measurement = measurementValue as unknown as BenchmarkMeasurement;

const failures: string[] = [];
if (measurement.iterations !== budget.iterations) {
  failures.push(
    `iterations changed: expected ${String(budget.iterations)}, got ${String(measurement.iterations)}`,
  );
}
if (measurement.oldBytes !== budget.oldBytes) {
  failures.push(
    `old fixture bytes changed: expected ${String(budget.oldBytes)}, got ${String(measurement.oldBytes)}`,
  );
}
if (measurement.newBytes !== budget.newBytes) {
  failures.push(
    `new fixture bytes changed: expected ${String(budget.newBytes)}, got ${String(measurement.newBytes)}`,
  );
}
if (measurement.changes !== budget.changes) {
  failures.push(
    `change count changed: expected ${String(budget.changes)}, got ${String(measurement.changes)}`,
  );
}
if (measurement.totalMs > budget.maxTotalMs) {
  failures.push(
    `totalMs ${String(measurement.totalMs)} exceeds budget ${String(budget.maxTotalMs)}`,
  );
}
if (measurement.averageMs > budget.maxAverageMs) {
  failures.push(
    `averageMs ${String(measurement.averageMs)} exceeds budget ${String(budget.maxAverageMs)}`,
  );
}

console.log(
  JSON.stringify(
    {
      status: failures.length === 0 ? 'pass' : 'fail',
      workload: budget.workload,
      provenance: budget.provenance,
      measurement,
      budget: {
        iterations: budget.iterations,
        maxTotalMs: budget.maxTotalMs,
        maxAverageMs: budget.maxAverageMs,
      },
      failures,
    },
    null,
    2,
  ),
);

if (failures.length > 0) process.exitCode = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
