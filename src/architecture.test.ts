import { describe, expect, it } from 'vitest';
import {
  analyzeArchitecture,
  formatArchitectureReport,
  type ArchitectureReport,
} from '../scripts/architecture.js';

describe('architecture checks', () => {
  it('formats cycle and unused-export findings deterministically', () => {
    const report: ArchitectureReport = {
      cycles: [
        {
          file: 'src/a.ts',
          line: 2,
          column: 3,
          chain: ['src/a.ts', 'src/b.ts', 'src/a.ts'],
        },
      ],
      unusedExports: [
        {
          file: 'src/b.ts',
          line: 4,
          column: 5,
          name: 'unused',
        },
      ],
    };

    expect(formatArchitectureReport(report)).toEqual([
      'src/a.ts:2:3 import cycle: src/a.ts -> src/b.ts -> src/a.ts',
      'src/b.ts:4:5 unused export: unused',
    ]);
  });

  it('finds no cycles or unreferenced exports in the checked source tree', () => {
    const report = analyzeArchitecture();

    expect(report.cycles).toEqual([]);
    expect(report.unusedExports).toEqual([]);
  });
});
