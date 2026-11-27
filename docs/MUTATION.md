# Mutation baseline

Measured on 2026-11-27 with Node.js `v20.19.5` on Windows and StrykerJS `9.6.1` with `@stryker-mutator/vitest-runner@9.6.1`. The command was `npm run mutate`; the run exited `0` and took 56 minutes 36 seconds. The JSON report was written to `reports/mutation/mutation.json`, which is gitignored.

## Scope

- `mutate`: `src/**/*.ts`, excluding `*.test.ts`, `**/fixtures/**`, and `src/domain/types.ts`.
- Scanner fixtures are test data, not production code. Instrumenting them changed the fixture evidence and broke the initial dry run, so they are excluded from mutation.
- `src/domain/types.ts` contains type-only declarations and produces no executable mutants.
- `ignoreStatic: true` excludes static mutants from scoring. This keeps the run bounded on the four-logical-CPU host; the ignored count is recorded below.
- `concurrency: 3`, `related: true`, with `vitest.config.mjs`.
- Initial dry run succeeded and ran 89 tests.

## Measured result

| Metric                   | Value      |
| ------------------------ | ---------- |
| Files found to mutate    | 21 of 376  |
| Mutants instrumented     | 6453       |
| Static mutants ignored   | 481        |
| Mutants scored           | 5972       |
| Killed                   | 1916       |
| Timed out                | 55         |
| Survived                 | 1774       |
| No coverage              | 2227       |
| Errors                   | 0          |
| Mutation score (total)   | **33.00%** |
| Mutation score (covered) | 52.63%     |

The exact unrounded total score in the JSON report is `33.004018754186205%`. The displayed `33.00%` is the provenance for the threshold below.

## Threshold

`stryker.config.json` sets `high`, `low`, and `break` to `33`, the measured score rounded down to the reported two-decimal value. No headroom was invented. With Stryker's `mutationScore < break` rule, the measured run is above the threshold and any future regression below 33 fails.

No second full mutation run was performed after adding the threshold; the gate value is derived from this measured report rather than re-measured.

## Limitations

This score measures how often seeded changes are detected by the current tests. It does not prove correctness, complete source-pattern coverage, or runtime behavior. `noCoverage` mutants dominate the total score; see [QUALITY_REPORT.md](QUALITY_REPORT.md) for unresolved divergences.
