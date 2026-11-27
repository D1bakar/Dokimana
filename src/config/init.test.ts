import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertDokimanaConfig,
  createConfigFile,
  defaultConfig,
  renderDokimanaConfig,
  type DokimanaConfig,
} from './init.js';

describe('defaultConfig', () => {
  it('uses the documented local-first defaults', () => {
    const config = defaultConfig();

    expect(config.version).toBe(1);
    expect(config.repo).toBe('.');
    expect(config.oldSpec).toBe('fixtures/stripe-old.json');
    expect(config.newSpec).toBe('fixtures/stripe-new.json');
    expect(config.include).toEqual(['src/**/*.{ts,tsx,js,jsx,mjs,cjs}']);
    expect(config.exclude).toEqual(
      expect.arrayContaining([
        '**/node_modules/**',
        '**/dist/**',
        '**/vendor/**',
        '**/generated/**',
        '**/*.generated.*',
      ]),
    );
    expect(config.failOn).toBe('high');
    expect(config.failOnChanges).toBe(false);
    expect(config.output).toEqual({
      json: 'dokimana-impact.json',
      markdown: 'dokimana-evidence.md',
      sarif: 'dokimana-results.sarif',
      html: 'dokimana-report.html',
    });
  });

  it('uses the supplied repo without changing later defaults', () => {
    const first = defaultConfig({ repo: 'packages/api' });
    const second = defaultConfig();

    expect(first.repo).toBe('packages/api');
    expect(second.repo).toBe('.');
    first.include.push('extra/**/*.ts');
    expect(defaultConfig().include).toEqual(['src/**/*.{ts,tsx,js,jsx,mjs,cjs}']);
  });
});

describe('assertDokimanaConfig', () => {
  it('accepts a generated config', () => {
    expect(() => assertDokimanaConfig(defaultConfig(), 'fixture')).not.toThrow();
  });

  const invalidCases: Array<{ name: string; value: unknown; message: string }> = [
    { name: 'non-object', value: null, message: 'expected an object' },
    {
      name: 'wrong version',
      value: { ...defaultConfig(), version: 2 },
      message: 'version must be 1',
    },
    { name: 'empty repo', value: { ...defaultConfig(), repo: '' }, message: 'repo must be' },
    {
      name: 'bad include entry',
      value: { ...defaultConfig(), include: ['src/**/*.ts', 3] },
      message: 'include[1] must be',
    },
    {
      name: 'empty include',
      value: { ...defaultConfig(), include: [] },
      message: 'include must contain at least one pattern',
    },
    {
      name: 'bad failOn',
      value: { ...defaultConfig(), failOn: 'critical' },
      message: 'failOn must',
    },
    {
      name: 'bad output path',
      value: { ...defaultConfig(), output: { ...defaultConfig().output, sarif: '' } },
      message: 'output.sarif must be',
    },
    {
      name: 'unknown field',
      value: { ...defaultConfig(), unexpected: true },
      message: 'unknown field "unexpected"',
    },
  ];

  it.each(invalidCases)('rejects $name', ({ value, message }) => {
    expect(() => assertDokimanaConfig(value, 'test.json')).toThrow(message);
    expect(() => assertDokimanaConfig(value, 'test.json')).toThrow(/test\.json/);
  });
});

describe('renderDokimanaConfig', () => {
  it('renders deterministic JSON with a trailing newline', () => {
    const config = defaultConfig({ repo: 'service' });
    const rendered = renderDokimanaConfig(config);

    expect(rendered).toBe(`${JSON.stringify(config, null, 2)}\n`);
    expect(rendered.endsWith('\n')).toBe(true);
  });

  it('normalizes property order', () => {
    const config = defaultConfig({ repo: 'service' });
    const reordered: DokimanaConfig = {
      output: {
        html: config.output.html,
        sarif: config.output.sarif,
        markdown: config.output.markdown,
        json: config.output.json,
      },
      failOnChanges: config.failOnChanges,
      failOn: config.failOn,
      exclude: [...config.exclude],
      include: [...config.include],
      newSpec: config.newSpec,
      oldSpec: config.oldSpec,
      repo: config.repo,
      version: 1,
    };

    expect(renderDokimanaConfig(reordered)).toBe(renderDokimanaConfig(config));
  });
});

describe('createConfigFile', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dokimana-config-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('creates a config file and any missing parent directories', async () => {
    const path = join(directory, 'nested', 'dokimana.config.json');

    await expect(createConfigFile({ path, repo: 'service' })).resolves.toEqual({
      path,
      created: true,
    });

    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    assertDokimanaConfig(parsed, 'written config');
    expect(parsed).toEqual(defaultConfig({ repo: 'service' }));
  });

  it('refuses to overwrite an existing config by default', async () => {
    const path = join(directory, 'dokimana.config.json');
    await writeFile(path, 'sentinel', 'utf8');

    await expect(createConfigFile({ path })).resolves.toEqual({ path, created: false });
    expect(await readFile(path, 'utf8')).toBe('sentinel');
  });

  it('overwrites an existing config only when requested', async () => {
    const path = join(directory, 'dokimana.config.json');
    await writeFile(path, 'sentinel', 'utf8');

    await expect(createConfigFile({ path, repo: 'replacement', overwrite: true })).resolves.toEqual(
      { path, created: true },
    );

    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    assertDokimanaConfig(parsed, 'overwritten config');
    expect(parsed.repo).toBe('replacement');
  });
});
