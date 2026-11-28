import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import type { Scenario, VerificationResult } from '../domain/types.js';
import { assertSafeTestModeKeys } from './key-safety.js';

export const STRIPE_MOCK_IMAGE = 'stripe/stripe-mock:latest';
export const STRIPE_MOCK_LIMITATION =
  'stripe-mock validates against the spec and is not real Stripe behavior.';

const DOCKER_FIX = 'Install Docker, then run: docker pull stripe/stripe-mock:latest';
const IMAGE_FIX = 'docker pull stripe/stripe-mock:latest';
const RUNTIME_FIX =
  'Check Docker and both spec files, then run: docker pull stripe/stripe-mock:latest';
const SYNTHETIC_TEST_KEY = 'sk_test_dokimana_mock';
const HTTP_PORT = '12111';
const SPEC_MOUNT_PATH = '/dokimana/spec.json';
const REQUESTS_MOUNT_PATH = '/dokimana/requests';
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const ALLOWED_HEADERS = new Set(['stripe-version', 'content-type', 'accept']);
const MAX_SHAPE_ENTRIES = 64;
const MAX_SHAPE_DEPTH = 3;

let containerSequence = 0;

export type CommandExecutor = (
  command: string,
  args: string[],
  options?: { timeoutMs?: number },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export interface StripeMockVerifierOptions {
  oldSpecPath: string;
  newSpecPath: string;
  timeoutSeconds?: number;
  commandExecutor?: CommandExecutor;
  now?: () => Date;
}

export interface StripeMockRequest {
  name: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface StripeMockRequestObservation {
  name: string;
  status: number;
  validationErrors: string[];
  responseShape: string[];
  bodyKeys: string[];
}

export interface StripeMockRunOutput {
  requests: StripeMockRequestObservation[];
}

/**
 * Creates the real Docker-backed executor. Verification never supplies host
 * environment values to child processes; each command receives only fixed
 * arguments derived from validated scenario data.
 */
export function createCommandExecutor(): CommandExecutor {
  return (command, args, options) =>
    new Promise((resolve) => {
      let settled = false;
      let stdout = '';
      let stderr = '';
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (exitCode: number): void => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        resolve({ exitCode, stdout, stderr });
      };

      const executable =
        command === 'docker' && process.platform === 'win32' ? 'docker.cmd' : command;
      try {
        const child = spawn(executable, args, {
          shell: executable.endsWith('.cmd'),
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        timer = setTimeout(() => {
          child.kill('SIGKILL');
          finish(124);
        }, options?.timeoutMs ?? 30_000);

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk;
        });
        child.stderr.on('data', (chunk: string) => {
          stderr += chunk;
        });
        child.on('error', () => {
          finish(1);
        });
        child.on('close', (code) => {
          finish(typeof code === 'number' ? code : 1);
        });
      } catch {
        finish(1);
      }
    });
}

/**
 * Runs a request sequence against two supplied OpenAPI specs using stripe-mock
 * in separate, isolated containers. No repository scripts or live APIs are
 * executed, and no host secrets are passed into containers.
 */
export class StripeMockVerifier {
  private readonly executor: CommandExecutor;
  private readonly timeoutSeconds: number;
  private readonly now: () => Date;
  private readonly oldSpecPath: string;
  private readonly newSpecPath: string;

  constructor(options: StripeMockVerifierOptions) {
    this.executor = options.commandExecutor ?? createCommandExecutor();
    this.timeoutSeconds = options.timeoutSeconds ?? 30;
    this.now = options.now ?? (() => new Date());
    this.oldSpecPath = resolve(options.oldSpecPath);
    this.newSpecPath = resolve(options.newSpecPath);
  }

  async verify(
    scenario: Scenario,
    environment: Record<string, string | undefined> = {},
  ): Promise<VerificationResult> {
    assertSafeTestModeKeys(environment);
    const requests = parseRequests(scenario.input);
    const timeoutMs = Math.max(1, Math.floor(this.timeoutSeconds * 1000));

    let workspace: string | undefined;
    const startedContainers: string[] = [];
    try {
      const docker = await this.safeExec('docker', ['version', '--format', '{{.Server.Version}}']);
      if (docker.exitCode !== 0 || docker.stdout.trim() === '') {
        throw new RuntimeFailure(
          `Docker is unavailable or its daemon is unreachable (docker version --format {{.Server.Version}} exited ${String(docker.exitCode)}).`,
          DOCKER_FIX,
        );
      }

      const image = await this.safeExec('docker', ['image', 'inspect', STRIPE_MOCK_IMAGE]);
      if (image.exitCode !== 0) {
        throw new RuntimeFailure(
          `The required image ${STRIPE_MOCK_IMAGE} is not available locally.`,
          IMAGE_FIX,
        );
      }

      workspace = await mkdtemp(join(tmpdir(), 'dokimana-stripe-mock-'));
      const requestDirectory = join(workspace, 'requests');
      await mkdir(requestDirectory);
      for (let index = 0; index < requests.length; index += 1) {
        const request = requests[index];
        if (request === undefined) continue;
        await writeFile(
          join(requestDirectory, requestFileName(index)),
          serializeHttpRequest(request),
          'utf8',
        );
      }

      const oldOutput: StripeMockRunOutput = {
        requests: await this.executeSpec(
          this.oldSpecPath,
          requestDirectory,
          requests,
          timeoutMs,
          startedContainers,
        ),
      };
      const newOutput: StripeMockRunOutput = {
        requests: await this.executeSpec(
          this.newSpecPath,
          requestDirectory,
          requests,
          timeoutMs,
          startedContainers,
        ),
      };

      const differences = collectDifferences(requests, oldOutput.requests, newOutput.requests);
      const equivalent = differences.length === 0;
      const intentional =
        !equivalent &&
        scenario.expectedOutput !== undefined &&
        matchesExpectedOutput(scenario.expectedOutput, newOutput);

      const classification = equivalent
        ? 'equivalent'
        : intentional
          ? 'intentionally_different'
          : 'unexplained_difference';
      const explanation = equivalent
        ? 'Both isolated stripe-mock runs returned the same request results.'
        : intentional
          ? `The new isolated stripe-mock output matches the scenario's explicit expected output. ${differences.join('; ')}`
          : `The isolated stripe-mock outputs differ and the new output does not match an explicit expected output. ${differences.join('; ')}`;

      return {
        scenarioId: scenario.id,
        classification,
        oldOutput,
        newOutput,
        normalizedDifference: [STRIPE_MOCK_LIMITATION, ...differences],
        reason: `${STRIPE_MOCK_LIMITATION} ${sanitizeText(explanation)}`,
        container: { isolated: true, network: 'none', secrets: 'none' },
        executedAt: this.now().toISOString(),
      };
    } catch (error) {
      if (error instanceof RuntimeFailure) {
        return this.couldNotRun(scenario.id, error.message, error.fixCommand);
      }
      const message = error instanceof Error ? error.message : 'Unknown execution error';
      return this.couldNotRun(
        scenario.id,
        `Unexpected verification error: ${sanitizeText(message)}`,
        RUNTIME_FIX,
      );
    } finally {
      for (const name of startedContainers) {
        try {
          await this.safeExec('docker', ['rm', '-f', name], Math.min(timeoutMs, 5000));
        } catch {
          // Cleanup failures must not turn an honest result into a false pass.
        }
      }
      if (workspace !== undefined) {
        await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  private async executeSpec(
    specPath: string,
    requestDirectory: string,
    requests: StripeMockRequest[],
    timeoutMs: number,
    startedContainers: string[],
  ): Promise<StripeMockRequestObservation[]> {
    containerSequence += 1;
    const name = `dokimana-stripe-mock-${String(process.pid)}-${String(containerSequence)}`;
    const runArgs = [
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      `--mount=type=bind,source=${dockerPath(specPath)},target=${SPEC_MOUNT_PATH},readonly`,
      `--mount=type=bind,source=${dockerPath(requestDirectory)},target=${REQUESTS_MOUNT_PATH},readonly`,
      '--entrypoint',
      '/bin/stripe-mock',
      STRIPE_MOCK_IMAGE,
      '-http-port',
      HTTP_PORT,
      '-spec',
      SPEC_MOUNT_PATH,
    ];
    const started = await this.safeExec('docker', runArgs, timeoutMs);
    if (started.exitCode !== 0) {
      throw new RuntimeFailure('The stripe-mock container could not be started.', RUNTIME_FIX);
    }
    startedContainers.push(name);

    const maxAttempts = Math.max(1, Math.ceil(this.timeoutSeconds * 10));
    let ready = false;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const probe = await this.safeExec(
        'docker',
        [
          'exec',
          name,
          '/bin/sh',
          '-c',
          `nc -w 1 127.0.0.1 ${HTTP_PORT} </dev/null >/dev/null 2>&1`,
        ],
        Math.min(timeoutMs, 5000),
      );
      if (probe.exitCode === 0) {
        ready = true;
        break;
      }
      if (attempt < maxAttempts - 1) await delay(100);
    }
    if (!ready) {
      throw new RuntimeFailure(
        `stripe-mock did not become ready on loopback port ${HTTP_PORT} inside the isolated container.`,
        RUNTIME_FIX,
      );
    }

    const observations: StripeMockRequestObservation[] = [];
    for (let index = 0; index < requests.length; index += 1) {
      const remoteRequest = `${REQUESTS_MOUNT_PATH}/${requestFileName(index)}`;
      const response = await this.safeExec(
        'docker',
        ['exec', name, '/bin/sh', '-c', `nc -w 2 127.0.0.1 ${HTTP_PORT} < ${remoteRequest}`],
        timeoutMs,
      );
      if (response.exitCode !== 0) {
        throw new RuntimeFailure(
          `stripe-mock request ${requestFileName(index)} did not complete inside the isolated container.`,
          RUNTIME_FIX,
        );
      }
      const observation = parseObservation(response.stdout);
      observations.push({
        ...observation,
        name: requests[index]?.name ?? `request-${String(index + 1)}`,
      });
    }
    return observations;
  }

  private async safeExec(
    command: string,
    args: string[],
    timeoutMs = 30_000,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    try {
      return await this.executor(command, args, { timeoutMs });
    } catch {
      return { exitCode: 1, stdout: '', stderr: '' };
    }
  }

  private couldNotRun(scenarioId: string, reason: string, fixCommand: string): VerificationResult {
    const fullReason = `${STRIPE_MOCK_LIMITATION} ${sanitizeText(reason)} Fix: ${fixCommand}`;
    return {
      scenarioId,
      classification: 'could_not_run',
      normalizedDifference: [STRIPE_MOCK_LIMITATION, sanitizeText(reason), `Fix: ${fixCommand}`],
      reason: fullReason,
      container: { isolated: false, network: 'not_run', secrets: 'none' },
    };
  }
}

/** Markdown section for verification results, including explicit limitations. */
export function renderVerificationMarkdown(results: VerificationResult[]): string {
  const lines = ['## Stripe-mock verification', '', `> ${STRIPE_MOCK_LIMITATION}`, ''];
  if (results.length === 0) {
    lines.push('_No verification results were produced. Nothing was executed._', '');
    return `${lines.join('\n')}\n`;
  }
  for (const result of results) {
    lines.push(`### ${inlineMarkdown(result.scenarioId)}`, '');
    lines.push(`- **Classification:** ${inlineMarkdown(result.classification)}`);
    lines.push(`- **Reason:** ${inlineMarkdown(result.reason)}`);
    lines.push(
      `- **Executed at:** ${inlineMarkdown(result.executedAt ?? 'not run; no isolated execution occurred')}`,
    );
    if (result.classification === 'could_not_run') {
      lines.push('- **Status:** No isolated execution occurred; this is not a passing result.');
    }
    if (result.normalizedDifference !== undefined && result.normalizedDifference.length > 0) {
      lines.push('- **Recorded differences:**');
      for (const difference of result.normalizedDifference) {
        lines.push(`  - ${inlineMarkdown(difference)}`);
      }
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

class RuntimeFailure extends Error {
  constructor(
    message: string,
    readonly fixCommand: string,
  ) {
    super(message);
  }
}

function parseRequests(input: Record<string, unknown>): StripeMockRequest[] {
  const raw = input['requests'];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      'scenario.input.requests must be a non-empty array of { name, method, path } request objects.',
    );
  }
  return raw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`scenario.input.requests[${String(index)}] must be an object.`);
    }
    const { name, method, path, headers, body } = entry;
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error(`scenario.input.requests[${String(index)}].name must be a non-empty string.`);
    }
    if (typeof method !== 'string' || !ALLOWED_METHODS.has(method.toUpperCase())) {
      throw new Error(
        `scenario.input.requests[${String(index)}].method must be one of ${[...ALLOWED_METHODS].join(', ')}.`,
      );
    }
    if (
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      /[\s\r\n]/.test(path) ||
      path.includes('..')
    ) {
      throw new Error(
        `scenario.input.requests[${String(index)}].path must be an absolute path without whitespace, line breaks, or '..'.`,
      );
    }
    let safeHeaders: Record<string, string> | undefined;
    if (headers !== undefined) {
      if (!isRecord(headers) || Object.values(headers).some((value) => typeof value !== 'string')) {
        throw new Error(
          `scenario.input.requests[${String(index)}].headers must be an object of string values.`,
        );
      }
      safeHeaders = {};
      for (const [headerName, headerValue] of Object.entries(headers)) {
        if (typeof headerValue === 'string') safeHeaders[headerName] = headerValue;
      }
    }
    if (body !== undefined) {
      let serializedBody: string;
      try {
        const result = JSON.stringify(body);
        if (typeof result !== 'string') {
          throw new Error('Body is not JSON-serializable.');
        }
        serializedBody = result;
      } catch {
        throw new Error(
          `scenario.input.requests[${String(index)}].body must be JSON-serializable.`,
        );
      }
      if (looksLikeSecret(serializedBody)) {
        throw new Error(
          `scenario.input.requests[${String(index)}].body contains a forbidden secret value and was refused.`,
        );
      }
    }
    const request: StripeMockRequest = {
      name: name.replace(/[\r\n]/g, ' '),
      method: method.toUpperCase(),
      path,
    };
    if (safeHeaders !== undefined) request.headers = safeHeaders;
    if (body !== undefined) request.body = body;
    return request;
  });
}

function serializeHttpRequest(request: StripeMockRequest): string {
  const headers = [
    `Authorization: Bearer ${SYNTHETIC_TEST_KEY}`,
    'Host: stripe-mock.invalid',
    'Connection: close',
    'User-Agent: dokimana-stripe-mock',
  ];
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    if (!ALLOWED_HEADERS.has(name.toLowerCase())) continue;
    if (looksLikeSecret(value)) continue;
    headers.push(`${name}: ${value.replace(/[\r\n]/g, ' ')}`);
  }
  let bodyText = '';
  if (request.body !== undefined) {
    bodyText = JSON.stringify(request.body);
    headers.push('Content-Type: application/json');
    headers.push(`Content-Length: ${String(Buffer.byteLength(bodyText, 'utf8'))}`);
  }
  return `${[`${request.method} ${request.path} HTTP/1.1`, ...headers].join('\r\n')}\r\n\r\n${bodyText}`;
}

function requestFileName(index: number): string {
  return `request-${String(index + 1).padStart(4, '0')}.http`;
}

function dockerPath(path: string): string {
  return path.replaceAll('\\', '/');
}

function parseObservation(rawResponse: string): StripeMockRequestObservation {
  const crlfEnd = rawResponse.indexOf('\r\n\r\n');
  const lfEnd = rawResponse.indexOf('\n\n');
  const headerEnd = crlfEnd >= 0 ? crlfEnd : lfEnd;
  if (headerEnd < 0) {
    throw new RuntimeFailure(
      'stripe-mock returned an unreadable HTTP response (no header/body separator).',
      RUNTIME_FIX,
    );
  }
  const headerLines = rawResponse.slice(0, headerEnd).replace(/\r\n/g, '\n').split('\n');
  const statusMatch = /^HTTP\/[\d.]+ (\d{3})\b/.exec(headerLines[0] ?? '');
  if (statusMatch === null || statusMatch[1] === undefined) {
    throw new RuntimeFailure('stripe-mock returned an unreadable HTTP status line.', RUNTIME_FIX);
  }
  const headers = new Map<string, string>();
  for (const line of headerLines.slice(1)) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
    }
  }
  let body = rawResponse.slice(headerEnd + (crlfEnd >= 0 ? 4 : 2));
  if (/chunked/i.test(headers.get('transfer-encoding') ?? '')) {
    body = decodeChunked(body);
  }
  return describeObservation(statusMatch[1], body);
}

function decodeChunked(body: string): string {
  let cursor = 0;
  const parts: Buffer[] = [];
  while (cursor < body.length) {
    const lineEnd = body.indexOf('\r\n', cursor);
    if (lineEnd === -1) break;
    const sizeText = (body.slice(cursor, lineEnd).split(';')[0] ?? '').trim();
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isFinite(size) || size <= 0) break;
    const start = lineEnd + 2;
    if (start + size > body.length) break;
    parts.push(Buffer.from(body.slice(start, start + size), 'utf8'));
    cursor = start + size + 2;
  }
  return Buffer.concat(parts).toString('utf8');
}

function describeObservation(statusText: string, body: string): StripeMockRequestObservation {
  const status = Number(statusText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      name: '',
      status,
      validationErrors: [],
      responseShape: ['$:<non-json>'],
      bodyKeys: [],
    };
  }
  const payload = isRecord(parsed) ? parsed : undefined;
  const rawError = payload?.['error'];
  const error = isRecord(rawError) ? rawError : undefined;
  const validationErrors: string[] = [];
  if (error !== undefined) {
    const parts: string[] = [];
    for (const key of ['type', 'message', 'param', 'code'] as const) {
      const value = error[key];
      if (typeof value === 'string' && value !== '') parts.push(`${key}=${value}`);
    }
    validationErrors.push(sanitizeText(parts.join(' ') || 'error'));
  }
  return {
    name: '',
    status,
    validationErrors,
    responseShape: describeShape(parsed, '$', 0),
    bodyKeys: payload === undefined ? [] : Object.keys(payload).sort(),
  };
}

function describeShape(value: unknown, path: string, depth: number): string[] {
  const entries: string[] = [];
  const visit = (current: unknown, currentPath: string, currentDepth: number): void => {
    if (entries.length >= MAX_SHAPE_ENTRIES) return;
    if (current === null) {
      entries.push(`${currentPath}:null`);
      return;
    }
    if (Array.isArray(current)) {
      entries.push(`${currentPath}:array[${String(current.length)}]`);
      if (currentDepth < MAX_SHAPE_DEPTH) {
        for (const [itemIndex, item] of current.slice(0, 8).entries()) {
          visit(item, `${currentPath}[${String(itemIndex)}]`, currentDepth + 1);
        }
      }
      return;
    }
    if (typeof current !== 'object') {
      entries.push(`${currentPath}:${typeof current}`);
      return;
    }
    entries.push(`${currentPath}:object`);
    if (currentDepth >= MAX_SHAPE_DEPTH) return;
    for (const key of Object.keys(current).sort()) {
      visit((current as Record<string, unknown>)[key], `${currentPath}.${key}`, currentDepth + 1);
    }
  };
  visit(value, path, depth);
  return entries.sort();
}

function collectDifferences(
  requests: StripeMockRequest[],
  oldObservations: StripeMockRequestObservation[],
  newObservations: StripeMockRequestObservation[],
): string[] {
  const differences: string[] = [];
  const count = Math.max(requests.length, oldObservations.length, newObservations.length);
  for (let index = 0; index < count; index += 1) {
    const request = requests[index];
    const oldObservation = oldObservations[index];
    const newObservation = newObservations[index];
    if (request === undefined || oldObservation === undefined || newObservation === undefined) {
      differences.push(`request ${String(index + 1)} missing from one stripe-mock run`);
      continue;
    }
    const label = `${request.method} ${request.path}`;
    if (oldObservation.status !== newObservation.status) {
      differences.push(
        `${label} status ${String(oldObservation.status)} -> ${String(newObservation.status)}`,
      );
    }
    if (!isDeepStrictEqual(oldObservation.validationErrors, newObservation.validationErrors)) {
      differences.push(
        `${label} validationErrors ${JSON.stringify(oldObservation.validationErrors)} -> ${JSON.stringify(newObservation.validationErrors)}`,
      );
    }
    if (!isDeepStrictEqual(oldObservation.responseShape, newObservation.responseShape)) {
      differences.push(
        `${label} responseShape ${JSON.stringify(oldObservation.responseShape)} -> ${JSON.stringify(newObservation.responseShape)}`,
      );
    }
    if (!isDeepStrictEqual(oldObservation.bodyKeys, newObservation.bodyKeys)) {
      differences.push(
        `${label} bodyKeys ${JSON.stringify(oldObservation.bodyKeys)} -> ${JSON.stringify(newObservation.bodyKeys)}`,
      );
    }
  }
  return differences.map((difference) => sanitizeText(difference));
}

function matchesExpectedOutput(
  expected: Record<string, unknown>,
  output: StripeMockRunOutput,
): boolean {
  if (isDeepStrictEqual(expected, output)) return true;
  if (isDeepStrictEqual(expected, { requests: output.requests })) return true;
  if (isDeepStrictEqual(expected, output.requests)) return true;
  const named: Record<string, StripeMockRequestObservation> = {};
  for (const observation of output.requests) named[observation.name] = observation;
  return isDeepStrictEqual(expected, named);
}

function looksLikeSecret(value: string): boolean {
  return /(?:sk|rk)_live(?:[_-]|$)/i.test(value) || /whsec_[A-Za-z0-9]+/i.test(value);
}

function sanitizeText(value: string): string {
  return value
    .replace(/(?:sk|rk)_live[_-][A-Za-z0-9_]+/gi, '[redacted-secret]')
    .replace(/whsec_[A-Za-z0-9_]+/gi, '[redacted-secret]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

function inlineMarkdown(value: string): string {
  return sanitizeText(value).replaceAll('|', '\\|').replaceAll('`', "'");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
