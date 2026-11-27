import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const WORKFLOW_DIR = resolve('.github/workflows');
const PACKAGE_PATH = resolve('package.json');
const LOCK_PATH = resolve('package-lock.json');
const CORPUS_PATH = resolve('scripts/oasdiff-corpus.ts');
const DIVERGENCES_PATH = resolve('docs/DIVERGENCES.md');
const CI_PATH = resolve('.github/workflows/ci.yml');
const RELEASE_PATH = resolve('.github/workflows/release.yml');

const OASDIFF_VERSION = '1.41.0';
const OASDIFF_LINUX_SHA256 = '96365453163118e6503eb71742643d9ee67f91aedbaadd1a1ce9c6213e3b71c7';

const PINNED_ACTIONS: Readonly<Record<string, string>> = {
  'actions/checkout': '11d5960a326750d5838078e36cf38b85af677262', // v4
  'actions/setup-node': '49933ea5288caeca8642d1e84afbd3f7d6820020', // v4
  'changesets/action': '52025003bf4794281597cb5b5e566485d9473389', // v1.5.0
  'peter-evans/create-pull-request': '22a9089034f40e5a961c8808d113e2c98fb63676', // v7
};

// This is a first-party action used by the example workflow. No immutable v1 tag
// was available to verify locally, so it is reported rather than treated as pinned.
const FIRST_PARTY_TAG_EXCEPTIONS = new Set(['D1bakar/Dokimana@v1']);

const EXACT_DEV_DEPENDENCIES: Readonly<Record<string, string>> = {
  '@changesets/cli': '2.29.7',
  '@stryker-mutator/core': '9.6.1',
  '@stryker-mutator/vitest-runner': '9.6.1',
};

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface LockFile {
  lockfileVersion: number;
  packages: Record<string, { version?: string; devDependencies?: Record<string, string> }>;
}

const failures: string[] = [];
const firstPartyTagFindings: string[] = [];
const checkedWorkflows: string[] = [];

function fail(message: string): void {
  failures.push(message);
}

function parsePackageJson(value: unknown, label: string): PackageJson {
  if (!isRecord(value)) {
    fail(`${label} must contain a JSON object.`);
    return {};
  }
  return value as PackageJson;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkActions(source: string, workflow: string): void {
  const usesPattern = /^\s*(?:-\s*)?uses:\s*(\S+)/gm;
  for (const match of source.matchAll(usesPattern)) {
    const uses = match[1];
    if (uses === undefined) continue;
    if (uses.startsWith('./')) continue;

    if (FIRST_PARTY_TAG_EXCEPTIONS.has(uses)) {
      firstPartyTagFindings.push(`${workflow}: ${uses}`);
      continue;
    }

    const pinned = /^([^@\s]+)@([0-9a-f]{40})$/.exec(uses);
    if (!pinned || pinned[1] === undefined || pinned[2] === undefined) {
      fail(`${workflow} uses unpinned action ${uses}.`);
      continue;
    }

    const expected = PINNED_ACTIONS[pinned[1]];
    if (expected === undefined) {
      fail(`${workflow} uses action ${pinned[1]} without a recorded pin.`);
    } else if (expected !== pinned[2]) {
      fail(`${workflow} pins ${pinned[1]} to ${pinned[2]}, expected ${expected}.`);
    }
  }
}

const packageJson = parsePackageJson(
  JSON.parse(await readFile(PACKAGE_PATH, 'utf8')) as unknown,
  'package.json',
);
const packageDevDependencies = packageJson.devDependencies ?? {};
for (const [name, expected] of Object.entries(EXACT_DEV_DEPENDENCIES)) {
  if (packageDevDependencies[name] !== expected) {
    fail(`package.json must pin ${name} to exactly ${expected}.`);
  }
}

const lockValue: unknown = JSON.parse(await readFile(LOCK_PATH, 'utf8'));
if (!isRecord(lockValue)) {
  fail('package-lock.json must contain a JSON object.');
} else {
  const lock = lockValue as unknown as LockFile;
  if (lock.lockfileVersion !== 3) fail('package-lock.json must use lockfileVersion 3.');
  const root = lock.packages[''];
  if (root === undefined) {
    fail('package-lock.json must include the root package entry.');
  } else {
    for (const [name, expected] of Object.entries(EXACT_DEV_DEPENDENCIES)) {
      if (root.devDependencies?.[name] !== expected) {
        fail(`package-lock.json root must pin ${name} to exactly ${expected}.`);
      }
    }
  }
  for (const [name, expected] of Object.entries(EXACT_DEV_DEPENDENCIES)) {
    const installed = lock.packages[`node_modules/${name}`];
    if (installed?.version !== expected) {
      fail(`package-lock.json must lock ${name} to ${expected}.`);
    }
  }
}

const workflowNames = (await readdir(WORKFLOW_DIR)).filter((name) => name.endsWith('.yml')).sort();
for (const name of workflowNames) {
  const path = join(WORKFLOW_DIR, name);
  const source = await readFile(path, 'utf8');
  checkedWorkflows.push(name);
  checkActions(source, name);
}

const corpusSource = await readFile(CORPUS_PATH, 'utf8');
if (!corpusSource.includes(`OASDIFF_VERSION = '${OASDIFF_VERSION}'`)) {
  fail(`oasdiff corpus generator must pin version ${OASDIFF_VERSION}.`);
}

const ciSource = await readFile(CI_PATH, 'utf8');
if (!ciSource.includes(`oasdiff_${OASDIFF_VERSION}_linux_amd64.tar.gz`)) {
  fail(`CI must download pinned oasdiff ${OASDIFF_VERSION}.`);
}
if (!ciSource.includes(OASDIFF_LINUX_SHA256)) {
  fail('CI must verify the pinned Linux oasdiff SHA-256 checksum.');
}

const divergences = await readFile(DIVERGENCES_PATH, 'utf8');
if (!divergences.includes(`Pinned oasdiff version: \`v${OASDIFF_VERSION}\`.`)) {
  fail(`docs/DIVERGENCES.md must state pinned oasdiff v${OASDIFF_VERSION}.`);
}

const releaseSource = await readFile(RELEASE_PATH, 'utf8');
if (!releaseSource.includes('id-token: write')) {
  fail('Release workflow must request id-token: write for npm provenance.');
}
if (!releaseSource.includes('--provenance')) {
  fail('Release publish command must include --provenance.');
}
if (!releaseSource.includes('npm exec -- changeset version')) {
  fail('Release version step must use the locally installed Changesets CLI.');
}
if (/\bnpx\s+/.test(releaseSource)) {
  fail('Release workflow must not use unpinned npx commands.');
}
if (/npm\s+install\b/.test(releaseSource)) {
  fail('Release workflow must not bootstrap unpinned npm installs.');
}

console.log(
  JSON.stringify(
    {
      status: failures.length === 0 ? 'pass' : 'fail',
      checkedWorkflows,
      exactDevDependencies: EXACT_DEV_DEPENDENCIES,
      pinnedActions: PINNED_ACTIONS,
      firstPartyTagFindings,
      failures,
    },
    null,
    2,
  ),
);

if (failures.length > 0) process.exitCode = 1;
