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
  .action(async (options) => {
    const oldDocument = JSON.parse(await readFile(resolve(options.old), 'utf8')) as object;
    const newDocument = JSON.parse(await readFile(resolve(options.new), 'utf8')) as object;
    const changes = new ChangeDetector().diff({
      oldDocument: oldDocument as OpenApiInput,
      newDocument: newDocument as OpenApiInput,
      oldVersion: options.oldVersion,
      newVersion: options.newVersion,
    });
    const impact = await new RepoScanner().scan(resolve(options.repo), changes);
    if (options.json) await writeFile(resolve(options.json), JSON.stringify(impact, null, 2));
    console.log(
      `Found ${changes.length} structured changes and ${impact.findings.length} impact findings.`,
    );
  });

program
  .command('verify')
  .description('Verify scenarios through injectable execution ports')
  .requiredOption('-r, --repo <path>', 'Repository root')
  .option('--scenario <file>', 'Scenario JSON file')
  .action(async () => {
    assertSafeTestModeKeys(process.env);
    console.log('Key safety check passed. No live Stripe key is present.');
    console.log(
      'Execution is not started: configure a container runner implementation before verify.',
    );
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
