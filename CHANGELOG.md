# Changelog

All notable changes to Dokimana are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project uses the version in [package.json](package.json).

## [Unreleased]

### Added

- Explicit `needs_human` entries for changes with no static call-site mapping.
- Source-scan coverage notes that state file count, extensions, and ignored directories.
- Input validation for supplied OpenAPI documents and existing impact files.
- Docker build exclusions and a production-only runtime dependency install.

### Changed

- Live Stripe key detection now covers `sk_live` and `rk_live` values before repository work.
- Reports label impact analysis as static evidence instead of implying runtime verification.
- `verify` no longer records an execution timestamp when nothing ran.
- Schema enum removal follows the same constraint policy as parameter enums.
- CI checks formatting and site CI watches root documents that site tests read.

### Fixed

- Inline Stripe clients now report full operations such as `customers.update`.
- README and site commands use the real scenario fixture path.
- Requirement declaration for scanner fixtures no longer sits in the public source types.

## [0.1.0] - 2026-11-26

### Added

- Local CLI with `scan`, `report`, `doctor`, and `verify` commands.
- Comparison of supplied Stripe OpenAPI JSON files for removed fields, type changes, new required fields, and removed enum values.
- Likely TypeScript and JavaScript call-site reporting with explicit coverage limits.
- JSON impact files and Markdown review evidence.
- GitHub Action and example workflow for CI scans.
- Single-page public site with old-route redirects.
- MIT license, contributor guide, security policy, CI workflows, and issue forms.

### Changed

- Renamed the project, CLI, Action, site, and documentation from ApiProof to Dokimana.
- Rebuilt the site as a narrow, text-led document with responsive small-screen layout.
- Simplified repository metadata and documentation to match the actual CLI.

### Removed

- Dead patch generation and patch reporting paths that the CLI never applied.
- Unused prototypes, research notes, benchmarks, diagrams, and redirect page stubs.

## Versioning

Release and versioning policy lives in [VERSIONING.md](VERSIONING.md). Changesets drive version bumps and changelog entries; see [.changeset/README.md](.changeset/README.md).
