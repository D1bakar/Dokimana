# How to Use Git and GitHub Like an Engineer

This guide describes a safe, reviewable workflow for ApiProof contributors and coding agents. It assumes Git and GitHub CLI (`gh`) are installed and authenticated where needed.

## 1. Understand the repository before acting

Start by identifying the repository, branch, remote, and working-tree state:

```bash
git rev-parse --show-toplevel
git status --short --branch
git branch --show-current
git remote -v
git log -5 --oneline --decorate
```

Read the relevant code and project instructions before editing. A clean `git status` is not a substitute for reading the code; a non-clean status means there may be work to preserve. Never assume every change in a checkout belongs to the current task.

## 2. Keep changes scoped and reviewable

- Make a focused change that solves the requested problem; avoid unrelated formatting or cleanup.
- Before editing, locate the behavior and its tests. Follow the data path and use existing patterns.
- Add or update tests alongside the behavior. Prefer fixtures over external services.
- After editing, inspect exactly what changed:

```bash
git diff --check
git diff --stat
git diff
git status --short
```

`git diff --check` finds whitespace errors; it does not prove correctness. Run the relevant tests, build, and linter, and report which checks ran.

## 3. Stage deliberately

Stage only files belonging to the change:

```bash
git add src/path/to/change.ts src/path/to/change.test.ts
git diff --cached --check
git diff --cached --stat
git diff --cached
```

Do not use `git add .` or `git add -A` as a shortcut when the working tree may contain unrelated work. Do not commit generated outputs, credentials, `.env` files, dependencies, or temporary artifacts. For ApiProof specifically, never stage secret keys or live Stripe credentials.

## 4. Write useful commits when requested

Do not commit unless the user asks. When asked:

- Make sure the staged diff contains only the intended change.
- Run the relevant checks before committing.
- Use a short imperative subject that explains the change, such as `Add structural Stripe change records`.
- Include the required co-author trailer unless the user explicitly says not to:

```text
Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
```

Afterward, verify the result with `git show --stat --oneline HEAD` and `git status --short`.

## 5. Branches and remotes

Confirm the current branch and intended destination before branch or remote operations. Do not switch branches or create one unless requested or established by project instructions. Do not rewrite shared history. Avoid `git reset --hard`, `git clean`, forced checkouts, and force pushes; these can destroy work. If a destructive operation appears necessary, stop and get explicit user approval.

Before a requested push:

```bash
git status --short --branch
git log --oneline --decorate -5
git remote -v
```

Push only the intended branch to the intended writable remote. Never push automatically after a local change. Never force push unless the user explicitly authorizes the exact operation and target.

## 6. Work with GitHub through `gh`

Check the selected repository and authentication:

```bash
gh auth status
gh repo view --json nameWithOwner,url,defaultBranchRef
```

Use the repository's configured remote and actual PR base; do not guess `main` or another default if the PR is stacked or the user specifies a different target.

### Pull requests

Only create a PR when asked. Before opening one, make sure the intended branch is published and the working diff is understood. Review the final diff and tests, then write a PR body with:

- a concise summary of the user-visible change;
- implementation detail that helps reviewers;
- tests/checks actually run;
- limitations or behavior not verified;
- issue links only when the relationship is real.

Example inspection commands:

```bash
gh pr status
gh pr view --json number,title,state,baseRefName,headRefName,url
gh pr diff
```

Use GitHub's review workflow for review requests. Keep inline review comments tied to changed lines, actionable, and focused on behavior. Do not say a PR is approved, merged, or deployed unless GitHub confirms it.

### Issues and reviews

Use the intended repository explicitly when there is any ambiguity:

```bash
gh issue view 123 --repo OWNER/REPO
gh pr view 123 --repo OWNER/REPO
```

Read the full relevant thread before replying. Distinguish an issue comment from a reply in an inline review thread. Avoid duplicate comments and preserve the user's voice when drafting text for them.

## 7. ApiProof-specific safety for CI

- Do not pass live Stripe keys to local commands, GitHub Actions, containers, tests, or agent contexts.
- Do not add secrets to Git remotes, logs, test snapshots, issue/PR bodies, benchmark datasets, or research files.
- Treat the source repository and its scripts as untrusted. Do not run install scripts or tests outside the documented isolated runner when verifying third-party code.
- Use least-privilege GitHub Actions permissions and pin actions to immutable commit SHAs before relying on them in production.
- Keep CI outputs useful but non-sensitive. Artifacts and PR reports must say when scan coverage is partial or verification did not run.

## 8. Finish with an engineering handoff

Before handing work back:

1. Inspect `git status` and the full diff.
2. Remove only temporary files created by the task; never delete unknown files.
3. Run relevant checks and capture the actual outcome.
4. State what changed and what was verified, without claiming more than the evidence supports.
5. Leave commits, pushes, PR creation, and merges to the user unless explicitly requested.

## Further reading

- [Git documentation](https://git-scm.com/docs)
- [GitHub CLI manual](https://cli.github.com/manual/)
- [GitHub pull request guidance](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests)
- [GitHub Actions security hardening](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)
