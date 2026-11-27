# Dokimana

[![CI](https://github.com/D1bakar/Dokimana/actions/workflows/ci.yml/badge.svg)](https://github.com/D1bakar/Dokimana/actions/workflows/ci.yml)
[![Site CI](https://github.com/D1bakar/Dokimana/actions/workflows/site-ci.yml/badge.svg)](https://github.com/D1bakar/Dokimana/actions/workflows/site-ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-1656cc.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-1656cc.svg)](https://nodejs.org/)

Dokimana is a local command-line tool for one job: compare two Stripe OpenAPI JSON files and find the TypeScript or JavaScript code that may be affected by what changed. It writes review files you can keep. It does not contact Stripe.

## What it does

- Compares old and new documents for removed fields, type changes, new required fields, removed enum values, and expandable-field changes.
- Resolves local JSON Pointer `$ref` values, including nested and circular references, across schemas, parameters, request bodies, responses, and webhooks.
- Interprets `allOf`, `anyOf`, `oneOf`, `nullable`, `x-expandableFields`, `x-expansionResources`, and `additionalProperties`.
- Labels each finding as a schema, operation, request parameter, request body, response, or webhook event change.
- Reads the repository's source files and reports likely call sites for supported field-level changes.
- Writes a JSON file with the raw results and a Markdown file written for code review.
- Runs locally, including in CI through the included GitHub Action.

A finding is a lead to check, not proof that something will fail. A clean result does not mean every call site was found.

## Current limits

This version deliberately stays inside these boundaries:

- A scan does not download specifications or call the Stripe API.
- It does not follow external or remote `$ref` values; only local JSON Pointers are resolved.
- It does not run your application scenarios. `verify` reports `could_not_run` and exits unsuccessfully.
- It does not prove runtime behavior or complete coverage.
- It does not invent replacement fields. Unsupported changes are listed as `needs_human` in the report.
- It does not change your source files.
- It does not handle external JSON references, dynamic client construction, direct REST calls, or generated and vendor code.

## Install

Node.js 20 or newer and npm are required.

```bash
git clone https://github.com/D1bakar/Dokimana.git
cd Dokimana
npm ci
npm run build
npm start -- doctor
```

`doctor` checks the local key environment. No key is needed for a scan.

## Run a scan

The repository includes a synthetic fixture pair so you can see the output shape. It is not a real Stripe release.

```bash
npm start -- scan \
  --repo . \
  --old fixtures/stripe-old.json \
  --new fixtures/stripe-new.json \
  --old-version fixture-old \
  --new-version fixture-new \
  --json dokimana-impact.json \
  --markdown dokimana-evidence.md
```

Add `--fail-on-changes true` to exit with status 1 when changes are found. Both files are written before that check runs.

The repository also includes two trimmed-down excerpts from the real Stripe spec shape at
`src/diff/fixtures/stripe-real-old.json` and `src/diff/fixtures/stripe-real-new.json`. Use them to exercise schema, request-parameter, request-body, response, and webhook diffs without network access.

### Fetch a pinned spec (optional)

`scan` never fetches anything. If you want to obtain a public spec yourself, the separate
`fetch-spec` command requires an exact API version and a full `stripe/openapi` commit SHA.
It downloads a pinned file from GitHub, checks the reported version, and writes a `.sha256`
sidecar next to the output.

```bash
npm start -- fetch-spec \
  --version 2026-11-18.endive \
  --commit 0f6d4dfafe157c10df393ce8a27d00b186ab3955 \
  --out stripe-openapi.json
```

The command does not use a Stripe key or call the Stripe API. Review the commit and checksum
before using the file as a scan input. Use `--channel preview` or `--channel openapi` only when
you know which repository directory you need; the default is `latest`.

Create a Markdown report from an existing impact file:

```bash
npm start -- report \
  --repo . \
  --impact dokimana-impact.json \
  --provider-version fixture-new \
  --output dokimana-evidence.md
```

Check key safety and verification status:

```bash
npm start -- doctor
npm start -- verify --repo . --scenario src/verifier/fixtures/scenario.json --json verification.json
```

A valid scenario still returns `could_not_run` until a real isolated runner exists. Do not read that result as a passed test.

## GitHub Action

The Action scans two OpenAPI files that are already in the checked-out workspace. It does not download inputs or call Stripe. Pin and review those files in your workflow.

```yaml
- uses: D1bakar/Dokimana@main
  with:
    old-openapi: fixtures/stripe-old.json
    new-openapi: fixtures/stripe-new.json
    old-version: fixture-old
    new-version: fixture-new
    fail-on-changes: 'true'
```

The four version and path inputs are required. `repo`, `impact-output`, `report-output`, and `fail-on-changes` are optional. Pin the Action to a commit SHA in production. The artifact upload is shown in `.github/workflows/dokimana-example.yml`.

## Safety

- Live Stripe keys are refused before repository work. Only test-mode keys are accepted where a key is checked.
- Scans read and write only local files. `fetch-spec` is the sole network command and is never called by a scan.
- No repository code is executed by this version.
- Tests use local fixture files and no credentials.

## Repository layout

```
src/                  CLI and core modules
fixtures/             synthetic OpenAPI examples
site/                 the public document site
.github/workflows/    CI and the example Action
```

## Development

```bash
npm ci
npm run build
npm test
npm run lint
npm run format:check
npm run mutate
```

Mutation testing is a separate, long-running check; its measured baseline and threshold are in [docs/MUTATION.md](docs/MUTATION.md). Site checks live in `site/` and run separately. Before contributing, keep changes focused, add a test for new behavior, and never include credentials or generated reports.

## Project documents

- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Design contract](DESIGN.md)
- [Mutation baseline](docs/MUTATION.md)
- [Site documentation](site/README.md)
- [Contributor and agent guide](agent.md)
- [Repository maintenance](MAINTAINING.md)

## License

MIT. See [LICENSE](LICENSE).
