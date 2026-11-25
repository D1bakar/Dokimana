import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cliPath = resolve('src/cli.ts');
const scenarioPath = resolve('src/verifier/fixtures/scenario.json');

describe('verify command', () => {
  it('writes an explicit could_not_run result instead of claiming verification', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'apiproof-verify-'));
    const resultPath = join(outputDirectory, 'verification.json');

    try {
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          cliPath,
          'verify',
          '--repo',
          process.cwd(),
          '--scenario',
          scenarioPath,
          '--json',
          resultPath,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: { PATH: process.env.PATH ?? '' },
        },
      );

      expect(result.status, result.stderr || result.error?.message).toBe(1);
      expect(result.stdout).toContain('"classification":"could_not_run"');

      const verification = JSON.parse(await readFile(resultPath, 'utf8')) as {
        classification: string;
        container: { isolated: boolean; network: string; secrets: string };
      };
      expect(verification.classification).toBe('could_not_run');
      expect(verification.container).toEqual({
        isolated: false,
        network: 'not_run',
        secrets: 'none',
      });
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 15000);

  it('refuses live keys before writing a verification result', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'apiproof-verify-'));
    const resultPath = join(outputDirectory, 'verification.json');
    const fakeLiveKey = 'sk_live_synthetic_test_value';

    try {
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          cliPath,
          'verify',
          '--repo',
          process.cwd(),
          '--scenario',
          scenarioPath,
          '--json',
          resultPath,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: { PATH: process.env.PATH ?? '', STRIPE_SECRET_KEY: fakeLiveKey },
        },
      );

      expect(result.status, result.stderr || result.error?.message).toBe(1);
      expect(result.stderr).toContain('Live Stripe secret keys are forbidden.');
      expect(result.stderr).not.toContain(fakeLiveKey);
      await expect(readFile(resultPath, 'utf8')).rejects.toThrow();
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 15000);
});
