#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const usage = `Usage: node scripts/generate-site-example.mjs --terminal <file> --markdown <file> [options]

Reads only two CLI-generated outputs: the stdout of \`npm start -- report\`
and the evidence Markdown written by that command. It writes deterministic
site data without executing repository code, importing modules, or using the network.

Options:
  --terminal <file>       Captured stdout from the report command (required)
  --markdown <file>       Evidence Markdown from the report command (required)
  --output-dir <dir>      Destination directory (default: site/data)
  --old <path>            Display path for the old fixture input
  --new <path>            Display path for the new fixture input
  --old-version <label>   Display label for the old version
  --new-version <label>   Display label for the new version
  --max-items <number>    Maximum entries per sample list (default: 4)
  --help                  Show this message
`;

const defaults = {
  'output-dir': 'site/data',
  old: 'src/diff/fixtures/stripe-real-old.json',
  new: 'src/diff/fixtures/stripe-real-new.json',
  'old-version': 'stripe-real-old',
  'new-version': 'stripe-real-new',
  'max-items': '4',
};

function parseArguments(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') return null;
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const separator = argument.indexOf('=');
    const name = separator === -1 ? argument.slice(2) : argument.slice(2, separator);
    if (!(name in defaults) && name !== 'terminal' && name !== 'markdown') {
      throw new Error(`Unknown option: --${name}`);
    }
    const value = separator === -1 ? argv[++index] : argument.slice(separator + 1);
    if (value === undefined || value.length === 0 || value.startsWith('--')) {
      throw new Error(`Option --${name} requires a value.`);
    }
    options[name] = value;
  }
  if (!options.terminal || !options.markdown) {
    throw new Error('Both --terminal and --markdown are required.');
  }
  const maxItems = Number.parseInt(options['max-items'], 10);
  if (!Number.isInteger(maxItems) || maxItems < 1) {
    throw new Error('--max-items must be a positive integer.');
  }
  options.maxItems = maxItems;
  return options;
}

function inputPath(value) {
  return isAbsolute(value) ? value : resolve(repositoryRoot, value);
}

function assertSafeLabel(value, flag, pattern) {
  if (!pattern.test(value)) throw new Error(`${flag} contains unsupported characters.`);
}

function stripControls(value) {
  return [...value]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? ' ' : character;
    })
    .join('');
}

function normalizeTerminalLine(line) {
  const value = stripControls(line).trimEnd();
  return value.startsWith('Repository:') ? 'Repository: .' : value;
}

function parseTerminal(text) {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeTerminalLine)
    .filter((line) => line.length > 0);
  const counts = {};
  const patterns = [
    ['changes', /^Changes: (\d+)$/],
    ['callSites', /^Affected call sites: (\d+)$/],
    ['needsHuman', /^Needs human review: (\d+)$/],
  ];
  for (const [field, pattern] of patterns) {
    const line = lines.find((entry) => pattern.test(entry));
    if (!line) throw new Error(`Terminal report is missing the ${field} count.`);
    const parsed = Number.parseInt(line.match(pattern)[1], 10);
    if (!Number.isSafeInteger(parsed)) throw new Error(`Terminal report has an invalid ${field} count.`);
    counts[field] = parsed;
  }
  const versionLine = lines.find((line) => line.startsWith('Provider version:'));
  if (!versionLine) throw new Error('Terminal report is missing the provider version.');
  const providerVersion = versionLine.slice('Provider version:'.length).trim();
  assertSafeLabel(providerVersion, 'provider version', /^[A-Za-z0-9._-]+$/);
  return { lines, counts, providerVersion };
}

function decodeEntities(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#124;', '|')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function decodeMarkdown(value) {
  return decodeEntities(value)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+.!|>~-])/g, '$1')
    .replace(/<br>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectSection(lines, heading) {
  const target = `## ${heading}`;
  const collected = [];
  let active = false;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (active) break;
      active = line.trim() === target;
      continue;
    }
    if (active && line.trim().length > 0) collected.push(line.trim());
  }
  return collected;
}

function parseStructuredChanges(lines) {
  const rows = lines.filter((line) => line.startsWith('|')).slice(2);
  return rows.flatMap((row) => {
    const cells = row.split('|').slice(1, -1).map((cell) => decodeMarkdown(cell));
    if (cells.length < 7) return [];
    const [context, kind, resource, path, oldValue, newValue, evidence] = cells;
    const target = path && path !== '—' ? `${resource}.${path}` : resource;
    const nextValue = newValue === '—' ? 'removed' : newValue;
    return [`[${context}] ${kind} ${target}: ${oldValue} -> ${nextValue} — ${evidence}`];
  });
}

function parseBullets(lines) {
  return lines
    .filter((line) => line.startsWith('- '))
    .map((line) => decodeMarkdown(line.slice(2)));
}

function parseVerification(lines) {
  const bullets = parseBullets(lines);
  if (bullets.length > 0) return bullets;
  const note = lines.find((line) => line.startsWith('_') && line.endsWith('_'));
  return note ? [decodeMarkdown(note.replace(/^_/, '').replace(/_$/, ''))] : [];
}

function parseMarkdown(text) {
  const lines = text.split(/\r?\n/);
  const sections = {
    changes: collectSection(lines, 'Structured Changes'),
    callSites: collectSection(lines, 'Call-Site Findings'),
    needsHuman: collectSection(lines, 'Needs Human Review'),
    verification: collectSection(lines, 'Verification'),
    limitations: collectSection(lines, 'Coverage and Limitations'),
  };
  for (const [name, section] of Object.entries(sections)) {
    if (section.length === 0) throw new Error(`Evidence Markdown is missing the ${name} section.`);
  }
  const versionLine = lines.find((line) => line.startsWith('- **Provider version:**'));
  if (!versionLine) throw new Error('Evidence Markdown is missing the provider version.');
  const providerVersion = decodeMarkdown(versionLine.slice('- **Provider version:**'.length));
  return {
    providerVersion,
    changes: parseStructuredChanges(sections.changes),
    callSites: parseBullets(sections.callSites),
    needsHuman: parseBullets(sections.needsHuman),
    verification: parseVerification(sections.verification),
    limitations: parseBullets(sections.limitations),
  };
}

function assertCountsMatch(terminal, markdown) {
  const pairs = [
    ['changes', 'structured changes'],
    ['callSites', 'call-site findings'],
    ['needsHuman', 'needs-human entries'],
  ];
  for (const [field, label] of pairs) {
    if (markdown[field].length !== terminal.counts[field]) {
      throw new Error(
        `Markdown ${label} (${markdown[field].length}) do not match the terminal count (${terminal.counts[field]}).`,
      );
    }
  }
  if (markdown.providerVersion !== terminal.providerVersion) {
    throw new Error('Provider version differs between the terminal report and the evidence Markdown.');
  }
}

function assertNoSecrets(values) {
  if (/sk_live_|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(values.join('\n'))) {
    throw new Error('Refusing to write generated site data that contains key material.');
  }
}

function truncationNote(label, total, shown) {
  return total > shown
    ? `Showing the first ${shown} of ${total} ${label}; the full list is in the generated evidence file.`
    : `Showing all ${total} ${label}.`;
}

function reportCommand(providerVersion) {
  return [
    'npm start -- report \\',
    '  --repo . \\',
    '  --impact dokimana-impact.json \\',
    `  --provider-version ${providerVersion} \\`,
    '  --output dokimana-evidence.md',
  ].join('\n');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options === null) {
    process.stdout.write(usage);
    return;
  }

  assertSafeLabel(options.old, '--old', /^[A-Za-z0-9._/-]+$/);
  assertSafeLabel(options.new, '--new', /^[A-Za-z0-9._/-]+$/);
  assertSafeLabel(options['old-version'], '--old-version', /^[A-Za-z0-9._-]+$/);
  assertSafeLabel(options['new-version'], '--new-version', /^[A-Za-z0-9._-]+$/);

  const [terminalText, markdownText] = await Promise.all([
    readFile(inputPath(options.terminal), 'utf8'),
    readFile(inputPath(options.markdown), 'utf8'),
  ]);
  if (terminalText.trim().length === 0 || markdownText.trim().length === 0) {
    throw new Error('Both CLI-generated inputs must be non-empty.');
  }

  const terminal = parseTerminal(terminalText);
  const markdown = parseMarkdown(markdownText);
  assertCountsMatch(terminal, markdown);

  const maxItems = options.maxItems;
  const summary = [
    { label: 'Structured changes', value: String(terminal.counts.changes) },
    { label: 'Affected call sites', value: String(terminal.counts.callSites) },
    { label: 'Needs human review', value: String(terminal.counts.needsHuman) },
  ];
  const sections = [
    ['changes', 'structured changes'],
    ['callSites', 'call-site findings'],
    ['needsHuman', 'needs-human entries'],
    ['verification', 'verification results'],
    ['limitations', 'limitations'],
  ];
  const truncation = sections.map(([field, label]) =>
    truncationNote(label, markdown[field].length, Math.min(maxItems, markdown[field].length)),
  );

  const exampleRun = {
    status: 'generated',
    source:
      'Captured stdout of npm start -- report plus the evidence Markdown from the same command. No count is added by the generator.',
    commands: [reportCommand(terminal.providerVersion)],
    output: terminal.lines,
  };
  const exampleReport = {
    status: 'generated',
    note: 'Trimmed sample. Counts come from the CLI terminal report; entries come from the generated evidence Markdown.',
    generatedFrom: [options.old, options.new, options['old-version'], options['new-version']],
    summary,
    changes: markdown.changes.slice(0, maxItems),
    callSites: markdown.callSites.slice(0, maxItems),
    needsHuman: markdown.needsHuman.slice(0, maxItems),
    verification: markdown.verification.slice(0, maxItems),
    limitations: markdown.limitations.slice(0, maxItems),
    truncation,
  };

  assertNoSecrets([...exampleRun.commands, ...exampleRun.output, ...truncation, ...Object.values(exampleReport).flat()]);

  const outputDirectory = inputPath(options['output-dir']);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      join(outputDirectory, 'example-run.json'),
      `${JSON.stringify(exampleRun, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      join(outputDirectory, 'example-report.json'),
      `${JSON.stringify(exampleReport, null, 2)}\n`,
      'utf8',
    ),
  ]);
  process.stdout.write(
    `Wrote ${join(outputDirectory, 'example-run.json')} and ${join(outputDirectory, 'example-report.json')}.\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`generate-site-example: ${message}\n`);
  process.exitCode = 1;
});
