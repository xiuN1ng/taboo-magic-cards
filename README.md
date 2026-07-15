# Taboo Magic Cards · 禁忌魔卡

> A Balatro-like roguelike card game. The theme is **「别按那个键」 — "Don't Press That Button"**.

![Status](https://img.shields.io/badge/status-MVP-blueviolet)
![Tests](https://img.shields.io/badge/tests-137%20passing-success)
![License](https://img.shields.io/badge/license-MIT-green)

## What is it?

- 8 antes × 3 blinds = 24 levels of poker-scoring roguelike
- Theme: every level, a forbidden rule (don't play pairs, don't discard, only 1 card...)
- A red button you CAN press anytime — 70% reward / 30% punishment
- 10 jokers with unique effects, 10 forbidden directives
- Pure HTML/CSS/JS, **no build step** — runs from a static file server

## Live Demo

🌐 https://xiuN1ng.github.io/taboo-magic-cards/

## Quick Start

```bash
# Serve with any static server
python3 -m http.server 8080
# or
npx serve .

# Open http://localhost:8080
```

That's it. No install, no build, no dependency to download at runtime (anime.js v3.2.1 is loaded from CDN).

## Project Structure

```
.
├── index.html              # All screen markup (title / rules / game / end)
├── css/
│   └── style.css           # All styles + portrait/landscape media queries
├── js/
│   ├── hand-eval.js        # Poker hand evaluation (10 hand types)
│   ├── deck.js             # 52 cards + mark forbidden + shuffle
│   ├── directive.js        # 10 forbidden directives
│   ├── jokers.js           # 10 jokers
│   ├── button-event.js     # 70/30 reward/penalty roll
│   ├── shop.js             # Shop between blinds
│   ├── endings.js          # 3 endings based on 戒断值 (corruption)
│   ├── ui.js               # UI + anime.js animations
│   ├── game-state.js       # Single source of truth for state
│   └── main.js             # Orchestrator
├── test/
│   ├── harness.js          # 137 assertions across 14 modules
│   ├── oracle.js           # Independent reference implementation
│   └── README.md           # Testing docs
├── assets/                 # Screenshots
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Pages CI/CD
└── README.md
```

## Scoring

`score = floor(chips × mult)`

| Source | Effect |
|--------|--------|
| Hand base (HIGH_CARD 5/1, PAIR 10/2, …, ROYAL_FLUSH 100/8) | Foundation |
| Card chips (A=11, J/Q/K=10, else face) | Additive to chips |
| Forbidden card per card | +5 mult, +1 doom, +1 corrupt |
| Jokers | Various chips/mult |
| Directive violation | ×2.5 mult |
| `cardChips` invalid input | Returns 0 (NaN-safe) |

Full table — see `js/hand-eval.js` `HAND_TYPES` constant.

## Level Targets (8 Antes × 3 Blinds)

| Ante | Small | Big | Boss |
|------|-------|-----|------|
| 1 | 100 | 150 | 200 |
| 2 | 150 | 225 | 300 |
| 3 | 250 | 375 | 500 |
| 4 | 400 | 600 | 800 |
| 5 | 700 | 1,050 | 1,400 |
| 6 | 1,200 | 1,800 | 2,400 |
| 7 | 2,000 | 3,000 | 4,000 |
| 8 | 3,500 | 5,250 | **7,000** (final) |

## Testing

```bash
node test/harness.js
```

- **137 assertions** across 14 modules
- **5,000+ random hands** cross-validated against an independent oracle
- **1,000 random hands** checked against invariants (NaN-safety, type legality, mult bounds)
- Pure Node, **no server / no browser / no network**
- ~1.4s total

See [`test/README.md`](test/README.md) for details.

## Deployment

This repo auto-deploys to GitHub Pages on every push to `main`:

1. `.github/workflows/deploy.yml` triggers on push
2. Runs `node test/harness.js` (must pass)
3. Deploys to `https://xiuN1ng.github.io/taboo-magic-cards/`

### Maintenance

**GitHub PAT Rotation**

The Personal Access Token used to push to this repo expires **30 days** after creation. To rotate:

1. Visit https://github.com/settings/tokens/new
2. Create new PAT with `repo` + `workflow` scopes
3. Update the local encrypted secret (in Mavis's secret store, name `GITHUB_TOKEN`)
4. Push a small commit to verify the new token works
5. Revoke the old token at https://github.com/settings/tokens

**Expiry schedule** (for current token):
- Created: 2026-07-15
- Expires: 2026-08-14
- Auto-reminder fires: 2026-08-11 (3 days before)

The CI workflow itself uses GitHub Actions' auto-generated `GITHUB_TOKEN` and is **not affected** by PAT expiration — only direct pushes require the user PAT.

## Tech Stack

- **Vanilla JS** (ES6+, no transpilation)
- **anime.js v3.2.1** (CDN, animations)
- **CSS3** (no preprocessor, responsive via media queries)
- **No backend** — all state in memory

## License

MIT
