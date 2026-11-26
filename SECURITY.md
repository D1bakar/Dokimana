# Security policy

## Scope

Dokimana is a local CLI and GitHub Action that reads supplied OpenAPI JSON files and source code. It does not contact Stripe, download specifications, or execute the repository it scans.

This policy covers secret handling, report output, dependency changes, and the Action's use of workspace files.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository:

<https://github.com/D1bakar/Dokimana/security/advisories/new>

Do not open a public issue for a security problem. Do not include live Stripe keys, tokens, private specifications, customer data, or reproducible secret values in a report. Redact paths and identifiers that are not needed to understand the issue.

Include:

- the affected area: CLI, Action, site, dependencies, or report output;
- the version or commit you tested;
- the smallest description needed to reproduce the issue;
- the impact you observed;
- any suggested boundary or fix.

## Safety boundaries

- Live Stripe keys are refused. Only test-mode keys are accepted where a key is checked.
- No live Stripe API calls are made by this version.
- Verification does not run application scenarios and reports `could_not_run`.
- Unsupported changes remain `needs_human`; the tool does not guess replacement fields.
- Findings are evidence with confidence and reason, not proof of runtime behavior.

## Supported versions

The latest code on `main` is the supported version. There are no long-term support branches.
