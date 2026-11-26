# Repository maintenance

A short checklist for presentation and release work. Keep this file factual; do not add adopted-by lists, download counts, or performance claims that the repository cannot support.

## Repository presentation

- Description: `Local CLI that traces Stripe OpenAPI changes to TypeScript and JavaScript call sites.`
- Topics: `cli`, `typescript`, `javascript`, `stripe`, `openapi`, `api-compatibility`, `static-analysis`, `developer-tools`, `github-action`, `nodejs`.
- Social preview: [`assets/social-preview.png`](assets/social-preview.png), 1280×640. GitHub does not expose an API for the social preview slot, so upload it through **Settings → Social preview**.

README badges must point to real workflows and real files. Do not add badges for unpublished packages, releases, sponsors, or metrics.

Dependabot handles npm minor and patch updates. Major npm upgrades stay manual because this project uses peer-ranged tooling and should be reviewed as a deliberate change.

## Release checklist

1. Move finished entries from `Unreleased` to a version section in [CHANGELOG.md](CHANGELOG.md).
2. Confirm `package.json` has the intended version.
3. Run the CLI and site checks listed in [CONTRIBUTING.md](CONTRIBUTING.md).
4. Confirm the working tree contains only intended changes.
5. Tag the release and publish notes that link to the changelog.
6. Update the repository description and topics if the scope changed.

## Site presentation

Site copy comes from `README.md` and `agent.md`. Keep the six sections, the three-colour palette, old-route redirects, and the `could_not_run` boundary. Do not add a tracker, remote font, remote script, card layout, or invented metric.
