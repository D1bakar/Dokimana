# Scheduled spec drift check

This workflow creates two local commits: one adds a baseline spec file, the next modifies it. It then asks Dokimana to compare the file at the baseline commit with the file in the working tree. Nothing is pushed and no network access is used for the comparison.

```yaml
name: Scheduled API drift check

on:
  schedule:
    - cron: '17 6 * * 1'
  workflow_dispatch:

permissions:
  contents: read
  actions: read

jobs:
  compare-commits:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository with history
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Create baseline and candidate spec commits
        id: spec
        shell: bash
        run: |
          set -euo pipefail
          mkdir -p specs
          cp fixtures/stripe-old.json specs/stripe-scheduled.json
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add specs/stripe-scheduled.json
          git commit -m 'chore: add baseline Stripe spec'
          base_sha="$(git rev-parse HEAD)"

          node --input-type=module - <<'NODE'
          import { readFileSync, writeFileSync } from 'node:fs';
          const file = 'specs/stripe-scheduled.json';
          const spec = JSON.parse(readFileSync(file, 'utf8'));
          spec.info = { ...(spec.info ?? {}), version: 'scheduled-candidate' };
          spec.components.schemas.Customer.properties = { id: { type: 'string' } };
          writeFileSync(file, JSON.stringify(spec, null, 2));
          NODE

          git add specs/stripe-scheduled.json
          git commit -m 'chore: add candidate Stripe spec'
          echo "base_sha=$base_sha" >> "$GITHUB_OUTPUT"
          echo "head_sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"

      - name: Compare base commit with candidate commit
        id: dokimana
        uses: D1bakar/Dokimana@v1
        with:
          repo: .
          old-openapi: specs/stripe-scheduled.json
          new-openapi: specs/stripe-scheduled.json
          old-version: ${{ steps.spec.outputs.base_sha }}
          new-version: ${{ steps.spec.outputs.head_sha }}
          base-ref: ${{ steps.spec.outputs.base_sha }}
          head-ref: ${{ steps.spec.outputs.head_sha }}
          fail-on-changes: false
          fail-on: medium
          format: html
          comment: false
          upload-artifacts: true
          upload-sarif: false

      - name: Publish summary
        if: always()
        run: |
          echo '## Scheduled Dokimana check' >> "$GITHUB_STEP_SUMMARY"
          echo '${{ steps.dokimana.outputs.summary }}' >> "$GITHUB_STEP_SUMMARY"
          echo 'HTML: `${{ steps.dokimana.outputs.html-path }}`' >> "$GITHUB_STEP_SUMMARY"
```

Notes:

- Both `old-openapi` and `new-openapi` are `specs/stripe-scheduled.json` because the baseline is read with `git show <base-ref>:<path>` and the candidate is read from the working tree.
- `base_sha` points at the commit where the file first exists; pointing at the parent commit would make `git show` fail.
- `format: html` generates the HTML report in addition to JSON and Markdown. Set `upload-sarif: true` and add `security-events: write` if your team wants the drift recorded in code scanning.
- `comment: false` is intentional: scheduled runs have no pull request, so the sticky comment step would be a no-op.
- Adjust `fixtures/stripe-old.json` to the baseline spec in your repository.
