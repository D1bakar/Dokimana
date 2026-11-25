import type { Scenario } from '../domain/types.js';

export interface ContainerExecutionRequest {
  repositoryPath: string;
  scenario: Scenario;
  apiVersion: 'old' | 'new';
  isolation: {
    network: 'none';
    secrets: 'none';
    readOnlyRepository: true;
    timeoutSeconds: 300;
  };
}

export type ContainerExecutionResult =
  | {
      status: 'executed';
      output: unknown;
      isolation: { isolated: true; network: 'none'; secrets: 'none' };
    }
  | {
      status: 'could_not_run';
      reason: string;
      isolation: {
        isolated: false;
        network: 'not_run';
        secrets: 'none';
      };
    };

export interface ContainerExecutionPort {
  // Implementations must execute repository code only inside the requested isolation boundary.
  execute(request: ContainerExecutionRequest): Promise<ContainerExecutionResult>;
}

export class DockerNotConfiguredRunner implements ContainerExecutionPort {
  async execute(): Promise<ContainerExecutionResult> {
    return {
      status: 'could_not_run',
      reason: 'Docker isolation runner is not configured. Execution was not attempted.',
      isolation: { isolated: false, network: 'not_run', secrets: 'none' },
    };
  }
}
