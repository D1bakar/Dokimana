# Large-repository scan profile

Measured on 2026-11-28 with Node.js `v20.19.5` on Windows and a four-logical-CPU host. The workload is a generated temporary repository of exactly 5,000 TypeScript files. Each file imports `stripe`, constructs a client, passes a local object literal with `legacy_name` to `stripe.customers.update`, and reads `customer.metadata`. The scan receives one `field_removed` change for `legacy_name` and reports 5,000 findings.

The harness is `scripts/scan-profile.ts`; run it with `npm run profile:scan -- 3 5000`. It generates the repository in a temporary directory, deletes it afterward, calls `RepoScanner.scan` with an optional phase hook, and reports wall time plus `process.memoryUsage()` snapshots. A CPU profile can be collected with `node --expose-gc --cpu-prof --cpu-prof-dir=<dir> --import tsx scripts/scan-profile.ts 1 5000` and summarized with `npm run profile:cpu:summary -- <dir>/*.cpuprofile`.

## Baseline phase breakdown

Three iterations ran in one process. The first was a cold run at `99,453.7 ms`; the median was `31,128.7 ms`. The third run is representative of the warm median and is used below so the phase durations sum to the wall time.

| Phase            | Duration ms   | Share of wall time |
| ---------------- | ------------- | ------------------ |
| `collectSources` | 20.34         | 0.07%              |
| `createProject`  | 22,935.01     | 73.68%             |
| `buildIndex`     | 6,310.57      | 20.27%             |
| `scanFiles`      | 1,850.86      | 5.95%              |
| `buildReport`    | 11.71         | 0.04%              |
| **Total**        | **31,128.49** | **100.00%**        |

Median phase durations across the three runs were `20.34 ms` (`collectSources`), `22,935.01 ms` (`createProject`), `6,310.57 ms` (`buildIndex`), `3,667.48 ms` (`scanFiles`), and `18.80 ms` (`buildReport`). The `scanFiles` spread comes from JIT warm-up and GC timing; it is still far smaller than `createProject` in every run.

## Baseline memory

Values from the representative third run:

| Point                 | Heap used bytes | RSS bytes   |
| --------------------- | --------------- | ----------- |
| Before scan           | 50,830,384      | 429,543,424 |
| After `createProject` | 782,950,728     | 838,664,192 |
| After `buildIndex`    | 333,305,240     | 391,716,864 |
| After `scanFiles`     | 377,999,008     | 428,023,808 |
| After scan            | 365,741,840     | 428,380,160 |

The peak heap and RSS both occur while `ts-morph` creates source files. The median whole-scan heap delta across runs was `314,928,792` bytes; RSS delta was not a useful signal because the process retained OS pages between iterations.

## CPU profile attribution

The one-run CPU profile sampled `71,738.4 ms`. Largest self-time frames:

| Frame                         | Self ms   | Share  |
| ----------------------------- | --------- | ------ |
| `readFileUtf8`                | 40,078.99 | 55.87% |
| `(idle)`                      | 2,317.99  | 3.23%  |
| `picomatch.test` (all sites)  | 5,109.35  | 7.12%  |
| `matcher` (all sites)         | 2,041.07  | 2.85%  |
| `tinyglobby` anonymous frames | 1,600.72  | 2.23%  |
| `pushFileFilter`              | 1,108.09  | 1.54%  |
| `fdir.walk`                   | 906.55    | 1.26%  |
| `toPosixSlashes` (all sites)  | 1,055.81  | 1.47%  |
| `(garbage collector)`         | 1,465.64  | 2.04%  |

The `picomatch`, `tinyglobby`, and `fdir` frames come from `ts-morph`'s glob expansion inside `addSourceFilesAtPaths`, even though the scanner already passes an explicit list of files. Together they account for about `12.3 s` of sampled self time. File reading plus glob matching is the bottleneck. The analyzer phases (`buildIndex` and `scanFiles`) are not the bottleneck, so worker threads are not introduced.

## Limitations

This is a synthetic corpus on one Windows machine, not a real repository or a release target. The generated files are small and structurally similar. The profile describes this local workload only.
