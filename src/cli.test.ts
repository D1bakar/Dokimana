import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('scan command', () => {
  it('writes JSON impact data and a Markdown evidence report', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'dokimana-scan-'));
    const impactFile = join(outputDirectory, 'impact.json');
    const reportFile = join(outputDirectory, 'evidence.md');

    try {
      const args = [
        '--import',
        'tsx',
        resolve('src/cli.ts'),
        'scan',
        '--repo',
        resolve('src/scanner/fixtures/positive'),
        '--old',
        resolve('fixtures/stripe-old.json'),
        '--new',
        resolve('fixtures/stripe-new.json'),
        '--old-version',
        'fixture-old',
        '--new-version',
        'fixture-new',
        '--json',
        impactFile,
        '--markdown',
        reportFile,
        '--fail-on-changes',
        'true',
      ];
      const result = spawnSync(process.execPath, args, {
        cwd: process.cwd(),
        encoding: 'utf8',
      });

      expect(result.status, result.stderr || result.error?.message).toBe(1);
      expect(result.stderr).toContain('Failing scan because 1 structural change(s) were found.');

      const impact = JSON.parse(await readFile(impactFile, 'utf8')) as {
        findings: unknown[];
      };
      expect(impact.findings.length).toBeGreaterThan(0);

      const report = await readFile(reportFile, 'utf8');
      expect(report).toContain('# Dokimana Breaking-Change Evidence');
      expect(report).toContain('## Call-Site Findings');
      expect(report).toContain('No scenarios ran. Verification is unverified.');

      args[args.length - 1] = 'false';
      const allowedResult = spawnSync(process.execPath, args, {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      expect(allowedResult.status, allowedResult.stderr || allowedResult.error?.message).toBe(0);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 15000);
});
