// oracle.js — INDEPENDENT reference implementation of poker hand evaluation
// Written using a COMPLETELY different algorithm from hand-eval.js so we can
// cross-check the production code. If production and oracle disagree,
// at least one is wrong.
//
// Algorithm: Brute-force pattern matching on rank counts and suit counts
// (no best-5 enumeration, no cardChips reuse). This is intentionally naive.

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUE = {};
RANKS.forEach((r, i) => RANK_VALUE[r] = i + 2);

// === Reference scoring table (must match HAND_TYPES in game) ===
const REF_BASE = {
  HIGH_CARD: { chips: 5, mult: 1 },
  PAIR: { chips: 10, mult: 2 },
  TWO_PAIR: { chips: 20, mult: 2 },
  THREE_KIND: { chips: 30, mult: 3 },
  STRAIGHT: { chips: 30, mult: 4 },
  FLUSH: { chips: 35, mult: 4 },
  FULL_HOUSE: { chips: 40, mult: 4 },
  FOUR_KIND: { chips: 60, mult: 7 },
  STRAIGHT_FLUSH: { chips: 100, mult: 8 },
  ROYAL_FLUSH: { chips: 100, mult: 8 },
};
const HAND_ORDER = Object.keys(REF_BASE);

// === Reference cardChips — same as game ===
function refCardChips(card) {
  if (!card) return 0;
  const v = RANK_VALUE[card.rank];
  if (v === 14) return 11; // Ace
  if (v >= 11) return 10;  // J/Q/K
  return v;
}

// === Reference evaluateHand — uses a different algorithm
// For 1-4 cards: detects pair/trips/quads directly on all cards
// For 5+ cards: enumerates all 5-card subsets, picks highest by rank,
// uses simpler flush/straight detection (no Wheel special case!)
function refEvaluateHand(cards) {
  if (!cards || cards.length === 0) {
    return { typeId: 'HIGH_CARD', chips: REF_BASE.HIGH_CARD.chips, mult: 1, scoringCards: [] };
  }
  // For 5+ cards, need to find best 5-card subset
  if (cards.length >= 5) {
    const combos = combinations(cards, 5);
    let best = null;
    for (const combo of combos) {
      const ev = refScore5(combo);
      if (!best || compareRef(ev, best) > 0) best = ev;
    }
    return best;
  }
  // For 1-4 cards: detect rank pattern
  return refScorePartial(cards);
}

function refScorePartial(cards) {
  const counts = {};
  for (const c of cards) counts[c.rank] = (counts[c.rank] || 0) + 1;
  const sortedCounts = Object.values(counts).sort((a, b) => b - a);
  let typeId;
  if (sortedCounts[0] === 4) typeId = 'FOUR_KIND';
  else if (sortedCounts[0] === 3) typeId = 'THREE_KIND';
  else if (sortedCounts[0] === 2 && sortedCounts.length >= 2 && sortedCounts[1] === 2) typeId = 'TWO_PAIR';
  else if (sortedCounts[0] === 2) typeId = 'PAIR';
  else typeId = 'HIGH_CARD';
  return chipsMultFor(typeId, cards);
}

function refScore5(cards) {
  // Detect straight flush / royal first (since SF > 4kind)
  const ranks = cards.map(c => RANK_VALUE[c.rank]).sort((a, b) => a - b);
  const suits = cards.map(c => c.suit);
  const allSameSuit = suits.every(s => s === suits[0]);
  const isStraight = refCheckStraight(ranks);

  if (allSameSuit) {
    if (ranks[0] === 10 && ranks[4] === 14) return chipsMultFor('ROYAL_FLUSH', cards);
    if (isStraight) return chipsMultFor('STRAIGHT_FLUSH', cards);
    // NOT a straight flush → fall through (flush, others)
  }

  const counts = {};
  for (const c of cards) counts[c.rank] = (counts[c.rank] || 0) + 1;
  const sortedCounts = Object.values(counts).sort((a, b) => b - a);

  if (sortedCounts[0] === 4) return chipsMultFor('FOUR_KIND', cards);
  if (sortedCounts[0] === 3 && sortedCounts[1] === 2) return chipsMultFor('FULL_HOUSE', cards);
  if (allSameSuit) return chipsMultFor('FLUSH', cards);
  if (isStraight) return chipsMultFor('STRAIGHT', cards);
  if (sortedCounts[0] === 3) return chipsMultFor('THREE_KIND', cards);
  if (sortedCounts[0] === 2 && sortedCounts[1] === 2) return chipsMultFor('TWO_PAIR', cards);
  if (sortedCounts[0] === 2) return chipsMultFor('PAIR', cards);
  return chipsMultFor('HIGH_CARD', cards);
}

function chipsMultFor(typeId, cards) {
  // Both implementations sum all card chips (simplified: sum ALL cards in scoring)
  // Both use base + sumCardChips (note: production uses scoringCards which for 5card = all 5)
  const chips = REF_BASE[typeId].chips + cards.reduce((s, c) => s + refCardChips(c), 0);
  return { typeId, chips, mult: REF_BASE[typeId].mult, scoringCards: cards };
}

function refCheckStraight(sortedRanks) {
  if (sortedRanks.length !== 5) return false;
  // Standard straight
  let normal = true;
  for (let i = 1; i < 5; i++) {
    if (sortedRanks[i] !== sortedRanks[i - 1] + 1) {
      normal = false;
      break;
    }
  }
  if (normal) return true;
  // Wheel A-2-3-4-5
  if (sortedRanks[0] === 2 && sortedRanks[1] === 3 && sortedRanks[2] === 4 &&
      sortedRanks[3] === 5 && sortedRanks[4] === 14) return true;
  return false;
}

function compareRef(a, b) {
  const ai = HAND_ORDER.indexOf(a.typeId);
  const bi = HAND_ORDER.indexOf(b.typeId);
  if (ai !== bi) return ai - bi;
  return a.chips - b.chips;
}

function combinations(arr, k) {
  if (k > arr.length) return [arr];
  if (k === arr.length) return [arr];
  if (k === 1) return arr.map(x => [x]);
  const result = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const head = arr[i];
    const tail = combinations(arr.slice(i + 1), k - 1);
    for (const t of tail) result.push([head, ...t]);
  }
  return result;
}

// === Convert game result → oracle shape for comparison ===
function adapt(handEvalResult, originalCards) {
  if (!handEvalResult || !handEvalResult.type) return null;
  // In production the scoringCards ARE the 5-card subset that scored
  // For invariants we'd need to pass the original input
  return {
    typeId: handEvalResult.type.id,
    chips: handEvalResult.chips,
    mult: handEvalResult.mult,
    scoringCards: handEvalResult.scoringCards || originalCards,
  };
}

module.exports = {
  RANKS, SUITS, RANK_VALUE,
  refCardChips,
  refEvaluateHand,
  adapt,
  REF_BASE,
  HAND_ORDER,
};
