# Changelog

All notable changes to Dokimana are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project uses the version in [package.json](package.json).

## [Unreleased]

No unreleased changes recorded.

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
