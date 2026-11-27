# Performance baseline and gate

Measured on 2026-11-27 with Node.js `v20.19.5` on Windows and a four-logical-CPU host. The workload is the checked-in synthetic pair `src/diff/fixtures/stripe-real-old.json` (11204 bytes) and `src/diff/fixtures/stripe-real-new.json` (10512 bytes). The document is parsed and indexed once, then `ChangeDetector.diffIndexes` runs 50 times.

`npm run perf:check` runs `scripts/performance-gate.ts`, which executes the benchmark, checks the workload identity (fixture bytes, iteration count, and change count), and enforces the budgets in `config/performance-budget.json`. CI runs the same command.

## Measurements

Five unprofiled local runs:

| Run    | Total ms | Average ms |
| ------ | -------- | ---------- |
| 1      | 38.985   | 0.7797     |
| 2      | 36.151   | 0.7230     |
| 3      | 69.951   | 1.3990     |
| 4      | 38.982   | 0.7796     |
| 5      | 44.811   | 0.8962     |
| Median | 38.985   | 0.7797     |
| Worst  | 69.951   | 1.3990     |

The budget is twice the worst observed run: `139.902 ms` total and `2.798 ms` average. The factor is an explicit local-CI variance allowance derived from the measured run; it is not a release target. Each run produced 16 changes.

## Profile

A CPU profile of the built benchmark (`node --cpu-prof dist/scripts/benchmark.js`) reported `45.494 ms` total and `0.9099 ms` average. The largest self-time samples were:

| Frame                              | Self ms |
| ---------------------------------- | ------- |
| `realm:compileForInternalLoader`   | 20.951  |
| `structured-diff.js:(anonymous)`   | 16.795  |
| `(native):(garbage collector)`     | 15.817  |
| `(native):(program)`               | 15.538  |
| `ir.js:toIrFields`                 | 6.767   |
| `ir.js:(anonymous)`                | 4.809   |
| `(native):consoleCall`             | 4.801   |
| `change-detector.js:diffFieldMaps` | 4.579   |
| `change-detector.js:diffSchemas`   | 3.510   |

The profile is dominated by module loading, profiler/runtime overhead, and deterministic single-document IR traversal. The measured workload is sub-millisecond per iteration on the median run, and there is no evidence that splitting it across worker threads would offset the serialization and startup cost. No worker threads were added.

## Limitations

These numbers come from small synthetic fixtures on one local machine. They are not adoption, production, or release performance evidence. The gate detects regressions in this specific workload; it does not characterize large real Stripe specifications, scanner performance, or CLI startup time.
