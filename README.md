# ApiProof

ApiProof is a CLI-first, local-first MVP for detecting Stripe breaking changes, finding affected TypeScript/JavaScript call sites, proposing only explicitly supported fixes, and producing PR evidence.

## Quick start

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run build
npm test
npm run dev -- doctor
```

Example scan:

```bash
npm run dev -- scan \
  --repo . \
  --old fixtures/stripe-old.json \
  --new fixtures/stripe-new.json \
  --old-version 2024-12-18 \
  --new-version 2025-01-01 \
  --json impact.json
```

Create evidence from an impact report:

```bash
npm run dev -- report \
  --repo . \
  --impact impact.json \
  --provider-version 2025-01-01 \
  --output apiproof-evidence.md
```

## Commands

- `scan` - detects removed schemas/operations/parameters, nested field removals, field type changes, and removed enum values from structured OpenAPI JSON, then uses ts-morph to locate likely Stripe SDK call sites. Renames are never guessed from similar names.
  - Only calls on statically identifiable Stripe client instances (`new Stripe(...)`, including `require('stripe')`) are matched. Object-literal keys are compared exactly, including nested paths and array-item paths such as `items[].field`. Local object literals assigned to a variable are resolved at medium confidence. Dynamic arguments, spreads, and computed keys are reported as unverified rather than guessed.
  - `node_modules`, `dist`, `build`, `coverage`, `vendor`, `out`, `.git`, and `.next` are skipped.
- `verify` - validates environment safety and defines the intended container execution boundary. It does not start live network access.
- `report` - produces terminal and Markdown evidence reports.
- `doctor` - refuses live Stripe keys and reports test-key status.

## Safety model

ApiProof refuses `sk_live` keys and any key format that cannot be positively identified as test mode. Live Stripe API access is not implemented.

Repository verification must run in an isolated container:

- network disabled or explicitly restricted;
- no secrets injected;
- read-only source mount;
- timeout and resource limits;
- pinned toolchain and dependencies;
- no host Docker socket.

The Docker skeleton uses `docker-compose.yml` with `network_mode: none`, a read-only filesystem, and an empty secret environment. The `DockerNotConfiguredRunner` explicitly reports that execution was not attempted.

The current structured detector handles schema properties (including nested properties, array-item properties, and local component-schema `$ref` values), field type changes, schema enum removals, operation removals, and parameter removals, requiredness increases, and direct schema type changes declared at either the path or operation level. It does not resolve external or nested JSON Pointer references, infer rename mappings, compare parameter constraints or referenced schemas, or detect behavioral changes from schemas alone; unsupported OpenAPI constructs and dynamic runtime behavior remain uncovered.

## Architecture

```text
src/
  domain/       Structural types and evidence models
  diff/         Injected provider fetch, structured OpenAPI/JSON diff
  scanner/      ts-morph AST call-site impact analysis
  fixes/        Constrained patch generation
  verifier/     Safe test-mode and container execution ports
  reporter/     Terminal and Markdown output
  cli.ts        CLI-first entry point
```

Contributor instructions are in [`agent.md`](agent.md) (also referenced by [`AGENTS.md`](AGENTS.md)). The practical Git/GitHub workflow is in [`HOW_TO_USE_GIT_GITHUB.md`](HOW_TO_USE_GIT_GITHUB.md). Sourced research briefs are indexed in [`research/`](research/README.md).

Provider access is behind `ProviderFetcher`. Repository execution is behind `ContainerExecutionPort` and `VersionExecutionPort`. These interfaces make provider and Docker implementations replaceable without granting ApiProof live-key access.

## Honesty and coverage

Reports distinguish:

- `equivalent`
- `intentionally_different`
- `unexplained_difference`
- `could_not_run`

They also state impact coverage as verified, partially verified, or unverified. Dynamic SDK calls, reflection, REST fetch calls, generated code, vendor code, and unsupported AST patterns are not claimed as verified coverage.

Call-site findings are evidence with confidence, not proof of runtime behavior. Object-literal keys passed directly to a Stripe SDK call are reported at high confidence; keys resolved through a local object-literal variable, property reads on Stripe results, and destructured response fields are reported at medium confidence. Resource-level changes such as removed endpoints, schemas, or parameters are not mapped to call sites from static AST analysis and are listed as unverified coverage.

Unsupported fixes return `needs_human`; ApiProof never invents replacement fields or semantics.

## Benchmarks

The initial benchmark harness has 20 public-repository slots in `benchmarks/data-model.ts`. `npm run benchmark` emits `measured: false`; no external numbers are claimed.

Run measured benchmarks only with reviewed public fixtures and explicit ground truth.

## GitHub Action

`action.yml` exposes a Docker Action. `.github/workflows/apiproof-example.yml` shows a pull-request scan skeleton. Add baseline OpenAPI files and reports for a repository before enabling PR comments.

## 30-day delivery map

1. Stabilize structured change ingestion and typed Stripe fixtures.
2. Increase AST coverage for SDK resources and nested field arguments.
3. Implement Docker runner with pinned images and resource limits.
4. Add test-mode Stripe scenario execution and output normalization.
5. Expand constrained fixes only from reviewed field mappings.
6. Run a 20-repository public benchmark and publish measured limitations.

## Open questions

- Which Stripe SDK versions and API operations are initial supported scope?
- How should provider changelog entries map to canonical OpenAPI resource paths?
- Which test-mode scenario fixtures are safe and reproducible?
- How are intentional output differences supplied to verification?
- How will PR comments authenticate and where should reports be retained?
