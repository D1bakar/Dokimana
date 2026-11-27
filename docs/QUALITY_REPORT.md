# Final quality report

Date: 2026-11-27. Environment: Node.js `v20.19.5`, Windows, four logical CPUs. This report records measured results and unresolved limits; it is not a claim of complete coverage, runtime proof, adoption, or release readiness.

Safety boundary: no live Stripe key or API call was used. `scan` never fetches specifications or contacts Stripe. `fetch-spec` is a separate, explicit command that requires an exact API version and full upstream commit SHA. Unsupported changes stay `needs_human`. A clean scan is not proof that no call site was affected.

## Gate status

| Check                   | Result                                                                      |
| ----------------------- | --------------------------------------------------------------------------- |
| `npm run build`         | Pass                                                                        |
| `npm test`              | Pass: 14 test files passed, 1 skipped; 92 tests passed, 1 pre-existing skip |
| `npm run lint`          | Pass                                                                        |
| `npm run format:check`  | Pass                                                                        |
| `npm run perf:check`    | Pass: latest 41.019 ms total, 0.8204 ms average for 50 iterations           |
| `npm run verify:supply` | Pass, with one reported first-party tag exception                           |
| `npm run mutate`        | Measured baseline: **33.00%** mutation score; threshold set to 33           |

The skipped test is `src/verifier/stripe-mock-integration.test.ts`. It cleanly skips when Docker or the cached `stripe-mock` image is unavailable; no new skip or assertion change was added.

## Measured evidence

### Mutation testing

StrykerJS `9.6.1` with `@stryker-mutator/vitest-runner@9.6.1`, `ignoreStatic: true`, and `concurrency: 3`. The full baseline run took 56 minutes 36 seconds and exited `0`. Scope was `src/**/*.ts` excluding tests, fixtures, and type-only declarations.

| Metric                   | Value               |
| ------------------------ | ------------------- |
| Mutants instrumented     | 6453                |
| Static mutants ignored   | 481                 |
| Mutants scored           | 5972                |
| Killed                   | 1916                |
| Timed out                | 55                  |
| Survived                 | 1774                |
| No coverage              | 2227                |
| Errors                   | 0                   |
| Mutation score (total)   | **33.00%**          |
| Exact unrounded score    | 33.004018754186205% |
| Mutation score (covered) | 52.63%              |

The exact measured score is the provenance for `high`, `low`, and `break = 33` in `stryker.config.json`. No headroom was invented. A second full run after adding the threshold was not performed; that run is `not measured`. Details are in [MUTATION.md](MUTATION.md).

### Coverage

Phase 1 coverage was measured on `src` only and was not rerun in Phase 2:

| Metric             | Value              |
| ------------------ | ------------------ |
| Statements / lines | 65.49% (3696/5643) |
| Branches           | 69.88% (919/1315)  |
| Functions          | 88.07% (229/260)   |

Site coverage is `not measured`. Coverage figures do not prove complete source-pattern coverage.

### Accuracy benchmark

`npm run bench` over the 12 checked-in synthetic benchmark projects:

| Metric                              | Value |
| ----------------------------------- | ----- |
| Expected findings                   | 21    |
| Actual findings                     | 14    |
| Exact finding matches               | 12    |
| Missing findings listed in truth    | 9     |
| Extra findings listed by comparison | 1     |
| Expected unresolved cases           | 5     |
| Exact unresolved matches            | 3     |

These numbers describe the synthetic fixture corpus only. They are not precision or recall for real Stripe releases.

### Performance

Five unprofiled local runs of the checked-in 11204-byte / 10512-byte fixture pair, 50 iterations of pre-parsed, pre-indexed diffing: median `38.985 ms` total and `0.7797 ms` average; worst `69.951 ms` total and `1.399 ms` average. The budget is twice the worst run: `139.902 ms` total and `2.798 ms` average. Two verification runs passed at `34.443 ms` total / `0.6889 ms` average and `41.019 ms` total / `0.8204 ms` average.

A CPU profile showed the largest self-time in module loading, profiler/runtime overhead, and single-document IR traversal. Worker threads were not added because the measured workload is sub-millisecond per iteration on the median run and there is no evidence that serialization and startup cost would be recovered. Large real Stripe specifications are `not measured`. Details are in [PERFORMANCE.md](PERFORMANCE.md).

### oasdiff corpus

`oasdiff` is pinned to `v1.41.0` with Linux archive SHA-256 `96365453163118e6503eb71742643d9ee67f91aedbaadd1a1ce9c6213e3b71c7`. The corpus is synthetic and local; `npm run oasdiff:corpus` does not fetch anything. Of 40 pairs, the first 25 are triaged: 9 aligned, 2 partial, 6 gaps, and 8 out-of-scope. The remaining 15 are pending triage and are not evidence of coverage. See [DIVERGENCES.md](DIVERGENCES.md).

### Rules and provenance

There are 17 stable rule IDs, `DOK-001` through `DOK-017`, and `docs/RULES.md` is generated from the registry. Rule registration is not evidence that a change kind is detected. Exact dependency pins, action SHAs, and oasdiff checksum wiring are verified by `npm run verify:supply` and documented in [SUPPLY_CHAIN.md](SUPPLY_CHAIN.md).

## Unresolved divergences

### oasdiff triaged non-aligned pairs

| Pair     | Assessment   | Unresolved divergence                                                                                                          |
| -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| DOKC-001 | partial      | Field removal agrees, but oasdiff separates request and required-response surfaces while Dokimana reports one `field_removed`. |
| DOKC-002 | gap          | Schema field rename is reported only as removal by both tools; no rename is identified.                                        |
| DOKC-005 | gap          | oasdiff reports nothing for an unreferenced schema removal; Dokimana reports `schema_removed`.                                 |
| DOKC-006 | gap          | oasdiff ignores `x-expandableFields`; Dokimana reports `expandable_field_removed`.                                             |
| DOKC-007 | gap          | Neither tool reports removal of the `x-expansionResources` branch.                                                             |
| DOKC-009 | gap          | Query parameter rename is reported only as removal by both tools; no rename is identified.                                     |
| DOKC-011 | gap          | oasdiff reports nothing for a query parameter type change; Dokimana reports `parameter_type_changed`.                          |
| DOKC-013 | partial      | Request body removal agrees, but Dokimana also reports removed body fields.                                                    |
| DOKC-018 | out-of-scope | Neither tool reports a breaking change for an added schema field.                                                              |
| DOKC-019 | out-of-scope | Neither tool reports a breaking change for an added query parameter.                                                           |
| DOKC-020 | out-of-scope | Neither tool reports a breaking change for an added response.                                                                  |
| DOKC-021 | out-of-scope | Neither tool reports a breaking change for an added endpoint.                                                                  |
| DOKC-022 | out-of-scope | Neither tool reports a breaking change for an added webhook.                                                                   |
| DOKC-023 | out-of-scope | Neither tool reports a breaking change for a description edit.                                                                 |
| DOKC-024 | out-of-scope | Neither tool reports a breaking change for an `operationId` edit.                                                              |
| DOKC-025 | out-of-scope | Neither tool reports a breaking change for a summary edit.                                                                     |

The registered rename rules `DOK-002` and `DOK-009` do not yet produce rename findings in this corpus.

### oasdiff pairs pending triage

| Pair     | Change                       |
| -------- | ---------------------------- |
| DOKC-026 | nullable added               |
| DOKC-027 | oneOf branch removed         |
| DOKC-028 | allOf branch removed         |
| DOKC-029 | anyOf branch removed         |
| DOKC-030 | readOnly added               |
| DOKC-031 | writeOnly added              |
| DOKC-032 | deprecated added             |
| DOKC-033 | format changed               |
| DOKC-034 | pattern added                |
| DOKC-035 | minLength set                |
| DOKC-036 | maxLength set                |
| DOKC-037 | default removed              |
| DOKC-038 | example removed              |
| DOKC-039 | additionalProperties allowed |
| DOKC-040 | server URL changed           |

### Accuracy benchmark divergences

Missing findings:

- `express-retrieve`: `src/retrieve-customer.ts|account_balance`, `src/retrieve-customer.ts|phone`
- `next-route-handler`: `src/app/api/customers/[id]/route.ts|expand: default_source`
- `serverless-handler`: `src/handler.ts|phone`
- `cross-file-client`: `src/usage.ts|account_balance`
- `expand-array`: `src/retrieve-customer.ts|expand: default_source`
- `destructured-response`: `src/destructure.ts|balance`, `src/destructure.ts|email`, `src/destructure.ts|phone`

Extra finding:

- `serverless-handler`: `src/handler.ts|data.object.phone` instead of the expected `src/handler.ts|phone`.

Other unresolved accuracy gaps:

- `webhook-worker` reported 3 findings against 2 expected, with 2 exact matches; the comparison did not list an extra key for the count difference.
- `dynamic-call` expected 4 unresolved cases and reported 3, with 2 exact unresolved matches.
- `rest-fetch` matched 1 of 1 expected unresolved case.
- Ten projects with no expected unresolved cases reported 2–3 honest `needs_human` records each; those records are not matched to truth expectations.

### Scanner and verification limits

- Dynamic SDK calls, direct REST/fetch calls, generated and vendor code, external or remote `$ref` values, path aliases, type annotations, and runtime values remain outside verified coverage.
- Resource-level changes are reported as `needs_human` rather than guessed call sites.
- An empty scan is not evidence of complete coverage; the scanner states inspected extensions and ignored directories.
- `verify` reports `could_not_run` until a real isolated runner executes a scenario. The isolated `stripe-mock` scenario is `not measured` in this environment.
- No repository code is executed by this version. The container stub is not presented as isolation.

### Supply-chain and release limits

- `.github/workflows/dokimana-example.yml` uses `D1bakar/Dokimana@v1`. No immutable `v1` tag was verifiable locally, so it is reported as an exception and is not SHA-pinned.
- npm authentication or trusted publishing is not configured in this environment; OIDC provenance is not verified. A public `npm install` or `npx dokimana` claim is disallowed until those are configured and verified.
- A release/publish run with provenance is `not measured`.
- `npm audit` reports 13 vulnerabilities: 10 moderate, 1 high, and 2 critical. Production-only audit reports 3 moderate vulnerabilities. They were not changed in this phase.
- Site data files remain `pending-generation` or `pending`; site-generated reports stay placeholders until CI-generated data is checked in.

## Handoff boundary

Phase 2 stops after this report. Mutation, performance, supply-chain, and accuracy figures above come from local measurements or checked-in fixture corpora, not from a published release or real Stripe traffic. No tests, thresholds, lint rules, skips, or assertions were loosened to make a gate pass.
