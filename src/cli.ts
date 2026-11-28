#!/usr/bin/env node
import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ChangeDetector } from './diff/change-detector.js';
import { RepoScanner } from './scanner/repo-scanner.js';
import {
  assertImpactReport,
  buildEvidenceReport,
  renderMarkdownReport,
  renderTerminalReport,
} from './reporter/reporter.js';
import { renderHtml } from './reporter/html.js';
import { renderSarif } from './reporter/sarif.js';
import type { ChangeSeverity } from './reporter/explanations.js';
import { checkSafeTestModeKeys, validateStripeKey } from './verifier/key-safety.js';
import { assertOpenApiInput, type OpenApiInput } from './diff/structured-diff.js';
import { fetchStripeSpec, type StripeSpecChannel } from './provider/stripe-fetch.js';
import { createConfigFile } from './config/init.js';
import { assertMappingsFile, suggestChanges, type MappingsFile } from './suggest/suggest.js';
import { StripeMockVerifier } from './verifier/stripe-mock-runner.js';
import type { EvidenceReport, ImpactReport, Scenario } from './domain/types.js';
import { err, ok, type Result } from './domain/result.js';
import { DockerNotConfiguredRunner } from './verifier/container-runner.js';
import { Verifier } from './verifier/verifier.js';

type ReportFormat = 'json' | 'markdown' | 'sarif' | 'html';
type FailOn = ChangeSeverity | 'none';
type FailureCode = 'invalid_argument' | 'invalid_input' | 'unsafe_key';

interface CliFailure {
  readonly code: FailureCode;
  readonly message: string;
  readonly exitCode: number;
}

interface ScanOptions {
  repo: string;
  old: string;
  new: string;
  oldVersion: string;
  newVersion: string;
  json?: string;
  markdown?: string;
  sarif?: string;
  html?: string;
  format: string;
  failOnChanges: Result<boolean, CliFailure>;
  failOn: string;
}

interface VerifyOptions {
  repo: string;
  scenario?: string;
  oldSpec?: string;
  newSpec?: string;
  timeout: Result<number, CliFailure>;
  json?: string;
}

interface ReportOptions {
  repo: string;
  impact: string;
  output: string;
  providerVersion: string;
  sarif?: string;
  html?: string;
  format: string;
  failOn: string;
}

interface SuggestOptions {
  repo: string;
  impact: string;
  mappings: string;
  out: string;
  dryRun: boolean;
}

interface InitOptions {
  path: string;
  repo?: string;
  force: boolean;
}

interface FetchSpecOptions {
  version: string;
  commit: string;
  out: string;
  channel: string;
}

const program = new Command();
const noFailOnChanges: Result<boolean, CliFailure> = ok(false);
const defaultTimeout: Result<number, CliFailure> = ok(30);

program
  .name('dokimana')
  .description('Stripe breaking-change evidence for pull requests')
  .version('0.1.0');

program
  .command('scan')
  .requiredOption('-r, --repo <path>', 'Repository root')
  .requiredOption('-o, --old <file>', 'Old structured OpenAPI JSON')
  .requiredOption('-n, --new <file>', 'New structured OpenAPI JSON')
  .requiredOption('--old-version <version>', 'Old provider version')
  .requiredOption('--new-version <version>', 'New provider version')
  .option('--json <file>', 'Write machine-readable impact report')
  .option('--markdown <file>', 'Write Markdown evidence report')
  .option('--sarif <file>', 'Write SARIF report')
  .option('--html <file>', 'Write self-contained HTML report')
  .option(
    '--format <format>',
    'Output written to stdout: json, markdown, sarif, or html',
    'markdown',
  )
  .option(
    '--fail-on-changes <boolean>',
    'Exit with code 1 when structural changes are found',
    parseBoolean,
    noFailOnChanges,
  )
  .option(
    '--fail-on <level>',
    'Exit with code 1 when a change or finding reaches this level: high, medium, low, or none',
    'none',
  )
  .action(async (options: ScanOptions) => {
    const keyFailure = unsafeKeyFailure();
    if (keyFailure) {
      reportFailure(keyFailure);
      return;
    }
    const format = parseFormat(options.format);
    if (!format.ok) {
      reportFailure(format.error);
      return;
    }
    const failOn = parseFailOn(options.failOn);
    if (!failOn.ok) {
      reportFailure(failOn.error);
      return;
    }
    if (!options.failOnChanges.ok) {
      reportFailure(options.failOnChanges.error);
      return;
    }
    const oldJson = await readJsonFile(resolve(options.old));
    if (!oldJson.ok) {
      reportFailure(oldJson.error);
      return;
    }
    const newJson = await readJsonFile(resolve(options.new));
    if (!newJson.ok) {
      reportFailure(newJson.error);
      return;
    }
    const oldInput = validateOpenApiInput(oldJson.value, options.old);
    if (!oldInput.ok) {
      reportFailure(oldInput.error);
      return;
    }
    const newInput = validateOpenApiInput(newJson.value, options.new);
    if (!newInput.ok) {
      reportFailure(newInput.error);
      return;
    }
    const changes = new ChangeDetector().diff({
      oldDocument: oldInput.value,
      newDocument: newInput.value,
      oldVersion: options.oldVersion,
      newVersion: options.newVersion,
    });
    const impact = await new RepoScanner().scan(resolve(options.repo), changes);
    const evidence = buildEvidenceReport({
      repository: resolve(options.repo),
      providerVersion: newInput.value.info?.version ?? options.newVersion,
      impact,
      verification: [],
    });

    if (options.json) await writeFile(resolve(options.json), JSON.stringify(impact, null, 2));
    if (options.markdown) {
      await writeFile(resolve(options.markdown), renderMarkdownReport(evidence));
    }
    if (options.sarif) await writeFile(resolve(options.sarif), renderSarif(evidence));
    if (options.html) await writeFile(resolve(options.html), renderHtml(evidence));

    console.log(formatReport(evidence, format.value));
    applyFailurePolicy(evidence, format.value, options.failOnChanges.value, failOn.value);
  });

program
  .command('verify')
  .description('Validate a scenario and report isolated execution status')
  .requiredOption('-r, --repo <path>', 'Repository root')
  .option('--scenario <file>', 'Scenario JSON file')
  .option('--old-spec <file>', 'Baseline OpenAPI spec for an isolated stripe-mock run')
  .option('--new-spec <file>', 'Candidate OpenAPI spec for an isolated stripe-mock run')
  .option(
    '--timeout <seconds>',
    'Timeout for each isolated container run',
    parsePositiveInteger,
    defaultTimeout,
  )
  .option('--json <file>', 'Write the verification result as JSON')
  .action(async (options: VerifyOptions) => {
    const keyFailure = unsafeKeyFailure();
    if (keyFailure) {
      reportFailure(keyFailure);
      return;
    }
    if (!options.scenario) {
      reportFailure(
        invalidArgument('Provide --scenario to verify; use doctor for a key-safety check.'),
      );
      return;
    }
    if (!options.timeout.ok) {
      reportFailure(options.timeout.error);
      return;
    }
    const scenarioJson = await readJsonFile(resolve(options.scenario));
    if (!scenarioJson.ok) {
      reportFailure(scenarioJson.error);
      return;
    }
    const scenario = parseScenario(scenarioJson.value);
    if (!scenario.ok) {
      reportFailure(scenario.error);
      return;
    }

    const result =
      options.oldSpec && options.newSpec
        ? await new StripeMockVerifier({
            oldSpecPath: resolve(options.oldSpec),
            newSpecPath: resolve(options.newSpec),
            timeoutSeconds: options.timeout.value,
          }).verify(scenario.value, process.env)
        : await new Verifier(new DockerNotConfiguredRunner(), resolve(options.repo)).verify(
            scenario.value,
            process.env,
          );
    if (options.json) await writeFile(resolve(options.json), JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify({
        scenarioId: result.scenarioId,
        classification: result.classification,
        reason: result.reason,
      }),
    );
    if (
      result.classification === 'could_not_run' ||
      result.classification === 'unexplained_difference'
    ) {
      process.exitCode = 1;
    }
  });

program
  .command('report')
  .requiredOption('-r, --repo <path>', 'Repository root')
  .requiredOption('-i, --impact <file>', 'Impact report JSON')
  .requiredOption('-o, --output <file>', 'Markdown evidence report')
  .option('--provider-version <version>', 'Provider version', 'unknown')
  .option('--sarif <file>', 'Write SARIF report')
  .option('--html <file>', 'Write self-contained HTML report')
  .option(
    '--format <format>',
    'Output written to stdout: json, markdown, sarif, or html',
    'markdown',
  )
  .option('--fail-on <level>', 'Exit with code 1 at this level: high, medium, low, or none', 'none')
  .action(async (options: ReportOptions) => {
    const format = parseFormat(options.format);
    if (!format.ok) {
      reportFailure(format.error);
      return;
    }
    const failOn = parseFailOn(options.failOn);
    if (!failOn.ok) {
      reportFailure(failOn.error);
      return;
    }
    const impactJson = await readJsonFile(resolve(options.impact));
    if (!impactJson.ok) {
      reportFailure(impactJson.error);
      return;
    }
    const impact = validateImpactReport(impactJson.value, options.impact);
    if (!impact.ok) {
      reportFailure(impact.error);
      return;
    }
    const evidence = buildEvidenceReport({
      repository: resolve(options.repo),
      providerVersion: options.providerVersion,
      impact: impact.value,
      verification: [],
    });
    await writeFile(resolve(options.output), renderMarkdownReport(evidence));
    if (options.sarif) await writeFile(resolve(options.sarif), renderSarif(evidence));
    if (options.html) await writeFile(resolve(options.html), renderHtml(evidence));
    console.log(formatReport(evidence, format.value));
    applyFailurePolicy(evidence, format.value, false, failOn.value);
  });

program
  .command('suggest')
  .description('Generate a read-only suggested patch from explicit field mappings')
  .requiredOption('-r, --repo <path>', 'Repository root')
  .requiredOption('-i, --impact <file>', 'Impact report JSON')
  .requiredOption('-m, --mappings <file>', 'JSON object of field-path mappings')
  .option('-o, --out <file>', 'Patch output file', 'dokimana-suggested.patch')
  .option('--dry-run', 'Print the patch without writing a file', false)
  .action(async (options: SuggestOptions) => {
    const impactJson = await readJsonFile(resolve(options.impact));
    if (!impactJson.ok) {
      reportFailure(impactJson.error);
      return;
    }
    const impact = validateImpactReport(impactJson.value, options.impact);
    if (!impact.ok) {
      reportFailure(impact.error);
      return;
    }
    const mappingsJson = await readJsonFile(resolve(options.mappings));
    if (!mappingsJson.ok) {
      reportFailure(mappingsJson.error);
      return;
    }
    const mappings = validateMappingsFile(mappingsJson.value, options.mappings);
    if (!mappings.ok) {
      reportFailure(mappings.error);
      return;
    }
    const result = suggestChanges({
      root: resolve(options.repo),
      impact: impact.value,
      mappings: mappings.value,
    });
    if (!options.dryRun) {
      await writeFile(resolve(options.out), result.patch, 'utf8');
    }
    console.log(
      JSON.stringify(
        {
          dryRun: options.dryRun,
          patchPath: options.dryRun ? undefined : resolve(options.out),
          patchBytes: Buffer.byteLength(result.patch, 'utf8'),
          summary: result.summary,
          applied: result.applied,
          needsHuman: result.needsHuman,
          patch: options.dryRun ? result.patch : undefined,
        },
        null,
        2,
      ),
    );
  });

program
  .command('init')
  .description('Write a starter dokimana.json config file')
  .option('--path <file>', 'Config output path', 'dokimana.json')
  .option('--repo <path>', 'Repository root recorded in the config')
  .option('--force', 'Overwrite an existing config file', false)
  .action(async (options: InitOptions) => {
    const result = await createConfigFile({
      path: resolve(options.path),
      ...(options.repo === undefined ? {} : { repo: options.repo }),
      overwrite: options.force,
    });
    console.log(
      result.created
        ? `Wrote ${result.path}. Review the spec paths before running a scan.`
        : `${result.path} already exists; use --force to overwrite it.`,
    );
  });

program
  .command('fetch-spec')
  .description('Explicitly download a pinned public Stripe OpenAPI spec')
  .requiredOption('--version <version>', 'Exact Stripe API version reported by the spec')
  .requiredOption('--commit <sha>', 'Full 40-character stripe/openapi commit SHA')
  .requiredOption('--out <file>', 'Destination JSON file')
  .option('--channel <channel>', 'Spec channel: latest, preview, or openapi', 'latest')
  .action(async (options: FetchSpecOptions) => {
    const keyFailure = unsafeKeyFailure();
    if (keyFailure) {
      reportFailure(keyFailure);
      return;
    }
    const channel = parseChannel(options.channel);
    if (!channel.ok) {
      reportFailure(channel.error);
      return;
    }
    const result = await fetchStripeSpec({
      version: options.version,
      commit: options.commit,
      out: options.out,
      channel: channel.value,
    });
    console.log(
      `Wrote ${result.outputPath} (${String(result.bytes)} bytes, sha256 ${result.sha256}, commit ${result.commit}).`,
    );
    console.log(`Checksum written to ${result.checksumPath}.`);
  });

program
  .command('doctor')
  .description('Check local environment and Stripe key safety')
  .action((): void => {
    const keyFailure = unsafeKeyFailure();
    if (keyFailure) {
      reportFailure(keyFailure);
      return;
    }
    const key = process.env.STRIPE_SECRET_KEY;
    const result = validateStripeKey(key);
    if (!result.safe) {
      console.error(result.reason);
      process.exitCode = 1;
      return;
    }
    console.log(`Stripe key: ${key ? 'test-mode key detected' : 'not configured'}`);
    console.log('Live Stripe access: blocked');
  });

void program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});

function formatReport(report: EvidenceReport, format: ReportFormat): string {
  if (format === 'json') return JSON.stringify(report, null, 2);
  if (format === 'sarif') return renderSarif(report);
  if (format === 'html') return renderHtml(report);
  const counts = report.changes.length;
  const findings = report.findings.length;
  return [
    `Found ${String(counts)} structured changes and ${String(findings)} impact findings.`,
    renderTerminalReport(report),
  ].join('\n');
}

function applyFailurePolicy(
  report: EvidenceReport,
  format: ReportFormat,
  failOnChanges: boolean,
  failOn: FailOn,
): void {
  const reasons: string[] = [];
  if (failOnChanges && report.changes.length > 0) {
    reasons.push(`${String(report.changes.length)} structural change(s) were found`);
  }
  if (failOn !== 'none' && reachesThreshold(report, failOn)) {
    reasons.push(`a change or finding reached the ${failOn} level`);
  }
  if (reasons.length > 0) {
    if (format === 'markdown') {
      console.error(`Failing scan because ${reasons.join(' and ')}.`);
    }
    process.exitCode = 1;
  }
}

function reachesThreshold(report: EvidenceReport, failOn: Exclude<FailOn, 'none'>): boolean {
  const ranks: Record<ChangeSeverity, number> = { low: 1, medium: 2, high: 3 };
  const threshold = ranks[failOn];
  return (
    report.changes.some((change) => {
      const kind = change.kind;
      return (
        ranks[
          kind.startsWith('expandable') || kind.endsWith('enum_value_removed') ? 'medium' : 'high'
        ] >= threshold
      );
    }) || report.findings.some((finding) => ranks[finding.confidence] >= threshold)
  );
}

function invalidArgument(message: string): CliFailure {
  return { code: 'invalid_argument', message, exitCode: 1 };
}

function invalidInputFromError(error: unknown): CliFailure {
  return { code: 'invalid_input', message: describeError(error), exitCode: 1 };
}

function unsafeKeyFailure(): CliFailure | undefined {
  const result = checkSafeTestModeKeys(process.env);
  return result.safe ? undefined : { code: 'unsafe_key', message: result.reason, exitCode: 1 };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reportFailure(failure: CliFailure): void {
  console.error(failure.message);
  process.exitCode = failure.exitCode;
}

async function readJsonFile(path: string): Promise<Result<unknown, CliFailure>> {
  try {
    const text = await readFile(path, 'utf8');
    return ok(JSON.parse(text) as unknown);
  } catch (error) {
    return err({
      code: 'invalid_input',
      message: `${path}: ${describeError(error)}`,
      exitCode: 1,
    });
  }
}

function validateOpenApiInput(value: unknown, label: string): Result<OpenApiInput, CliFailure> {
  try {
    assertOpenApiInput(value, label);
    return ok(value);
  } catch (error) {
    return err(invalidInputFromError(error));
  }
}

function validateImpactReport(value: unknown, label: string): Result<ImpactReport, CliFailure> {
  try {
    assertImpactReport(value, label);
    return ok(value);
  } catch (error) {
    return err(invalidInputFromError(error));
  }
}

function validateMappingsFile(value: unknown, label: string): Result<MappingsFile, CliFailure> {
  try {
    assertMappingsFile(value, label);
    return ok(value);
  } catch (error) {
    return err(invalidInputFromError(error));
  }
}

function parseBoolean(value: string): Result<boolean, CliFailure> {
  if (value === 'true') return ok(true);
  if (value === 'false') return ok(false);
  return err(invalidArgument(`Expected "true" or "false", received "${value}".`));
}

function parsePositiveInteger(value: string): Result<number, CliFailure> {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return err(invalidArgument(`Expected a positive integer, received "${value}".`));
  }
  return ok(parsed);
}

function parseFormat(value: string): Result<ReportFormat, CliFailure> {
  if (value === 'json' || value === 'markdown' || value === 'sarif' || value === 'html') {
    return ok(value);
  }
  return err(
    invalidArgument(`Expected "json", "markdown", "sarif", or "html", received "${value}".`),
  );
}

function parseFailOn(value: string): Result<FailOn, CliFailure> {
  if (value === 'none' || value === 'high' || value === 'medium' || value === 'low') {
    return ok(value);
  }
  return err(invalidArgument(`Expected "high", "medium", "low", or "none", received "${value}".`));
}

function parseChannel(value: string): Result<StripeSpecChannel, CliFailure> {
  if (value === 'latest' || value === 'preview' || value === 'openapi') return ok(value);
  return err(invalidArgument(`Expected "latest", "preview", or "openapi", received "${value}".`));
}

function parseScenario(value: unknown): Result<Scenario, CliFailure> {
  try {
    return ok(readScenario(value));
  } catch (error) {
    return err(invalidInputFromError(error));
  }
}

function readScenario(value: unknown): Scenario {
  if (!isRecord(value)) throw new Error('Scenario must be a JSON object.');
  const id = readScenarioString(value, 'id');
  const name = readScenarioString(value, 'name');
  const description = readScenarioString(value, 'description');
  const apiVersion = readScenarioString(value, 'apiVersion');
  const operation = readScenarioString(value, 'operation');
  if (!isRecord(value.input)) throw new Error('Scenario field "input" must be a JSON object.');
  if (value.expectedOutput !== undefined && !isRecord(value.expectedOutput)) {
    throw new Error('Scenario field "expectedOutput" must be a JSON object when provided.');
  }

  return {
    id,
    name,
    description,
    apiVersion,
    operation,
    input: value.input,
    ...(value.expectedOutput === undefined ? {} : { expectedOutput: value.expectedOutput }),
  };
}

function readScenarioString(value: Record<string, unknown>, field: string): string {
  const entry = value[field];
  if (typeof entry !== 'string' || entry.length === 0) {
    throw new Error(`Scenario field "${field}" must be a non-empty string.`);
  }
  return entry;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
