import { describe, expect, it } from 'vitest';
import type { Scenario, VerificationResult } from '../domain/types.js';
import {
  renderVerificationMarkdown,
  STRIPE_MOCK_LIMITATION,
  StripeMockVerifier,
  type CommandExecutor,
} from './stripe-mock-runner.js';

const FIXED_DATE = new Date('2026-01-02T03:04:05.000Z');
const TEST_MODE_ENVIRONMENT = { STRIPE_SECRET_KEY: 'sk_test_synthetic_value' };

const scenario: Scenario = {
  id: 'customer-read',
  name: 'Customer read',
  description: 'Compare a synthetic customer request.',
  apiVersion: '2025-01-01',
  operation: 'customers.retrieve',
  input: {
    requests: [{ name: 'retrieve', method: 'GET', path: '/v1/customers' }],
  },
};

interface FakeOptions {
  dockerMissing?: boolean;
  imageMissing?: boolean;
  oldStatus?: number;
  newStatus?: number;
  oldBody?: unknown;
  newBody?: unknown;
}

function httpResponse(status: number, body: unknown): string {
  const json = JSON.stringify(body);
  const reason = status === 200 ? 'OK' : 'Bad Request';
  return [
    `HTTP/1.1 ${String(status)} ${reason}`,
    'Content-Type: application/json',
    `Content-Length: ${String(Buffer.byteLength(json, 'utf8'))}`,
    'Connection: close',
    '',
    json,
  ].join('\r\n');
}

function fakeExecutor(options: FakeOptions): {
  executor: CommandExecutor;
  calls: Array<{ command: string; args: string[] }>;
} {
  const calls: Array<{ command: string; args: string[] }> = [];
  let runCount = 0;
  const executor: CommandExecutor = (command, args) => {
    calls.push({ command, args: [...args] });
    let result: { exitCode: number; stdout: string; stderr: string };

    if (command !== 'docker') {
      result = { exitCode: 1, stdout: '', stderr: '' };
    } else {
      const subcommand = args[0];
      if (subcommand === 'version') {
        result =
          options.dockerMissing === true
            ? { exitCode: 1, stdout: '', stderr: '' }
            : { exitCode: 0, stdout: '27.0.0', stderr: '' };
      } else if (subcommand === 'image') {
        result =
          options.imageMissing === true
            ? { exitCode: 1, stdout: '', stderr: '' }
            : { exitCode: 0, stdout: '[]', stderr: '' };
      } else if (subcommand === 'run') {
        runCount += 1;
        result = { exitCode: 0, stdout: `container-${String(runCount)}`, stderr: '' };
      } else if (subcommand === 'exec') {
        const shellCommand = args.at(-1) ?? '';
        if (shellCommand.includes('</dev/null')) {
          result = { exitCode: 0, stdout: '', stderr: '' };
        } else {
          const isNewRun = runCount === 2;
          const status = isNewRun ? (options.newStatus ?? 200) : (options.oldStatus ?? 200);
          const defaultBody = { id: 'cus_fixture', object: 'customer' };
          const body = isNewRun
            ? (options.newBody ?? defaultBody)
            : (options.oldBody ?? defaultBody);
          result = { exitCode: 0, stdout: httpResponse(status, body), stderr: '' };
        }
      } else if (subcommand === 'rm') {
        result = { exitCode: 0, stdout: '', stderr: '' };
      } else {
        result = { exitCode: 1, stdout: '', stderr: '' };
      }
    }

    return Promise.resolve(result);
  };
  return { executor, calls };
}

function verifierFor(
  executor: CommandExecutor,
  overrides: Partial<ConstructorParameters<typeof StripeMockVerifier>[0]> = {},
): StripeMockVerifier {
  return new StripeMockVerifier({
    oldSpecPath: '/specs/old.json',
    newSpecPath: '/specs/new.json',
    commandExecutor: executor,
    now: () => FIXED_DATE,
    ...overrides,
  });
}

function expectNotExecuted(result: VerificationResult): void {
  expect(result.classification).toBe('could_not_run');
  expect(result.executedAt).toBeUndefined();
  expect(result.container).toEqual({ isolated: false, network: 'not_run', secrets: 'none' });
  expect(result.reason).toContain(STRIPE_MOCK_LIMITATION);
}

describe('StripeMockVerifier', () => {
  it('returns could_not_run with an install fix command when Docker is missing', async () => {
    const { executor, calls } = fakeExecutor({ dockerMissing: true });
    const result = await verifierFor(executor).verify(scenario, TEST_MODE_ENVIRONMENT);

    expectNotExecuted(result);
    expect(result.reason).toContain(
      'Install Docker, then run: docker pull stripe/stripe-mock:latest',
    );
    expect(result.normalizedDifference).toContain(
      'Fix: Install Docker, then run: docker pull stripe/stripe-mock:latest',
    );
    expect(calls.filter((call) => call.args[0] === 'run')).toHaveLength(0);
  });

  it('returns could_not_run with a pull fix command when the image is absent', async () => {
    const { executor, calls } = fakeExecutor({ imageMissing: true });
    const result = await verifierFor(executor).verify(scenario);

    expectNotExecuted(result);
    expect(result.reason).toContain('docker pull stripe/stripe-mock:latest');
    expect(result.reason).not.toContain('Install Docker');
    expect(calls.filter((call) => call.args[0] === 'run')).toHaveLength(0);
  });

  it('uses strict container boundaries and reports equivalent request sequences', async () => {
    const { executor, calls } = fakeExecutor({});
    const result = await verifierFor(executor).verify(scenario, TEST_MODE_ENVIRONMENT);

    expect(result.classification).toBe('equivalent');
    expect(result.executedAt).toBe(FIXED_DATE.toISOString());
    expect(result.container).toEqual({ isolated: true, network: 'none', secrets: 'none' });
    expect(result.reason).toContain(STRIPE_MOCK_LIMITATION);
    expect(result.normalizedDifference).toEqual([STRIPE_MOCK_LIMITATION]);
    expect(result.newOutput).toEqual({
      requests: [
        {
          name: 'retrieve',
          status: 200,
          validationErrors: [],
          responseShape: ['$.id:string', '$.object:string', '$:object'],
          bodyKeys: ['id', 'object'],
        },
      ],
    });

    const runCalls = calls.filter((call) => call.args[0] === 'run');
    expect(runCalls).toHaveLength(2);
    for (const call of runCalls) {
      const args = call.args;
      expect(args).toContain('--rm');
      expect(args).toContain('--network');
      expect(args[args.indexOf('--network') + 1]).toBe('none');
      expect(args).toContain('--read-only');
      expect(args).toContain('--cap-drop');
      expect(args[args.indexOf('--cap-drop') + 1]).toBe('ALL');
      expect(args).toContain('--security-opt');
      expect(args[args.indexOf('--security-opt') + 1]).toBe('no-new-privileges');
      expect(args.some((arg) => arg.includes(',readonly'))).toBe(true);
      expect(args.some((arg) => arg === '-e' || arg === '--env')).toBe(false);
      expect(args.some((arg) => arg.includes('sk_test_synthetic_value'))).toBe(false);
    }
  });

  it('reports exact per-request status differences as unexplained', async () => {
    const { executor } = fakeExecutor({
      oldStatus: 200,
      newStatus: 400,
      newBody: {
        error: {
          type: 'invalid_request_error',
          message: 'Unrecognized parameter: legacy_name',
          param: 'legacy_name',
        },
      },
    });
    const result = await verifierFor(executor).verify(scenario);

    expect(result.classification).toBe('unexplained_difference');
    expect(result.normalizedDifference).toContain('GET /v1/customers status 200 -> 400');
    expect(result.reason).toContain(STRIPE_MOCK_LIMITATION);
    expect(result.reason).toContain('GET /v1/customers status 200 -> 400');
  });

  it('classifies a difference as intentional only when the new run matches expectedOutput', async () => {
    const first = await verifierFor(fakeExecutor({ newStatus: 400 }).executor).verify(scenario);
    expect(first.classification).toBe('unexplained_difference');

    const second = await verifierFor(fakeExecutor({ newStatus: 400 }).executor).verify({
      ...scenario,
      expectedOutput: first.newOutput as Record<string, unknown>,
    });

    expect(second.classification).toBe('intentionally_different');
    expect(second.reason).toContain(STRIPE_MOCK_LIMITATION);
    expect(second.normalizedDifference).toContain('GET /v1/customers status 200 -> 400');
  });

  it('refuses live keys before calling any command or emitting the value', async () => {
    const { executor, calls } = fakeExecutor({});
    const liveKey = 'sk_live_synthetic_test_value';

    let refusal: unknown;
    try {
      await verifierFor(executor).verify(scenario, { STRIPE_SECRET_KEY: liveKey });
    } catch (error) {
      refusal = error;
    }

    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toMatch(/Live Stripe secret keys are forbidden/);
    expect((refusal as Error).message).not.toContain(liveKey);
    expect(calls).toHaveLength(0);
  });

  it('renders the limitation and could_not_run reasons in Markdown', () => {
    const markdown = renderVerificationMarkdown([
      {
        scenarioId: 'customer-read',
        classification: 'could_not_run',
        reason: `${STRIPE_MOCK_LIMITATION} The image is missing. Fix: docker pull stripe/stripe-mock:latest`,
        container: { isolated: false, network: 'not_run', secrets: 'none' },
      },
    ]);

    expect(markdown).toContain('## Stripe-mock verification');
    expect(markdown).toContain(STRIPE_MOCK_LIMITATION);
    expect(markdown).toContain('docker pull stripe/stripe-mock:latest');
    expect(markdown).toContain('No isolated execution occurred');
  });
});
