#!/usr/bin/env bash
# End-to-end check for the composite action's local command path.
# Builds the CLI, creates a throwaway git fixture, and compares specs with
# `git show` without pushing, fetching, or executing repository code.
set -eu

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

script_dir="$(cd -- "${0%/*}" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"

echo "Building the Dokimana CLI..."
(cd "$repo_root" && npm run build) || fail 'npm run build failed.'

tmp_dir="$(node --input-type=module -e 'import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path"; console.log(mkdtempSync(join(process.env.TMPDIR || tmpdir(), "dokimana-action-")))')" || fail 'Unable to create a temporary directory.'
cleanup() {
  node --input-type=module -e 'import { rmSync } from "node:fs"; rmSync(process.argv[1], { recursive: true, force: true })' "$tmp_dir" > /dev/null 2>&1 || true
}
trap cleanup EXIT

fixture="$tmp_dir/fixture"
work="$tmp_dir/work"
node --input-type=module -e 'import { mkdirSync } from "node:fs"; for (const dir of process.argv.slice(1)) mkdirSync(dir, { recursive: true });' "$fixture/spec" "$fixture/src" "$work" || fail 'Unable to create fixture directories.'

printf '%s\n' \
  '{' \
  '  "openapi": "3.1.0",' \
  '  "info": { "version": "integration-old" },' \
  '  "components": {' \
  '    "schemas": {' \
  '      "Customer": {' \
  '        "properties": {' \
  '          "id": { "type": "string" },' \
  '          "legacy_name": { "type": "string" }' \
  '        }' \
  '      }' \
  '    }' \
  '  }' \
  '}' > "$fixture/spec/stripe-old.json"

printf '%s\n' \
  '{' \
  '  "openapi": "3.1.0",' \
  '  "info": { "version": "integration-new" },' \
  '  "components": {' \
  '    "schemas": {' \
  '      "Customer": {' \
  '        "properties": {' \
  '          "id": { "type": "string" },' \
  '          "name": { "type": "string" }' \
  '        }' \
  '      }' \
  '    }' \
  '  }' \
  '}' > "$fixture/spec/stripe-new.json"

printf '%s\n' \
  "import Stripe from 'stripe';" \
  '' \
  "const stripe = new Stripe('sk_test_integration', { apiVersion: '2024-01-01' as never });" \
  '' \
  'export async function readCustomer(id: string) {' \
  '  const customer = await stripe.customers.retrieve(id);' \
  '  return customer.legacy_name;' \
  '}' > "$fixture/src/call-site.ts"

git -C "$fixture" init -q || fail 'Unable to initialize the fixture repository.'
git -C "$fixture" config user.name 'Dokimana Action Test'
git -C "$fixture" config user.email 'dokimana@example.invalid'
git -C "$fixture" add spec src || fail 'Unable to stage fixture files.'
git -C "$fixture" commit -q -m 'fixture: specs and call site' || fail 'Unable to commit the fixture.'
base_sha="$(git -C "$fixture" rev-parse HEAD)"

echo 'Running the action command path with git-show comparison...'
git -C "$fixture" show "$base_sha:spec/stripe-old.json" > "$work/old-openapi.json" || fail 'git show could not read the baseline spec.'
node --input-type=module -e 'import { copyFileSync } from "node:fs"; copyFileSync(process.argv[1], process.argv[2]);' "$fixture/spec/stripe-new.json" "$work/new-openapi.json" || fail 'Unable to stage the candidate spec.'

node "$repo_root/dist/src/cli.js" scan \
  --repo "$fixture" \
  --old "$work/old-openapi.json" \
  --new "$work/new-openapi.json" \
  --old-version integration-old \
  --new-version integration-new \
  --json "$work/dokimana-impact.json" \
  --markdown "$work/dokimana-evidence.md" \
  --sarif "$work/dokimana.sarif" \
  --html "$work/dokimana-report.html" || fail 'The Dokimana scan command failed.'

for report in \
  "$work/dokimana-impact.json" \
  "$work/dokimana-evidence.md" \
  "$work/dokimana.sarif" \
  "$work/dokimana-report.html"
do
  if [ ! -s "$report" ]; then
    fail "Missing or empty report: $report"
  fi
done

node --input-type=module -e 'import { readFileSync } from "node:fs"; const impact = JSON.parse(readFileSync(process.argv[1], "utf8")); if (!Array.isArray(impact.changes) || impact.changes.length === 0) { console.error("Expected at least one structural change in the impact report."); process.exitCode = 1; }' "$work/dokimana-impact.json" || fail 'Impact report does not contain a structural change.'

echo 'PASS: JSON, Markdown, SARIF, and HTML reports were produced from a local git-show comparison.'
