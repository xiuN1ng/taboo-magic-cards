# Contributing

> **If you are an AI agent working in this repo, read [`AGENTS.md`](AGENTS.md) instead** — it has the strict rules of engagement, architecture, and known sharp edges. This file is the human-friendly companion.

## Quick start

1. **Read the rules** in `AGENTS.md` (yes, really, even if you're a human)
2. Create a feature branch: `git checkout -b fix/your-thing`
3. Make changes + run `node test/harness.js` — must be 140+ green
4. Push + open PR
5. Ask Mavis to spawn the `code-reviewer` agent (or just say "review PR #N")
6. After review approves, Mavis merges → CI deploys

## The golden rule: separate dev from review

The agent that **writes** the code must not be the agent that **approves** it. This is enforced by:

- A dedicated `code-reviewer` agent (different persona, only reviews, never writes)
- Branch protection: `main` requires 1 review + green CI before merge
- The `scripts/review-pr.sh` helper that spawns the reviewer in a separate session

## How a review works

1. You (or Mavis) run `scripts/review-pr.sh <PR_NUMBER>`
2. Script fetches the diff, writes a structured review prompt
3. Mavis spawns a `code-reviewer` session with that prompt
4. Reviewer analyzes + posts verdict (APPROVE / REQUEST_CHANGES / COMMENT) via GitHub API
5. Mavis sees the verdict:
   - **APPROVE** → merges the PR
   - **REQUEST_CHANGES** → fixes the issues, pushes again, re-reviews
   - **COMMENT** → reads the feedback, decides what to do

## The reviewer persona

`code-reviewer` is a strict, skeptical gatekeeper. It will:

- Flag no-op tests (`assert(1+1===2)`)
- Catch silent diff truncation
- Find injection vectors in shell scripts
- Notice scope creep
- Demand real test coverage for behavior changes

It is not your friend. That is the point.

## Test locally before pushing

```bash
node test/harness.js
```

All 140 assertions must pass. The CI gate is the same. The reviewer will check that the test count went up if you changed behavior.

## Branch protection

`main` is protected:
- 1 approving review required
- Status checks (CI) must pass
- Dismiss stale approvals on new push
- No force-push
- No deletion

See `Settings → Branches → main` in GitHub to verify.

## Token rotation

GITHUB_TOKEN (used to push and call GitHub API) expires 2026-08-14. The cron reminder fires 2026-08-11. To rotate, see `AGENTS.md` § "Token rotation".
