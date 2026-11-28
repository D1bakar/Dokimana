# Supply-chain and provenance controls

This document records controls that are enforced locally by `npm run verify:supply`. It does not claim that publishing credentials, npm trusted publishing, or a release cycle have been verified.

## Locked npm toolchain

`npm ci` installs from `package-lock.json` (lockfile version 3). Tooling that can mutate or publish code is pinned exactly:

| Package                          | Version |
| -------------------------------- | ------- |
| `@changesets/cli`                | 2.29.7  |
| `@stryker-mutator/core`          | 9.6.1   |
| `@stryker-mutator/vitest-runner` | 9.6.1   |

Stryker 9.6.1 is used because Stryker 10 requires Node.js 22 or newer while this repository targets Node.js 20.

GitHub Actions are pinned to immutable commit SHAs. The recorded pins are checked against every workflow by `npm run verify:supply`:

| Action                            | Commit                                     | Version |
| --------------------------------- | ------------------------------------------ | ------- |
| `actions/checkout`                | `11d5960a326750d5838078e36cf38b85af677262` | v4      |
| `actions/setup-node`              | `49933ea5288caeca8642d1e84afbd3f7d6820020` | v4      |
| `changesets/action`               | `52025003bf4794281597cb5b5e566485d9473389` | v1.5.0  |
| `peter-evans/create-pull-request` | `22a9089034f40e5a961c8808d113e2c98fb63676` | v7      |

One exception is reported, not treated as pinned: `.github/workflows/dokimana-example.yml` uses `D1bakar/Dokimana@v1` because no immutable `v1` tag was available to verify locally. Do not describe that example as SHA-pinned.

## External comparison tool

`oasdiff` is downloaded only by CI, pinned to `v1.41.0`, and verified against the Linux archive checksum `96365453163118e6503eb71742643d9ee67f91aedbaadd1a1ce9c6213e3b71c7`. `npm run oasdiff:corpus` accepts a local binary path and does not fetch anything itself. The corpus is synthetic and local.

## Publishing boundary

The release workflow requests `id-token: write` and passes `--provenance` to `npm publish`. It uses the locally installed Changesets CLI through `npm exec -- changeset version`; it does not bootstrap an unpinned `npx` or `npm install` command. `npm run verify:supply` checks both settings in the workflow and reports npm provenance as **configured, not yet verified in CI**. No publish or OIDC token was exercised locally.

Publishing still requires repository-configured npm authentication or trusted publishing, which cannot be verified from this working tree. No public install or `npx dokimana` claim is made here.

## Safety boundary

A scan never calls `fetch-spec` or the Stripe API. `fetch-spec`, when explicitly invoked, requires an exact API version and full upstream commit SHA. No live key is used in tests, fixtures, or verification.
