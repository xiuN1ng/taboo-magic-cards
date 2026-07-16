# Contributing

## Development flow

```
1. Make changes in a feature branch
2. Open a PR against `main`
3. GitHub Action runs the test suite (gate)
4. Mavis (developer agent) opens a code-reviewer session to review
5. code-reviewer posts APPROVE or REQUEST_CHANGES to the PR
6. If APPROVE → Mavis merges → CI deploys to Pages
7. If REQUEST_CHANGES → fix the issues → re-request review
```

## The golden rule: separate dev from review

**The same agent that writes the code MUST NOT be the one that approves it.**

This is enforced by:

1. A dedicated `code-reviewer` agent (different persona, only reviews)
2. The `scripts/review-pr.sh` script that spawns a fresh session with the diff
3. GitHub branch protection: `main` requires 1 review before merge

When you ask "review PR #N":

- I (Mavis, dev) invoke the `code-reviewer` agent in a separate session
- The reviewer posts their verdict via GitHub API
- If APPROVE: I auto-merge
- If REQUEST_CHANGES: I see what the reviewer said and fix it

## How to ask for a review

Just say: **"review PR #N"** — I'll handle the rest.

Or run the script directly:

```bash
./scripts/review-pr.sh 2
```

This generates a review prompt at `scripts/.review-prompt-pr<N>.md` and the next conversation turn will spawn the reviewer.

## Test locally before pushing

```bash
node test/harness.js
```

All 140 assertions must pass. The CI gate is the same.

## Branch protection

`main` is protected:
- Requires 1 approving review
- Dismiss stale approvals on push
- No force-push
- No deletion

(Configure in GitHub repo settings → Branches → main)
