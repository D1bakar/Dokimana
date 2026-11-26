# Dokimana

Dokimana is a local command-line tool for one job: compare two Stripe OpenAPI JSON files and find the TypeScript or JavaScript code that may be affected by what changed. It writes review files you can keep. It does not contact Stripe.

## What it does

- Compares the old and new documents for removed fields, type changes, new required fields, and removed enum values.
- Reads the repository's source files and reports likely call sites for each change.
- Writes a JSON file with the raw results and a Markdown file written for code review.
- Runs locally, including in CI through the included GitHub Action.

A finding is a lead to check, not proof that something will fail. A clean result does not mean every call site was found.

## Current limits

Be clear about what this version does not do:

- It does not download Stripe specifications or call the Stripe API.
- It does not run your application scenarios. `verify` reports `could_not_run` and exits unsuccessfully.
- It does not prove runtime behavior or complete coverage.
- It does not invent replacement fields. Unsupported changes return `needs_human`.
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
npm start -- verify --repo . --scenario ./scenario.json --json verification.json
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

- Live Stripe keys are refused. Only test-mode keys are accepted where a key is checked.
- All reads and writes stay local.
- No repository code is executed by this version.
- Tests use synthetic files and no credentials.

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
```

Site checks live in `site/` and run separately. Before contributing, keep changes focused, add a test for new behavior, and never include credentials or generated reports.

## License

MIT.
