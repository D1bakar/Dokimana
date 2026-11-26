import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface DokimanaConfig {
  version: 1;
  repo: string;
  oldSpec: string;
  newSpec: string;
  include: string[];
  exclude: string[];
  failOn: 'high' | 'medium' | 'low' | 'none';
  failOnChanges: boolean;
  output: {
    json: string;
    markdown: string;
    sarif: string;
    html: string;
  };
}

const DEFAULT_INCLUDE: readonly string[] = ['src/**/*.{ts,tsx,js,jsx,mjs,cjs}'];

const DEFAULT_EXCLUDE: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/.next/**',
  '**/vendor/**',
  '**/generated/**',
  '**/*.generated.*',
  '**/*.gen.*',
];

const DEFAULT_OUTPUT = {
  json: 'dokimana-impact.json',
  markdown: 'dokimana-evidence.md',
  sarif: 'dokimana-results.sarif',
  html: 'dokimana-report.html',
} as const;

const CONFIG_KEYS = [
  'version',
  'repo',
  'oldSpec',
  'newSpec',
  'include',
  'exclude',
  'failOn',
  'failOnChanges',
  'output',
] as const;

const OUTPUT_KEYS = ['json', 'markdown', 'sarif', 'html'] as const;

export function defaultConfig(options: { repo?: string } = {}): DokimanaConfig {
  const repo = options.repo ?? '.';
  if (repo.trim().length === 0) {
    throw new Error('repo must be a non-empty string.');
  }

  return {
    version: 1,
    repo,
    oldSpec: 'fixtures/stripe-old.json',
    newSpec: 'fixtures/stripe-new.json',
    include: [...DEFAULT_INCLUDE],
    exclude: [...DEFAULT_EXCLUDE],
    failOn: 'high',
    failOnChanges: false,
    output: { ...DEFAULT_OUTPUT },
  };
}

export function assertDokimanaConfig(
  value: unknown,
  label: string,
): asserts value is DokimanaConfig {
  const context = `Invalid Dokimana config (${label})`;
  if (!isRecord(value)) throw new Error(`${context}: expected an object.`);
  assertExactKeys(value, CONFIG_KEYS, context);

  if (value.version !== 1) {
    throw new Error(`${context}: version must be 1.`);
  }
  assertNonEmptyString(value.repo, 'repo', context);
  assertNonEmptyString(value.oldSpec, 'oldSpec', context);
  assertNonEmptyString(value.newSpec, 'newSpec', context);
  assertStringArray(value.include, 'include', context, true);
  assertStringArray(value.exclude, 'exclude', context, false);
  if (!isFailOn(value.failOn)) {
    throw new Error(`${context}: failOn must be high, medium, low, or none.`);
  }
  if (typeof value.failOnChanges !== 'boolean') {
    throw new Error(`${context}: failOnChanges must be a boolean.`);
  }
  if (!isRecord(value.output)) {
    throw new Error(`${context}: output must be an object.`);
  }
  assertExactKeys(value.output, OUTPUT_KEYS, `${context}.output`);
  assertNonEmptyString(value.output.json, 'output.json', context);
  assertNonEmptyString(value.output.markdown, 'output.markdown', context);
  assertNonEmptyString(value.output.sarif, 'output.sarif', context);
  assertNonEmptyString(value.output.html, 'output.html', context);
}

export function renderDokimanaConfig(config: DokimanaConfig): string {
  assertDokimanaConfig(config, 'config');

  const ordered: DokimanaConfig = {
    version: 1,
    repo: config.repo,
    oldSpec: config.oldSpec,
    newSpec: config.newSpec,
    include: [...config.include],
    exclude: [...config.exclude],
    failOn: config.failOn,
    failOnChanges: config.failOnChanges,
    output: {
      json: config.output.json,
      markdown: config.output.markdown,
      sarif: config.output.sarif,
      html: config.output.html,
    },
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export async function createConfigFile(options: {
  path: string;
  repo?: string;
  overwrite?: boolean;
}): Promise<{ path: string; created: boolean }> {
  if (!isRecord(options)) {
    throw new Error('createConfigFile options: expected an object.');
  }
  assertNonEmptyString(options.path, 'path', 'createConfigFile options');
  if (options.repo !== undefined) {
    assertNonEmptyString(options.repo, 'repo', 'createConfigFile options');
  }
  if (options.overwrite !== undefined && typeof options.overwrite !== 'boolean') {
    throw new Error('createConfigFile options: overwrite must be a boolean.');
  }

  const config = defaultConfig(options.repo === undefined ? {} : { repo: options.repo });
  const contents = renderDokimanaConfig(config);

  if (await fileExists(options.path)) {
    if (options.overwrite !== true) return { path: options.path, created: false };
  }

  await mkdir(dirname(options.path), { recursive: true });
  await writeFile(options.path, contents, 'utf8');
  return { path: options.path, created: true };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') return false;
    throw error;
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && typeof (error as NodeJS.ErrnoException).code === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFailOn(value: unknown): value is DokimanaConfig['failOn'] {
  return value === 'high' || value === 'medium' || value === 'low' || value === 'none';
}

function assertExactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  context: string,
): void {
  const allowed = new Set<string>(expected);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`${context}: unknown field "${key}".`);
    }
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error(`${context}: missing field "${key}".`);
    }
  }
}

function assertNonEmptyString(
  value: unknown,
  field: string,
  context: string,
): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${context}: ${field} must be a non-empty string.`);
  }
}

function assertStringArray(
  value: unknown,
  field: string,
  context: string,
  nonEmpty: boolean,
): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context}: ${field} must be an array of strings.`);
  }
  if (nonEmpty && value.length === 0) {
    throw new Error(`${context}: ${field} must contain at least one pattern.`);
  }
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new Error(`${context}: ${field}[${index}] must be a non-empty string.`);
    }
  }
}
