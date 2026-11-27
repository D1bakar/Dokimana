import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Scenario } from '../domain/types.js';
import {
  createCommandExecutor,
  STRIPE_MOCK_IMAGE,
  STRIPE_MOCK_LIMITATION,
  StripeMockVerifier,
} from './stripe-mock-runner.js';

const dockerCommand = process.platform === 'win32' ? 'docker.cmd' : 'docker';
const executor = createCommandExecutor();

function canRunIsolatedStripeMock(): boolean {
  try {
    const version = spawnSync(dockerCommand, ['version', '--format', '{{.Server.Version}}'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 3_000,
    });
    if (version.error !== undefined || version.status !== 0 || !version.stdout?.trim()) {
      return false;
    }
    const image = spawnSync(dockerCommand, ['image', 'inspect', STRIPE_MOCK_IMAGE], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 3_000,
    });
    return image.error === undefined && image.status === 0;
  } catch {
    return false;
  }
}

// Skips cleanly without Docker or the cached image; no network is used.
const available = canRunIsolatedStripeMock();

describe.skipIf(!available)('stripe-mock integration', () => {
  const scenario: Scenario = {
    id: 'fixture-customer-retrieve',
    name: 'Fixture customer retrieve',
    description: 'One small request sequence against the repository fixture specs.',
    apiVersion: '2025-01-01',
    operation: 'customers.retrieve',
    input: {
      requests: [
        {
          name: 'retrieve-customer',
          method: 'GET',
          path: '/v1/customers/cus_fixture',
        },
      ],
    },
  };

  it('executes a request sequence against both fixture specs inside isolated containers', async () => {
    const verifier = new StripeMockVerifier({
      oldSpecPath: resolve('src/diff/fixtures/stripe-real-old.json'),
      newSpecPath: resolve('src/diff/fixtures/stripe-real-new.json'),
      commandExecutor: executor,
      timeoutSeconds: 30,
    });

    const result = await verifier.verify(scenario);

    expect(result.classification).not.toBe('could_not_run');
    expect(result.classification).toMatch(
      /^(equivalent|intentionally_different|unexplained_difference)$/,
    );
    expect(result.container).toEqual({ isolated: true, network: 'none', secrets: 'none' });
    expect(result.executedAt).toBeDefined();
    expect(result.reason).toContain(STRIPE_MOCK_LIMITATION);

    const output = result.newOutput as { requests: Array<{ status: number }> };
    expect(output.requests).toHaveLength(1);
    expect(output.requests[0]?.status).toBeGreaterThan(0);
  }, 90_000);
});
