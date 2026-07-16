# AGENTS.md — AI Agent Instructions for 禁忌魔卡

> **Read this file first** if you are a Mavis (or any AI) session working in this repo. It defines the rules of engagement, the architecture, and the things that have already bitten us.

## What this project is

**禁忌魔卡** (Taboo Magic Cards) — a Balatro-like roguelike card game. Theme: *「别按那个键」* (Don't Press That Button).

- **Tech**: vanilla HTML/CSS/JS. No build step. No bundler. Pure static.
- **Levels**: 8 antes × 3 blinds (small / big / boss) = 24 levels.
- **Live**: https://xiuN1ng.github.io/taboo-magic-cards/
- **Repo**: https://github.com/xiuN1ng/taboo-magic-cards

## Mandatory workflow (every change)

```
1. Create a feature branch     (NEVER push to main directly — branch protection will block)
2. Run `node test/harness.js`  (must pass all 140 assertions locally)
3. Push branch + open PR       (CI runs tests as a gate)
4. Spawn `code-reviewer` agent (separate persona, only reviews, never writes)
5. Address review findings     (APPROVE → merge | REQUEST_CHANGES → fix)
6. Merge to main               (CI runs tests + deploys to Pages)
```

**Hard rules** (violating these gets the change reverted):

- ❌ Never push directly to `main`. Use a branch + PR.
- ❌ Never approve your own code. The dev (you) and the reviewer are separate.
- ❌ Never merge a PR that the `code-reviewer` agent hasn't reviewed.
- ❌ Never push without running `node test/harness.js` first. All 140 must be green.
- ❌ Never add no-op tests (`assert(1+1===2)`) just to "look like a test change" — the code-reviewer will catch this.
- ❌ Never hardcode secrets in the repo. Use `${GITHUB_TOKEN}` env var.

## Architecture quick reference

| Path | What |
|------|------|
| `index.html` | All screen markup (title / rules / game / end) |
| `css/style.css` | All styles + responsive media queries |
| `js/hand-eval.js` | Poker hand evaluation, 10 hand types |
| `js/deck.js` | 52-card deck + `markForbidden()` (pool-based, see "known sharp edges") |
| `js/jokers.js` | 10 jokers with `apply(hand, selected, state) → {chips, mult}` |
| `js/directive.js` | 10 forbidden directives + `checkViolation()` |
| `js/game-state.js` | Single source of truth, `nextBlind()`, `calculateTarget(ante, blind)` |
| `js/ui.js` | All UI rendering + anime.js animations |
| `js/main.js` | Orchestrator |
| `test/harness.js` | 140 assertions across 14 modules — run this before pushing |
| `test/oracle.js` | Independent reference poker evaluator (cross-checks production) |
| `test/README.md` | How the test suite works |
| `scripts/review-pr.sh` | PR review helper: fetches diff, writes review prompt |
| `.github/workflows/ci.yml` | CI: test on PR, test + deploy on main push |
| `CONTRIBUTING.md` | Human contributor doc (less strict than this) |

## Known sharp edges (things that broke before)

These caused real bugs in the past. Don't repeat them:

### 1. `markForbidden` — must use a separate index pool

**Bug we caught**: 17.7% of the time, only 4 cards were marked forbidden (random index collision). Local tests didn't catch this; CI's 1000-iteration stress test did.

**Rule**: never use a single deck array as both the source and the picking pool. Use a separate `pool` of indices and swap-remove.

```js
// ✅ Correct
const pool = a.map((_, i) => i);
for (let i = 0; i < count && pool.length > 0; i++) {
  const pickIdx = Math.floor(Math.random() * pool.length);
  a[pool[pickIdx]] = { ...a[pool[pickIdx]], forbidden: true };
  // swap-remove
}

// ❌ Wrong (caused 17.7% bug)
const idx = Math.floor(Math.random() * a.length);
a[idx] = { ...a[idx], forbidden: true };
// idx can repeat → fewer cards marked
```

### 2. `cardChips` — must be NaN-safe

`cardChips({})` must return `0`, not `undefined`. Undefined arithmetic produces NaN, which propagates everywhere and makes the game silently broken. Test: `cardChips({})` should equal `0`.

### 3. < 5 card hand evaluation

Player may select 1–4 cards (e.g., last hand of a blind, or `play_one_card` directive). The scoreCombo function must handle partial hands by detecting PAIR / TRIPS / QUADS directly. Don't early-return HIGH_CARD for <5 cards.

### 4. Score formula visibility

`score = floor(chips × mult)`. The 5-segment breakdown (手型基础 + 牌面筹码 = 总筹码 × 总倍率 = 本手得分) is shown to the player. Don't break this UI.

### 5. Branch protection requires 1 review

`main` is protected. Even doc changes need a PR + review. The `code-reviewer` agent posts the review.

## The reviewer (don't impersonate)

`code-reviewer` is a **separate Mavis agent** with a strict, skeptical persona. It:
- Only reviews — never modifies source code
- Looks for: logic errors, NaN risks, edge cases, test coverage, scope creep, security
- Cites `file:line` and quotes the offending code
- Ends with verdict: `APPROVE` / `REQUEST_CHANGES` / `COMMENT`

**To get a review**:
```bash
cd /workspace/taboo-cards
bash scripts/review-pr.sh <PR_NUMBER>
# Wait for me (Mavis) to spawn the reviewer session
# Or in conversation: say "review PR #N"
```

**Architectural caveat**: with a single GitHub user, `REQUEST_CHANGES` may be rejected by GitHub (same user can't block own PR). `APPROVE` works. The reviewer posts `COMMENT` as a fallback and is explicit about the limitation.

## Deploy

- Push to `main` (after merge) → CI runs tests → uploads artifact → deploys to GH Pages
- Live URL: https://xiuN1ng.github.io/taboo-magic-cards/
- Build is `actions/deploy-pages@v4`, takes ~30 seconds

## Tests

```bash
cd /workspace/taboo-cards
node test/harness.js
# Should print "通过: 140    失败: 0" and exit 0
```

- 140 assertions across 14 modules
- 5000+ random hands cross-validated against independent oracle
- 1000 random hands checked against invariants (NaN-safety, type legality)
- Pure Node, no server, no browser. ~1.4s total.

See `test/README.md` for the full design.

## Token rotation

- GITHUB_TOKEN (in Mavis secret store) expires **2026-08-14**
- Cron task `419699145798090` fires **2026-08-11 09:00** (Asia/Shanghai) with a reminder
- To rotate: create new PAT at https://github.com/settings/tokens/new (scopes: `repo` + `workflow`), give it to Mavis, it updates the secret
- CI uses GitHub's auto-generated `GITHUB_TOKEN`, not the user PAT. So CI keeps working even after PAT expires; only direct pushes need the fresh PAT.

## When you're not sure

- Read this file first
- Then `CONTRIBUTING.md` (human-facing companion)
- Then `test/README.md` (test suite design)
- Then look at the actual code in `js/`
- If still stuck, ask. Don't guess on numerical code.
