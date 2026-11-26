# Changesets

A changeset is a small Markdown file that records a user-visible change and the version bump it needs. The release workflow reads these files on `main`, opens a version pull request, and publishes to npm after that pull request is merged. Do not edit `package.json`'s version or `CHANGELOG.md` by hand.

## Add a changeset

1. From the repository root, run `npx changeset`.
2. Select `dokimana` and choose the bump described in [VERSIONING.md](../VERSIONING.md).
   During 0.x, use `minor` for breaking changes and `patch` for compatible fixes.
3. Write a short summary aimed at CLI users: what changed, what did not, and any migration step. Do not include keys, customer data, or private specs.
4. Commit the generated `.changeset/<random-name>.md` file with the code change.

A typical file looks like this:

```md
---
'dokimana': patch
---

Report SARIF output paths without changing scan inputs.
```

## When no version bump is needed

Documentation-only changes and internal refactors with no observable behavior change do not need a changeset. If you want an empty entry in the version pull request, run `npx changeset --empty`.

## What happens on `main`

- With changesets present, `.github/workflows/release.yml` opens or updates a `chore: version packages` pull request.
- Merging that pull request removes the changesets, bumps the version, and writes the changelog entry.
- The next push to `main` runs the checks and benchmarks, then publishes with `npm publish --provenance --access public`.
- No publish happens from a pull request event.
