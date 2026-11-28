import { analyzeArchitecture, formatArchitectureReport } from './architecture.js';

type CheckMode = 'all' | 'cycles' | 'dead-code';

const mode = parseMode(process.argv[2]);
if (mode === undefined) {
  console.error('Expected one of: all, cycles, dead-code.');
  process.exitCode = 1;
} else {
  const report = analyzeArchitecture();
  const lines = selectLines(report, mode);
  if (lines.length > 0) {
    for (const line of lines) console.error(line);
    process.exitCode = 1;
  } else {
    console.log(`Architecture check passed: ${mode} (no issues found).`);
  }
}

function parseMode(value: string | undefined): CheckMode | undefined {
  if (value === undefined || value === 'all') return 'all';
  if (value === 'cycles' || value === 'dead-code') return value;
  return undefined;
}

function selectLines(report: ReturnType<typeof analyzeArchitecture>, mode: CheckMode): string[] {
  const lines = formatArchitectureReport(report);
  if (mode === 'all') return lines;
  if (mode === 'cycles') {
    return lines.filter((line) => line.includes(' import cycle: '));
  }
  return lines.filter((line) => line.includes(' unused export: '));
}
