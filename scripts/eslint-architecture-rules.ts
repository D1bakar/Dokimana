import { relative, resolve, sep } from 'node:path';
import { analyzeArchitecture } from './architecture.js';

interface ReportLocation {
  line: number;
  column: number;
}

interface ReportDescriptor {
  loc: ReportLocation;
  message: string;
}

interface RuleContext {
  filename: string;
  report(descriptor: ReportDescriptor): void;
}

interface RuleListener {
  Program(): void;
}

interface RuleModuleLike {
  meta: { type: 'problem' };
  create(context: RuleContext): RuleListener;
}

const report = analyzeArchitecture();

export const architectureRules: Readonly<Record<string, RuleModuleLike>> = {
  'no-import-cycles': {
    meta: { type: 'problem' },
    create(context): RuleListener {
      return {
        Program(): void {
          const file = toRepoPath(context.filename);
          for (const cycle of report.cycles) {
            if (cycle.file !== file) continue;
            context.report({
              loc: { line: cycle.line, column: cycle.column },
              message: `Import cycle: ${cycle.chain.join(' -> ')}`,
            });
          }
        },
      };
    },
  },
  'no-unused-exports': {
    meta: { type: 'problem' },
    create(context): RuleListener {
      return {
        Program(): void {
          const file = toRepoPath(context.filename);
          for (const item of report.unusedExports) {
            if (item.file !== file) continue;
            context.report({
              loc: { line: item.line, column: item.column },
              message: `Export "${item.name}" is not referenced by any checked file.`,
            });
          }
        },
      };
    },
  },
};

function toRepoPath(filename: string): string {
  return relative(process.cwd(), resolve(filename)).split(sep).join('/');
}
