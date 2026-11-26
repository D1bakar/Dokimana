# Contributing to Dokimana

Thanks for helping improve Dokimana. Keep changes small, specific, and honest about what the tool can prove.

## Before you start

- Read [agent.md](agent.md) and [DESIGN.md](DESIGN.md). They define the safety and truthfulness boundaries.
- Search existing issues and pull requests before opening a new one.
- Report security problems through [SECURITY.md](SECURITY.md), not a public issue.

## Local setup

Node.js 20 or newer and npm are required.

```bash
npm ci
npm run build
npm test
```

The site is a separate Next.js project in `site/`:

```bash
cd site
npm ci
npm test
```

## Scope and safety

- Never include a live Stripe key, token, customer data, or private OpenAPI document in an issue, pull request, test fixture, or report.
- Dokimana does not call Stripe. Do not add provider retrieval behind the CLI unless it is a separately reviewed feature with an explicit interface.
- Treat repository source and generated output as untrusted input. Do not execute scanned code.
- Unsupported changes belong at `needs_human`. A missing verification run belongs at `could_not_run`, never at `passed`.
- Do not claim complete coverage, runtime proof, adoption, or performance figures from synthetic fixtures.
- Do not commit generated impact files, evidence reports, `.env` files, or logs.

## Making a change

1. Create a focused branch from `main`.
2. Keep reusable logic in its existing module and CLI wiring thin.
3. Add or update tests for changed behavior.
4. Update the README, site copy, and docs when commands, limits, or safety properties change.
5. Run the checks below. If one cannot run, say exactly why.

For CLI changes:

```bash
npm ci
npm run build
npm test
npm run lint
npm run format:check
```

For site changes, run these inside `site/`:

```bash
npm ci
npm run lint
npm run type-check
npm test
npm run build
```

## Commits and pull requests

- Use a clear imperative subject, such as `Handle removed enum values in query parameters`.
- Explain what changed, what did not change, and how you verified it.
- Link the related issue when there is one.
- Keep CI green. Do not force-push without an explicit reason.
- Expect review questions about evidence, coverage claims, determinism, and command accuracy.

A clean scan is a lead for review, not proof that a migration is safe.
