# Versioning policy

Dokimana is published to npm as `dokimana` from `main`. The version in `package.json` is the source of truth; [CHANGELOG.md](CHANGELOG.md) entries are generated from changesets. See [.changeset/README.md](.changeset/README.md) for how to add one.

## While the CLI is 0.x

Semantic Versioning treats `0.x` as unstable. We use that flexibility narrowly and document every incompatible change.

- `patch`: backward-compatible bug fixes, clearer report wording that does not remove or change fields, safer parsing of the same inputs, and dependency updates with no observable behavior change.
- `minor`: new commands, flags, config fields, or report fields; changes to defaults that change results; any incompatible change.
- `major`: reserved for the 1.0 transition. Do not use `major` during 0.x without an explicit maintainer decision.

Concrete rules for a 0.x CLI:

- A breaking change is allowed in a `minor`, never in a `patch`. It must say so in the changeset summary and include the migration step in the changelog entry.
- Do not remove or rename a documented CLI flag, config field, or report field in a `patch`. Adding an optional field is a `minor`.
- The config `version: 1` schema is part of the contract. Adding an optional field is compatible; removing, renaming, or changing the meaning of an existing field is breaking. Changing a default that changes scan results is breaking.
- JSON, Markdown, SARIF, and HTML output paths and shapes are user-visible. Additive fields are a `minor`; removing fields, changing their types, or changing the meaning of `needs_human`, `could_not_run`, or coverage notes is breaking.
- Raising the Node.js floor above 20 is breaking.
- Tightening safety is expected and can be a `patch`; a change that weakens key refusal, isolated-execution honesty, or evidence labeling is breaking and must not be shipped silently.
- Performance and accuracy numbers must include provenance and limits. Synthetic fixtures are not release metrics.

## When 1.0 happens

We will tag `v1.0.0` only when all of the following are true:

1. The CLI commands and flags are stable, with no planned renames of `scan`, `verify`, `report`, `doctor`, `fetch-spec`, or their required options.
2. The config schema and all report formats are documented and covered by tests.
3. Safety boundaries are enforced: live keys are refused, scanned code is not executed, and verification never reports success without a real isolated runner.
4. The benchmark and accuracy bench have recorded, honest baselines with documented limitations.
5. `README.md`, the site, and the contributor docs match the shipped behavior.
6. The release workflow has completed a full version-pull-request-and-publish cycle.

At 1.0, the project moves to strict Semantic Versioning:

- `patch`: backward-compatible bug fixes only.
- `minor`: backward-compatible features only.
- `major`: breaking changes, including removed flags or fields, changed defaults that alter results, changes to the safety contract, or dropping Node 20.

After 1.0, deprecations are announced in a `minor` with a warning and removed only in the next `major`.

## Release mechanics

Releases are automated by Changesets in `.github/workflows/release.yml`. Do not bump versions by hand, do not publish from pull requests, and do not rewrite existing changelog entries. npm authentication and OIDC must be configured in repository settings for publishing to work.
