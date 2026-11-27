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
import { assertSafeTestModeKeys, validateStripeKey } from './verifier/key-safety.js';
import { assertOpenApiInput } from './diff/structured-diff.js';
import { fetchStripeSpec, type StripeSpecChannel } from './provider/stripe-fetch.js';
import { createConfigFile } from './config/init.js';
import { assertMappingsFile, suggestChanges, type MappingsFile } from './suggest/suggest.js';
import { StripeMockVerifier } from './verifier/stripe-mock-runner.js';
import type { EvidenceReport, ImpactReport, Scenario } from './domain/types.js';
import { DockerNotConfiguredRunner } from './verifier/container-runner.js';
import { Verifier } from './verifier/verifier.js';

type ReportFormat = 'json' | 'markdown' | 'sarif' | 'html';
type FailOn = ChangeSeverity | 'none';

const program = new Command();
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
    false,
  )
  .option(
    '--fail-on <level>',
    'Exit with code 1 when a change or finding reaches this level: high, medium, low, or none',
    'none',
  )
  .action(async (options) => {
    assertSafeTestModeKeys(process.env);
    const format = parseFormat(options.format);
    const failOn = parseFailOn(options.failOn);
    const oldDocument: unknown = JSON.parse(await readFile(resolve(options.old), 'utf8'));
    const newDocument: unknown = JSON.parse(await readFile(resolve(options.new), 'utf8'));
    assertOpenApiInput(oldDocument, options.old);
    assertOpenApiInput(newDocument, options.new);
    const changes = new ChangeDetector().diff({
      oldDocument,
      newDocument,
      oldVersion: options.oldVersion,
      newVersion: options.newVersion,
    });
    const impact = await new RepoScanner().scan(resolve(options.repo), changes);
    const evidence = buildEvidenceReport({
      repository: resolve(options.repo),
      providerVersion: newDocument.info?.version ?? options.newVersion,
      impact,
      verification: [],
    });

    if (options.json) await writeFile(resolve(options.json), JSON.stringify(impact, null, 2));
    if (options.markdown) {
      await writeFile(resolve(options.markdown), renderMarkdownReport(evidence));
    }
    if (options.sarif) await writeFile(resolve(options.sarif), renderSarif(evidence));
    if (options.html) await writeFile(resolve(options.html), renderHtml(evidence));

    console.log(formatReport(evidence, format));
    applyFailurePolicy(evidence, format, options.failOnChanges, failOn);
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
    30,
  )
  .option('--json <file>', 'Write the verification result as JSON')
  .action(async (options) => {
    assertSafeTestModeKeys(process.env);
    if (!options.scenario) {
      throw new Error('Provide --scenario to verify; use doctor for a key-safety check.');
    }

    const scenario = parseScenario(JSON.parse(await readFile(resolve(options.scenario), 'utf8')));
    const result =
      options.oldSpec && options.newSpec
        ? await new StripeMockVerifier({
            oldSpecPath: resolve(options.oldSpec),
            newSpecPath: resolve(options.newSpec),
            timeoutSeconds: options.timeout,
          }).verify(scenario, process.env)
        : await new Verifier(new DockerNotConfiguredRunner(), resolve(options.repo)).verify(
            scenario,
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
  .action(async (options) => {
    const impact: unknown = JSON.parse(await readFile(resolve(options.impact), 'utf8'));
    assertImpactReport(impact, options.impact);
    const evidence = buildEvidenceReport({
      repository: resolve(options.repo),
      providerVersion: options.providerVersion,
      impact,
      verification: [],
    });
    await writeFile(resolve(options.output), renderMarkdownReport(evidence));
    if (options.sarif) await writeFile(resolve(options.sarif), renderSarif(evidence));
    if (options.html) await writeFile(resolve(options.html), renderHtml(evidence));
    console.log(formatReport(evidence, parseFormat(options.format)));
    applyFailurePolicy(evidence, parseFormat(options.format), false, parseFailOn(options.failOn));
  });

program
  .command('suggest')
  .description('Generate a read-only suggested patch from explicit field mappings')
  .requiredOption('-r, --repo <path>', 'Repository root')
  .requiredOption('-i, --impact <file>', 'Impact report JSON')
  .requiredOption('-m, --mappings <file>', 'JSON object of field-path mappings')
  .option('-o, --out <file>', 'Patch output file', 'dokimana-suggested.patch')
  .option('--dry-run', 'Print the patch without writing a file', false)
  .action(async (options) => {
    const impact: unknown = JSON.parse(await readFile(resolve(options.impact), 'utf8'));
    assertImpactReport(impact, options.impact);
    const mappings: unknown = JSON.parse(await readFile(resolve(options.mappings), 'utf8'));
    assertMappingsFile(mappings, options.mappings);
    const result = suggestChanges({
      root: resolve(options.repo),
      impact: impact as ImpactReport,
      mappings: mappings as MappingsFile,
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
  .action(async (options) => {
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
  .action(async (options) => {
    assertSafeTestModeKeys(process.env);
    const result = await fetchStripeSpec({
      version: options.version,
      commit: options.commit,
      out: options.out,
      channel: parseChannel(options.channel),
    });
    console.log(
      `Wrote ${result.outputPath} (${result.bytes} bytes, sha256 ${result.sha256}, commit ${result.commit}).`,
    );
    console.log(`Checksum written to ${result.checksumPath}.`);
  });

program
  .command('doctor')
  .description('Check local environment and Stripe key safety')
  .action(() => {
    assertSafeTestModeKeys(process.env);
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

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

function formatReport(report: EvidenceReport, format: ReportFormat): string {
  if (format === 'json') return JSON.stringify(report, null, 2);
  if (format === 'sarif') return renderSarif(report);
  if (format === 'html') return renderHtml(report);
  const counts = report.changes.length;
  const findings = report.findings.length;
  return [
    `Found ${counts} structured changes and ${findings} impact findings.`,
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
    reasons.push(`${report.changes.length} structural change(s) were found`);
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

function parseBoolean(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Expected "true" or "false", received "${value}".`);
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, received "${value}".`);
  }
  return parsed;
}

function parseFormat(value: string): ReportFormat {
  if (value === 'json' || value === 'markdown' || value === 'sarif' || value === 'html') {
    return value;
  }
  throw new Error(`Expected "json", "markdown", "sarif", or "html", received "${value}".`);
}

function parseFailOn(value: string): FailOn {
  if (value === 'none' || value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }
  throw new Error(`Expected "high", "medium", "low", or "none", received "${value}".`);
}

function parseChannel(value: string): StripeSpecChannel {
  if (value === 'latest' || value === 'preview' || value === 'openapi') return value;
  throw new Error(`Expected "latest", "preview", or "openapi", received "${value}".`);
}

function parseScenario(value: unknown): Scenario {
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
