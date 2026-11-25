#!/usr/bin/env node
import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ChangeDetector } from './diff/change-detector.js';
import { RepoScanner } from './scanner/repo-scanner.js';
import {
  buildEvidenceReport,
  renderMarkdownReport,
  renderTerminalReport,
} from './reporter/reporter.js';
import { assertSafeTestModeKeys, validateStripeKey } from './verifier/key-safety.js';
import type { OpenApiInput } from './diff/structured-diff.js';
import type { Scenario } from './domain/types.js';
import { DockerNotConfiguredRunner } from './verifier/container-runner.js';
import { Verifier } from './verifier/verifier.js';

const program = new Command();
program
  .name('apiproof')
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
  .option(
    '--fail-on-changes <boolean>',
    'Exit with code 1 when structural changes are found',
    parseBoolean,
    false,
  )
  .action(async (options) => {
    const oldDocument = JSON.parse(await readFile(resolve(options.old), 'utf8')) as OpenApiInput;
    const newDocument = JSON.parse(await readFile(resolve(options.new), 'utf8')) as OpenApiInput;
    const changes = new ChangeDetector().diff({
      oldDocument,
      newDocument,
      oldVersion: options.oldVersion,
      newVersion: options.newVersion,
    });
    const impact = await new RepoScanner().scan(resolve(options.repo), changes);
    if (options.json) await writeFile(resolve(options.json), JSON.stringify(impact, null, 2));
    if (options.markdown) {
      const evidence = buildEvidenceReport({
        repository: resolve(options.repo),
        providerVersion: newDocument.info?.version ?? options.newVersion,
        impact,
        patches: [],
        verification: [],
      });
      await writeFile(resolve(options.markdown), renderMarkdownReport(evidence));
    }
    console.log(
      `Found ${changes.length} structured changes and ${impact.findings.length} impact findings.`,
    );
    if (options.failOnChanges && changes.length > 0) {
      console.error(`Failing scan because ${changes.length} structural change(s) were found.`);
      process.exitCode = 1;
    }
  });

program
  .command('verify')
  .description('Validate a scenario and report isolated execution status')
  .requiredOption('-r, --repo <path>', 'Repository root')
  .option('--scenario <file>', 'Scenario JSON file')
  .option('--json <file>', 'Write the verification result as JSON')
  .action(async (options) => {
    assertSafeTestModeKeys(process.env);
    if (!options.scenario) {
      throw new Error('Provide --scenario to verify; use doctor for a key-safety check.');
    }

    const scenario = parseScenario(JSON.parse(await readFile(resolve(options.scenario), 'utf8')));
    const result = await new Verifier(
      new DockerNotConfiguredRunner(),
      resolve(options.repo),
    ).verify(scenario, process.env);
    if (options.json) await writeFile(resolve(options.json), JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify({
        scenarioId: result.scenarioId,
        classification: result.classification,
        reason: result.reason,
      }),
    );
    if (result.classification === 'could_not_run') process.exitCode = 1;
  });

program
  .command('report')
  .requiredOption('-r, --repo <path>', 'Repository root')
  .requiredOption('-i, --impact <file>', 'Impact report JSON')
  .requiredOption('-o, --output <file>', 'Markdown evidence report')
  .option('--provider-version <version>', 'Provider version', 'unknown')
  .action(async (options) => {
    const impact = JSON.parse(await readFile(resolve(options.impact), 'utf8'));
    const evidence = buildEvidenceReport({
      repository: resolve(options.repo),
      providerVersion: options.providerVersion,
      impact,
      patches: [],
      verification: [],
    });
    await writeFile(resolve(options.output), renderMarkdownReport(evidence));
    console.log(renderTerminalReport(evidence));
  });

program
  .command('doctor')
  .description('Check local environment and Stripe key safety')
  .action(() => {
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

function parseBoolean(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Expected "true" or "false", received "${value}".`);
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
