#!/usr/bin/env bash
# review-pr.sh — Generate a review prompt + invoke the code-reviewer agent
#
# Usage: ./scripts/review-pr.sh <PR_NUMBER>
# Example: ./scripts/review-pr.sh 2
#
# What it does:
# 1. Fetches the PR diff via GitHub API
# 2. Writes a structured review prompt to scripts/.review-prompt-pr<N>.md
# 3. Then the Mavis (me) picks it up, calls `communicate({spawn: {agent_name: "code-reviewer"}})`
#    with the prompt, and the reviewer does the work in a separate session.
#
# This script is the GATHER step. The actual review happens in a separate
# code-reviewer session so the developer (Mavis) and reviewer are isolated.

set -euo pipefail

PR_NUMBER="${1:-}"
if [ -z "$PR_NUMBER" ]; then
  echo "Usage: $0 <PR_NUMBER>"
  exit 1
fi

REPO="xiuN1ng/taboo-magic-cards"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "❌ GITHUB_TOKEN env not set"
  exit 1
fi

echo "📥 Fetching PR #$PR_NUMBER..."

PR_JSON=$(curl -sL --max-time 15 -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  "https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}")

PR_TITLE=$(echo "$PR_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('title',''))")
PR_AUTHOR=$(echo "$PR_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('user',{}).get('login',''))")
PR_HEAD=$(echo "$PR_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('head',{}).get('ref',''))")

# Fetch raw diff
PR_DIFF=$(curl -sL --max-time 15 -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github.v3.diff" \
  "https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}")

# Truncate huge diffs
PR_DIFF_PREVIEW=$(echo "$PR_DIFF" | head -800)
FILES_CHANGED=$(echo "$PR_DIFF" | grep -cE "^diff --git")

echo "  Title:        $PR_TITLE"
echo "  Author:       $PR_AUTHOR"
echo "  Branch:       $PR_HEAD"
echo "  Files:        $FILES_CHANGED"
echo "  Diff lines:   $(echo "$PR_DIFF" | wc -l)"

# Build the prompt for the code-reviewer session
PROMPT_FILE="${SCRIPT_DIR}/.review-prompt-pr${PR_NUMBER}.md"
cat > "$PROMPT_FILE" <<EOF
# Code Review: PR #${PR_NUMBER}

## PR Metadata
- **Title**: ${PR_TITLE}
- **Author**: ${PR_AUTHOR}
- **Branch**: ${PR_HEAD}
- **URL**: https://github.com/${REPO}/pull/${PR_NUMBER}
- **Files changed**: ${FILES_CHANGED}

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
\`\`\`bash
cd ${REPO_DIR}
node test/harness.js
\`\`\`
All 140 assertions must pass.

## PR Diff

\`\`\`diff
${PR_DIFF_PREVIEW}
\`\`\`

## How to post your review

**APPROVE** (no major issues):
\`\`\`bash
curl -X POST -H "Authorization: Bearer \${GITHUB_TOKEN}" \\
  -H "Content-Type: application/json" \\
  https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}/reviews \\
  -d '{
    "event": "APPROVE",
    "body": "## Summary\\n...\\n## Findings\\nNone blocking.\\n## Test coverage\\nAdequate."
  }'
\`\`\`

**REQUEST_CHANGES** (any blocker or major issue):
\`\`\`bash
curl -X POST -H "Authorization: Bearer \${GITHUB_TOKEN}" \\
  -H "Content-Type: application/json" \\
  https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}/reviews \\
  -d '{
    "event": "REQUEST_CHANGES",
    "body": "## Findings\\n1. [MAJOR] file:line — description\\n..."
  }'
\`\`\`

## Report back

After posting the review, return:
- **Verdict**: APPROVE / REQUEST_CHANGES / COMMENT
- **Review URL**: (the HTML URL of the review you posted)
- **Top 3 findings** (if any)

DO NOT modify any source files. You are review-only.
EOF

echo ""
echo "✅ Review prompt written to: $PROMPT_FILE"
echo ""
echo "🚀 Next step: Mavis (me) will spawn a code-reviewer session with this prompt"
echo "   via the communicate tool: communicate({spawn: {agent_name: 'code-reviewer'}, content: '<prompt>'})"
echo ""
echo "   The reviewer will post their verdict to GitHub and report back."
echo "   Watch: https://github.com/${REPO}/pull/${PR_NUMBER}"
