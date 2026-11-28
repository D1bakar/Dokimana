# Final quality report (measured)

Date: 2026-11-28. Environment: Node.js `v20.19.5`, Windows, four logical CPUs. Every number below comes from a local command, a checked-in fixture corpus, or a recorded `git ls-remote` result. No CI-only result, published-package result, or real Stripe traffic result is included.

## Push and conflict verification

| Check                                 | Measured result                            |
| ------------------------------------- | ------------------------------------------ |
| Phase 3 branch head after push        | `349a9cb33186605555360092c8156051f117a957` |
| Phase 4 push exit code                | `0`                                        |
| Phase 4 branch head after push        | `0506a48cd220f286a47a9b79e0b5ea94b4e7f14c` |
| Phase 3/4 merge conflicts encountered | `0`                                        |
| Merge commits created                 | `0`                                        |
| Phases 5 and 6 pushed                 | Yes; see post-report push verification     |

Phase 3 and Phase 4 gates were rerun after their pushes and exited `0`.

## Post-report push verification

| Check                                          | Measured result                                      |
| ---------------------------------------------- | ---------------------------------------------------- |
| Feature push range                             | `0506a48..9ab064a`                                   |
| Feature push exit code                         | `0`                                                  |
| Feature head after Commit 19 push              | `9ab064a7e67206e5ee8fdc8a8fc07a9ecba94aef`           |
| Remote `main` before update                    | `351ec11841c4cbad2f21d60133821ca682d7092c`           |
| `main` update type                             | fast-forward `351ec11..9ab064a`                      |
| `main` push exit code                          | `0`                                                  |
| `main` head after push                         | `9ab064a7e67206e5ee8fdc8a8fc07a9ecba94aef`           |
| Conflicts encountered during the `main` update | `0`                                                  |
| Post-push gates on `main`, all exit codes      | `0`                                                  |
| Post-push `perf:check` on `main`               | 62.324 ms total, 1.2465 ms average for 50 iterations |

## Final gate run

Measured on the Commit 18 tree before the documentation-only final report commit.

| Check                        | Result                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `npm run format:check`       | exit `0`                                                                               |
| `npm run build`              | exit `0`                                                                               |
| `npm test`                   | exit `0`; 15 test files passed, 1 skipped; 98 tests passed, 1 skipped                  |
| `npm run lint`               | exit `0`                                                                               |
| `npm run check:architecture` | exit `0`; no issues                                                                    |
| `npm run check:cycles`       | exit `0`; no issues                                                                    |
| `npm run check:dead-code`    | exit `0`; no issues                                                                    |
| `npm run perf:check`         | exit `0`; 66.371 ms total, 1.3274 ms average for 50 iterations                         |
| `npm run verify:supply`      | exit `0`; 6 workflows checked, 5 pinned actions, 1 first-party tag finding, 0 failures |
| `npm run verify:determinism` | exit `0`; 4 byte comparisons identical, 4 `git diff --no-index` exit codes `0`         |
| `npm run mutate`             | not rerun in Phases 3–6; earlier measured score 33.00%                                 |

The skipped test is `src/verifier/stripe-mock-integration.test.ts`. No skip, threshold, lint rule, test timeout, or assertion was changed to make a gate pass.

The performance workload was the checked-in 11,204-byte / 10,512-byte fixture pair, pre-parsed and pre-indexed, with 50 iterations and 16 changes. Its recorded budget is 139.902 ms total and 2.798 ms average.

## Determinism

Before this work, two scans differed only in the timestamp:

```diff
-  "generatedAt": "2026-11-28T15:51:24.588Z",
+  "generatedAt": "2026-11-28T15:51:27.455Z",
```

Reports now contain `contentSha256` instead of `generatedAt`. Three fixture scans were run on Windows: two with the backslash path returned by `Resolve-Path`, and one with the same path converted to forward slashes. All three exited `0`.

| Run                  | `contentSha256`                                                    | Normalized root                                                            |
| -------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Windows path A       | `c91115bb298bc1728fb3b4a99f10de76ecb6a8f704806d872a23b0824047c6b2` | `C:/Users/PC/Desktop/D1bakar's/web/Dokimana/src/scanner/fixtures/positive` |
| Windows path B       | `c91115bb298bc1728fb3b4a99f10de76ecb6a8f704806d872a23b0824047c6b2` | same                                                                       |
| Forward-slash path C | `c91115bb298bc1728fb3b4a99f10de76ecb6a8f704806d872a23b0824047c6b2` | same                                                                       |

`git diff --no-index` results:

| Files compared           | Exit code | Diff output |
| ------------------------ | --------: | ----------- |
| JSON A vs JSON B         |         0 | empty       |
| Markdown A vs Markdown B |         0 | empty       |
| JSON A vs JSON C         |         0 | empty       |
| Markdown A vs Markdown C |         0 | empty       |

`npm run verify:determinism` reproduced those results and removed its temporary directory. Details are in [DETERMINISM.md](DETERMINISM.md).

## Large-repository scan profile

The workload was a generated temporary repository with exactly 5,000 TypeScript files. Three iterations ran in one process.

| Metric                                | Baseline      | After direct loading                                | Change      |
| ------------------------------------- | ------------- | --------------------------------------------------- | ----------- |
| Median wall time                      | 31,128.70 ms  | 12,883.35 ms                                        | 58.6% lower |
| Cold first run                        | 99,453.70 ms  | 64,441.47 ms                                        | 35.2% lower |
| Median `collectSources`               | 20.34 ms      | not recorded separately in the confirmation summary |
| Median `createProject`                | 22,935.01 ms  | 4,547.71 ms                                         | 80.2% lower |
| Median `buildIndex`                   | 6,310.57 ms   | 4,574.54 ms                                         | 27.5% lower |
| Median `scanFiles`                    | 3,667.48 ms   | 2,448.32 ms                                         | 33.2% lower |
| Median `buildReport`                  | 18.80 ms      | not recorded separately in the confirmation summary |
| Median whole-scan heap delta          | 314,928,792 B | 323,950,176 B                                       | 2.9% higher |
| Heap after `createProject`, third run | 782,950,728 B | 144,956,672 B                                       | 81.5% lower |
| RSS after `createProject`, third run  | 838,664,192 B | 250,675,200 B                                       | 70.1% lower |

One CPU profile sampled 71,738.4 ms. Largest self-time frames were `readFileUtf8` 40,078.99 ms / 55.87%, all `picomatch.test` sites 5,109.35 ms / 7.12%, all `matcher` sites 2,041.07 ms / 2.85%, `tinyglobby` anonymous frames 1,600.72 ms / 2.23%, `pushFileFilter` 1,108.09 ms / 1.54%, `fdir.walk` 906.55 ms / 1.26%, and garbage collection 1,465.64 ms / 2.04%. Worker threads were not added because reading and glob expansion, not the analyzer phases, dominated the measured profile.

CLI startup was measured separately with two `scan` invocations:

| Metric                                    | Before      | After       | Change      |
| ----------------------------------------- | ----------- | ----------- | ----------- |
| Two-invocation wall time, sample 1        | 8,469.67 ms | 5,890.09 ms | 30.5% lower |
| Two-invocation wall time, sample 2        | 7,697.66 ms | 6,105.46 ms | 20.7% lower |
| Peak working set per invocation, sample 1 | 221.85 MB   | 203.94 MB   | 8.1% lower  |
| Peak working set per invocation, sample 2 | 206.70 MB   | 211.67 MB   | 2.4% higher |

Rejected measurements:

| Experiment                | Measured result                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Six-list `FileScan` cache | CLI 9,019.40 ms / 8,710.51 ms; `src/cli.test.ts` timed out at its existing 15,000 ms limit        |
| Single-pass analyzer      | CLI 5,459.29 ms / 6,016.23 ms; median 5,000-file `buildIndex` 8,217.22 ms vs 4,574.54 ms baseline |
| Six-traversal analyzer    | median 5,000-file wall time 19,287.93 ms                                                          |

Full provenance and limits are in [SCAN_PROFILE.md](SCAN_PROFILE.md).

## Accuracy, coverage, mutation, and comparison corpus

| Source                       | Measured result                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| Accuracy bench, 12 projects  | 21 expected findings, 14 actual, 12 exact, 9 missing, 1 extra                         |
| Accuracy bench unresolved    | 5 expected, 3 exact unresolved matches                                                |
| Coverage, `src` only         | 65.49% statements/lines, 69.88% branches, 88.07% functions                            |
| Mutation baseline            | 6,453 instrumented, 481 static ignored, 5,972 scored, 1,916 killed                    |
| Mutation score               | 33.00%; exact score 33.004018754186205%; threshold 33                                 |
| oasdiff corpus               | 40 pairs; 25 triaged: 9 aligned, 2 partial, 6 gaps, 8 out-of-scope                    |
| oasdiff version and checksum | `v1.41.0`, SHA-256 `96365453163118e6503eb71742643d9ee67f91aedbaadd1a1ce9c6213e3b71c7` |

Rule registry: 17 stable IDs, `DOK-001` through `DOK-017`.

Measured divergences that remain unresolved are recorded in [DIVERGENCES.md](DIVERGENCES.md): 15 pairs (`DOKC-026` through `DOKC-040`) remain pending triage; renames are not produced by `DOK-002` or `DOK-009`; `x-expandableFields`, `x-expansionResources`, and query parameter type gaps remain in the triaged set.

## Supply-chain configuration status

`npm run verify:supply` exited `0` on the Commit 18 tree.

| Setting                           | Locally observed value                                |
| --------------------------------- | ----------------------------------------------------- |
| `id-token: write` in release      | `true`                                                |
| `--provenance` in publish command | `true`                                                |
| npm provenance status             | configured, not yet verified in CI                    |
| Scorecard workflow present        | `true`                                                |
| Scorecard action pin              | `23f22cd43608bae7a1f1fa2603d7314dee9538a5` (`v2.6.0`) |
| Scorecard SARIF output            | `true`                                                |
| Scorecard publish results         | `true`                                                |
| Scorecard OIDC permission         | `true`                                                |
| Scorecard status                  | configured, not yet verified in CI                    |
| First-party tag findings          | `dokimana-example.yml: D1bakar/Dokimana@v1`           |

No Scorecard score, badge value, npm publish provenance attestation, or CI result is claimed. No live Stripe key or API call was used; `scan` remained offline; unsupported changes remained `needs_human`; no public npm install or `npx` claim is made; site-generated reports remain placeholders until CI-generated data is checked in.

## Suppressions and configuration exclusions

- No `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, or `as any` was found in any Phase 4 or Phase 5/6 staged diff.
- `src/scanner/fixtures/**` remains ESLint-ignored because those files are intentionally invalid scanner inputs.
- One pre-existing `/* eslint-disable no-undef */` remains in `src/scanner/fixtures/require/client.js`.
- `D1bakar/Dokimana@v1` remains a reported first-party supply-chain exception because no immutable `v1` tag SHA was verified locally.
- Existing generated/dependency ignores remain: `dist/**`, `node_modules/**`, `coverage/**`, `.stryker-tmp/**`, `reports/**`, `site/**`, `fixtures/**`, `benchmarks/projects/**`.
- The architecture checker excludes fixtures and tests from the dependency graph but loads tests and `eslint.config.js` as consumers.
- One pre-existing skipped test remains: `src/verifier/stripe-mock-integration.test.ts`.

## Handoff boundary

This report records local measurements and locally observed configuration only. Phases 5 and 6 were pushed to the feature branch and to `main` after Commit 19; the measured push results are recorded above.
