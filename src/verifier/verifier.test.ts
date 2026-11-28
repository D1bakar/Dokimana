import { describe, expect, it } from 'vitest';
import type { Scenario } from '../domain/types.js';
import type {
  ContainerExecutionPort,
  ContainerExecutionRequest,
  ContainerExecutionResult,
} from './container-runner.js';
import { DockerNotConfiguredRunner } from './container-runner.js';
import { Verifier } from './verifier.js';

const scenario: Scenario = {
  id: 'customer-read',
  name: 'Customer read',
  description: 'Compare customer lookup behavior.',
  apiVersion: '2025-01-01',
  operation: 'customers.retrieve',
  input: { id: 'cus_fixture' },
};

class FixtureRunner implements ContainerExecutionPort {
  readonly requests: ContainerExecutionRequest[] = [];

  constructor(private readonly results: Record<'old' | 'new', ContainerExecutionResult>) {}

  execute(request: ContainerExecutionRequest): Promise<ContainerExecutionResult> {
    this.requests.push(request);
    return Promise.resolve(this.results[request.apiVersion]);
  }
}

function executed(output: unknown): ContainerExecutionResult {
  return {
    status: 'executed',
    output,
    isolation: { isolated: true, network: 'none', secrets: 'none' },
  };
}

describe('Verifier', () => {
  it('reports could_not_run without claiming isolation when Docker is unconfigured', async () => {
    const result = await new Verifier(new DockerNotConfiguredRunner(), '/repo').verify(scenario);
    expect(result.classification).toBe('could_not_run');
    expect(result.container).toEqual({
      isolated: false,
      network: 'not_run',
      secrets: 'none',
    });
    expect(result.executedAt).toBeUndefined();
  });

  it('compares both API versions only through the container execution port', async () => {
    const runner = new FixtureRunner({
      old: executed({ customer: { name: 'Ada', id: 'cus_1' } }),
      new: executed({ customer: { id: 'cus_1', name: 'Ada' } }),
    });
    const result = await new Verifier(runner, '/repo').verify(scenario);

    expect(result.classification).toBe('equivalent');
    expect(runner.requests.map((request) => request.apiVersion).sort()).toEqual(['new', 'old']);
    expect(runner.requests.map((request) => request.isolation)).toEqual([
      { network: 'none', secrets: 'none', readOnlyRepository: true, timeoutSeconds: 300 },
      { network: 'none', secrets: 'none', readOnlyRepository: true, timeoutSeconds: 300 },
    ]);
  });

  it('classifies a changed output as intentional only when it matches an explicit expectation', async () => {
    const changedScenario = { ...scenario, expectedOutput: { status: 'new' } };
    const runner = new FixtureRunner({
      old: executed({ status: 'old' }),
      new: executed({ status: 'new' }),
    });

    const result = await new Verifier(runner, '/repo').verify(changedScenario);

    expect(result.classification).toBe('intentionally_different');
    expect(result.normalizedDifference).toEqual(['$.status']);
  });

  it('classifies an unexpected output change as unexplained', async () => {
    const runner = new FixtureRunner({
      old: executed({ status: 'old' }),
      new: executed({ status: 'new' }),
    });

    const result = await new Verifier(runner, '/repo').verify(scenario);

    expect(result.classification).toBe('unexplained_difference');
  });

  it('refuses live keys before invoking the container port', async () => {
    const runner = new FixtureRunner({
      old: executed({}),
      new: executed({}),
    });

    await expect(
      new Verifier(runner, '/repo').verify(scenario, { STRIPE_SECRET_KEY: 'sk_live_123' }),
    ).rejects.toThrow(/Live Stripe secret keys are forbidden/);
    expect(runner.requests).toHaveLength(0);
  });
});
