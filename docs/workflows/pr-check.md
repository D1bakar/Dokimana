# Pull request API compatibility check

This workflow compares the OpenAPI spec at the pull request base ref with the spec in the pull request head, then posts one sticky comment with the summary. It uses the published action, which must include a committed `dist/src/cli.js`.

```yaml
name: PR API compatibility

on:
  pull_request:
    paths:
      - 'specs/**'
      - 'src/**'
      - 'package.json'

permissions:
  contents: read
  pull-requests: write
  security-events: write
  actions: read

jobs:
  dokimana:
    runs-on: ubuntu-latest
    steps:
      - name: Check out merge commit and base ref
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Compare base and head specs
        id: dokimana
        uses: D1bakar/Dokimana@v1
        with:
          repo: .
          old-openapi: specs/stripe.json
          new-openapi: specs/stripe.json
          old-version: ${{ github.event.pull_request.base.sha }}
          new-version: ${{ github.event.pull_request.head.sha }}
          base-ref: origin/${{ github.base_ref }}
          head-ref: ${{ github.event.pull_request.head.sha }}
          fail-on-changes: false
          fail-on: high
          format: sarif
          comment: true
          upload-artifacts: true
          upload-sarif: true

      - name: Publish summary
        if: always()
        run: |
          echo '## Dokimana' >> "$GITHUB_STEP_SUMMARY"
          echo '${{ steps.dokimana.outputs.summary }}' >> "$GITHUB_STEP_SUMMARY"
          echo 'JSON: `${{ steps.dokimana.outputs.report-path }}`' >> "$GITHUB_STEP_SUMMARY"
          echo 'SARIF: `${{ steps.dokimana.outputs.sarif-path }}`' >> "$GITHUB_STEP_SUMMARY"
```

Notes:

- `base-ref: origin/${{ github.base_ref }}` requires `fetch-depth: 0`; a shallow checkout does not contain the base branch ref.
- `old-openapi` and `new-openapi` may point to the same path: the baseline is read with `git show base-ref:<path>` and the candidate is read from the working tree.
- `fail-on: high` fails only when a high-confidence finding exists. Use `medium` or `low` to tighten the gate, or `none` to disable confidence-based failure.
- `format: sarif` generates SARIF in addition to the always-generated JSON and Markdown reports. `upload-sarif: true` also forces SARIF generation even when `format` is `json` or `markdown`.
- `security-events: write` and `actions: read` are required for `github/codeql-action/upload-sarif@v3`.
- Pull requests from forks get a read-only `GITHUB_TOKEN`; set `comment: false` and `upload-sarif: false` for those runs, or split trusted and untrusted jobs.
- The sticky comment is identified by `<!-- dokimana-action -->` and is updated in place on subsequent pushes.
