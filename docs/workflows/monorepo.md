# Monorepo matrix check

Each package gets its own scan. The action's built-in artifact name is fixed, so this example disables action-level uploads and uploads per-package artifacts from the workflow instead. The sticky comment is also disabled per matrix job (all jobs would share the same marker); a final job posts one combined comment.

```yaml
name: Monorepo API checks

on:
  pull_request:
    paths:
      - 'packages/**/spec.json'
      - 'packages/**/src/**'

permissions:
  contents: read
  actions: read

jobs:
  dokimana:
    strategy:
      fail-fast: false
      matrix:
        include:
          - package: payments
            spec: packages/payments/spec.json
          - package: billing
            spec: packages/billing/spec.json
    runs-on: ubuntu-latest
    steps:
      - name: Check out merge commit and base ref
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Scan ${{ matrix.package }}
        id: dokimana
        uses: D1bakar/Dokimana@v1
        with:
          repo: packages/${{ matrix.package }}
          old-openapi: ${{ matrix.spec }}
          new-openapi: ${{ matrix.spec }}
          old-version: ${{ github.event.pull_request.base.sha }}
          new-version: ${{ github.event.pull_request.head.sha }}
          base-ref: origin/${{ github.base_ref }}
          head-ref: ${{ github.event.pull_request.head.sha }}
          fail-on-changes: false
          fail-on: high
          format: markdown
          comment: false
          upload-artifacts: false
          upload-sarif: false

      - name: Upload ${{ matrix.package }} reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: dokimana-${{ matrix.package }}
          path: |
            dokimana-impact.json
            dokimana-evidence.md
          if-no-files-found: warn
          retention-days: 7

      - name: Summarize ${{ matrix.package }}
        if: always()
        run: |
          echo "### ${{ matrix.package }}" >> "$GITHUB_STEP_SUMMARY"
          echo '${{ steps.dokimana.outputs.summary }}' >> "$GITHUB_STEP_SUMMARY"

  comment:
    if: always() && github.event_name == 'pull_request'
    needs: dokimana
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      actions: read
    steps:
      - name: Download per-package reports
        uses: actions/download-artifact@v4
        with:
          pattern: dokimana-*
          path: dokimana-artifacts

      - name: Post one sticky comment
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: |
          set -uo pipefail
          body_file="$RUNNER_TEMP/dokimana-monorepo-comment.md"
          {
            echo '<!-- dokimana-action -->'
            echo '## Dokimana monorepo check'
            echo
            echo 'Reports are attached as `dokimana-<package>` workflow artifacts.'
            echo
            echo '[Open all artifacts](/'"$GITHUB_REPOSITORY"'/actions/runs/'"$GITHUB_RUN_ID"'#artifacts)'
          } > "$body_file"
          node --input-type=module -e 'import { readFileSync, writeFileSync } from "node:fs"; writeFileSync(process.argv[1], JSON.stringify({ body: readFileSync(process.argv[2], "utf8") }));' "$RUNNER_TEMP/payload.json" "$body_file"

          api="repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments"
          ids_file="$RUNNER_TEMP/dokimana-comment-ids.txt"
          gh api "$api" --paginate --jq 'map(select((.body // "") | contains("<!-- dokimana-action -->"))) | .[0].id // empty' > "$ids_file"
          comment_id=''
          while IFS= read -r line; do
            if [ -n "$line" ]; then comment_id="$line"; fi
          done < "$ids_file"
          if [ -n "$comment_id" ]; then
            gh api --method PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$comment_id" --input "$RUNNER_TEMP/payload.json" > /dev/null
          else
            gh api --method POST "$api" --input "$RUNNER_TEMP/payload.json" > /dev/null
          fi
```

Notes:

- `repo` is set to the matrix package directory, so call-site scanning is scoped to that package while specs remain workspace-relative.
- GitHub does not merge outputs from matrix jobs; use the per-package artifacts and the combined comment instead.
- Add `security-events: write` and set `upload-sarif: true` in each matrix job if you want package-scoped SARIF uploads; use distinct `category` values if you also customize the action.
- Fork pull requests have a read-only token. Disable the `comment` job or split trusted and untrusted jobs for forks.
