import { isDeepStrictEqual } from 'node:util';
import type { Scenario, VerificationResult } from '../domain/types.js';
import type {
  ContainerExecutionPort,
  ContainerExecutionRequest,
  ContainerExecutionResult,
} from './container-runner.js';
import { assertSafeTestModeKeys } from './key-safety.js';

export class Verifier {
  constructor(
    private readonly container: ContainerExecutionPort,
    private readonly repositoryPath: string = process.cwd(),
  ) {}

  async verify(
    scenario: Scenario,
    environment: Record<string, string | undefined> = {},
  ): Promise<VerificationResult> {
    assertSafeTestModeKeys(environment);
    try {
      const isolation = {
        network: 'none' as const,
        secrets: 'none' as const,
        readOnlyRepository: true as const,
        timeoutSeconds: 300 as const,
      };
      const [oldResult, newResult] = await Promise.all([
        this.execute(scenario, 'old', isolation),
        this.execute(scenario, 'new', isolation),
      ]);
      if (oldResult.status !== 'executed') {
        return this.couldNotRun(scenario.id, oldResult.reason, oldResult.isolation);
      }
      if (newResult.status !== 'executed') {
        return this.couldNotRun(scenario.id, newResult.reason, newResult.isolation);
      }

      const equivalent = isDeepStrictEqual(oldResult.output, newResult.output);
      const intentional =
        !equivalent &&
        scenario.expectedOutput !== undefined &&
        isDeepStrictEqual(newResult.output, scenario.expectedOutput);
      const classification = equivalent
        ? 'equivalent'
        : intentional
          ? 'intentionally_different'
          : 'unexplained_difference';
      return {
        scenarioId: scenario.id,
        classification,
        oldOutput: oldResult.output,
        newOutput: newResult.output,
        normalizedDifference: collectDifferencePaths(oldResult.output, newResult.output),
        reason: equivalent
          ? 'Outputs are structurally equal.'
          : intentional
            ? 'The new output matches the scenario’s explicit expected output.'
            : 'Outputs differ and the new output does not match an explicit expected output.',
        container: newResult.isolation,
        executedAt: new Date().toISOString(),
      };
    } catch (error) {
      return this.couldNotRun(
        scenario.id,
        error instanceof Error ? error.message : 'Unknown execution error',
        { isolated: false, network: 'not_run', secrets: 'none' },
      );
    }
  }

  private execute(
    scenario: Scenario,
    apiVersion: 'old' | 'new',
    isolation: ContainerExecutionRequest['isolation'],
  ): Promise<ContainerExecutionResult> {
    return this.container.execute({
      repositoryPath: this.repositoryPath,
      scenario,
      apiVersion,
      isolation,
    });
  }

  private couldNotRun(
    scenarioId: string,
    reason: string,
    container: VerificationResult['container'] = {
      isolated: false,
      network: 'not_run',
      secrets: 'none',
    },
  ): VerificationResult {
    return {
      scenarioId,
      classification: 'could_not_run',
      reason,
      container,
    };
  }
}

function collectDifferencePaths(oldValue: unknown, newValue: unknown, path = '$'): string[] {
  if (isDeepStrictEqual(oldValue, newValue)) return [];

  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    const paths: string[] = [];
    const length = Math.max(oldValue.length, newValue.length);
    for (let index = 0; index < length; index += 1) {
      paths.push(
        ...collectDifferencePaths(oldValue[index], newValue[index], `${path}[${String(index)}]`),
      );
    }
    return paths;
  }

  if (isRecord(oldValue) && isRecord(newValue)) {
    const paths: string[] = [];
    const keys = [...new Set([...Object.keys(oldValue), ...Object.keys(newValue)])].sort();
    for (const key of keys) {
      paths.push(...collectDifferencePaths(oldValue[key], newValue[key], `${path}.${key}`));
    }
    return paths;
  }

  return [path];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
