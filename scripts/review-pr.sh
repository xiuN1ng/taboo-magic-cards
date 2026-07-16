#!/usr/bin/env bash
# review-pr.sh — Generate a review prompt + invoke the code-reviewer agent
#
# Usage: ./scripts/review-pr.sh <PR_NUMBER> [REPO]
# Example: ./scripts/review-pr.sh 2
# Example: ./scripts/review-pr.sh 2 other-user/some-repo
#
# What it does:
# 1. Fetches the PR diff via GitHub API (with HTTP status check)
# 2. Writes a structured review prompt to scripts/.review-prompt-pr<N>.md
#    (uses single-quoted heredoc + safe interpolation to prevent injection)
# 3. Marks truncation explicitly if diff exceeds the cap
# 4. Mavis (the dev agent) then spawns a code-reviewer session with the prompt
#
# This script is the GATHER step. The actual review happens in a separate
# code-reviewer session so the developer (Mavis) and reviewer are isolated.

set -euo pipefail

PR_NUMBER="${1:-}"
REPO="${2:-${GITHUB_REPO:-xiuN1ng/taboo-magic-cards}}"

if [ -z "$PR_NUMBER" ]; then
  echo "Usage: $0 <PR_NUMBER> [REPO]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "❌ GITHUB_TOKEN env not set"
  exit 1
fi

# Helper: HTTP-status-checked curl to GitHub API.
# Returns body on 2xx, exits 1 on anything else.
gh_api() {
  local url="$1"
  local out
  out=$(curl -sL --max-time 15 -w '\n__HTTP_STATUS__:%{http_code}' \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" "$url")
  local status="${out##*__HTTP_STATUS__:}"
  local body="${out%$'\n'__HTTP_STATUS__:*}"
  if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
    echo "❌ GitHub API error: HTTP $status" >&2
    echo "$body" | head -3 >&2
    return 1
  fi
  printf '%s' "$body"
}

echo "📥 Fetching PR #$PR_NUMBER from $REPO..."

# Fetch PR metadata with status check
PR_JSON=$(gh_api "https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}")
PR_TITLE=$(echo "$PR_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('title',''))")
PR_AUTHOR=$(echo "$PR_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('user',{}).get('login',''))")
PR_HEAD=$(echo "$PR_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('head',{}).get('ref',''))")

# Fetch raw diff with status check
PR_DIFF=$(gh_api -H "Accept: application/vnd.github.v3.diff" \
  "https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}")

# Diff size: count, cap with explicit marker
DIFF_TOTAL_LINES=$(echo "$PR_DIFF" | wc -l)
DIFF_CAP=800
if [ "$DIFF_TOTAL_LINES" -gt "$DIFF_CAP" ]; then
  PR_DIFF_BODY=$(echo "$PR_DIFF" | head -"$DIFF_CAP")
  TRUNCATION_NOTE="⚠️ [DIFF TRUNCATED: showing $DIFF_CAP of $DIFF_TOTAL_LINES lines. Request the full diff separately if you need to review the rest.]"
else
  PR_DIFF_BODY="$PR_DIFF"
  TRUNCATION_NOTE=""
fi

FILES_CHANGED=$(echo "$PR_DIFF" | grep -cE "^diff --git")

echo "  Title:        $PR_TITLE"
echo "  Author:       $PR_AUTHOR"
echo "  Branch:       $PR_HEAD"
echo "  Files:        $FILES_CHANGED"
echo "  Diff lines:   $DIFF_TOTAL_LINES"

# Build the prompt with safe heredoc + safe interpolation.
# Use a placeholder strategy to avoid shell expansion inside the user-content area.
PROMPT_FILE="${SCRIPT_DIR}/.review-prompt-pr${PR_NUMBER}.md"

# Step 1: write the static scaffold using a single-quoted heredoc (no expansion)
cat > "$PROMPT_FILE" <<'SCAFFOLD_EOF'
# Code Review: PR @PR_NUM@

## PR Metadata
- **Title**: @PR_TITLE@
- **Author**: @PR_AUTHOR@
- **Branch**: @PR_HEAD@
- **URL**: https://github.com/@REPO@/pull/@PR_NUM@
- **Files changed**: @FILES_CHANGED@

## Your Role

You are 'code-reviewer' — a strict, skeptical code reviewer for 禁忌魔卡.

You are NOT the developer. You did NOT write this code. You are the GATEKEEPER.

## What to check (in order)

1. **Logic errors**: any wrong computation, off-by-one, wrong condition?
2. **NaN risks**: any arithmetic on possibly-undefined values?
3. **Edge cases**: empty input, single element, max values, zero?
4. **Test coverage**: every behavior change has new tests? Are tests real (not no-ops)?
5. **Scope creep**: any unrelated changes mixed in?
6. **Code duplication**: any code that should be in a helper?
7. **Security**: any XSS, injection, secrets leaked?
8. **Perf**: any obvious O(n²) when O(n) would do?

## How to test
```bash
cd @REPO_DIR@
node test/harness.js
```
All assertions must pass.

## PR Diff

```diff
@DIFF_BODY@
```

@TRUNCATION_NOTE@

## How to post your review

**APPROVE** (no major issues):
```bash
curl -X POST -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Content-Type: application/json" \
  https://api.github.com/repos/@REPO@/pulls/@PR_NUM@/reviews \
  -d '{"event":"APPROVE","body":"## Summary\n...verdict details..."}'
```

**REQUEST_CHANGES** (any blocker or major issue):
```bash
curl -X POST -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Content-Type: application/json" \
  https://api.github.com/repos/@REPO@/pulls/@PR_NUM@/reviews \
  -d '{"event":"REQUEST_CHANGES","body":"## Findings\n1. [MAJOR] file:line — description"}'
```

## Report back

After posting the review, return:
- **Verdict**: APPROVE / REQUEST_CHANGES / COMMENT
- **Review URL**: (the HTML URL of the review you posted)
- **Top 3 findings** (if any)

DO NOT modify any source files. You are review-only.
SCAFFOLD_EOF

# Step 2: substitute placeholders via Python (avoids shell expansion of user content)
python3 - "$PROMPT_FILE" "$PR_NUMBER" "$PR_TITLE" "$PR_AUTHOR" "$PR_HEAD" \
  "$REPO" "$REPO_DIR" "$FILES_CHANGED" "$PR_DIFF_BODY" "$TRUNCATION_NOTE" <<'PY_EOF'
import sys, json
path, num, title, author, head, repo, repo_dir, files, diff, trunc = sys.argv[1:11]
with open(path, 'r', encoding='utf-8') as f: content = f.read()
content = content.replace('@PR_NUM@', num)
content = content.replace('@PR_TITLE@', json.dumps(title))   # JSON-escapes special chars
content = content.replace('@PR_AUTHOR@', json.dumps(author))
content = content.replace('@PR_HEAD@', json.dumps(head))
content = content.replace('@REPO@', repo)
content = content.replace('@REPO_DIR@', repo_dir)
content = content.replace('@FILES_CHANGED@', str(files))
content = content.replace('@DIFF_BODY@', diff)
content = content.replace('@TRUNCATION_NOTE@', trunc)
with open(path, 'w', encoding='utf-8') as f: f.write(content)
PY_EOF

echo ""
echo "✅ Review prompt written to: $PROMPT_FILE"
echo "   (truncation marker: $([ -n "$TRUNCATION_NOTE" ] && echo "yes" || echo "no"))"
echo ""
echo "🚀 Next step: Mavis (the dev agent) will spawn a code-reviewer session"
echo "   via the communicate tool: communicate({spawn: {agent_name: 'code-reviewer'}, content: '<prompt>'})"
echo ""
echo "   The reviewer will post their verdict to GitHub and report back."
echo "   Watch: https://github.com/${REPO}/pull/${PR_NUMBER}"
