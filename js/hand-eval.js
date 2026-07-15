// hand-eval.js — Poker hand evaluation (Balatro-style)
// All hands: { type, name, chips, mult, cardIndices }

const HAND_TYPES = {
  HIGH_CARD:    { id: 'HIGH_CARD',    name: '高 牌',     chips: 5,   mult: 1,  desc: '任意一张单牌',          ex: 'A♠' },
  PAIR:         { id: 'PAIR',         name: '一 对',     chips: 10,  mult: 2,  desc: '两张同点数',            ex: '7♥ 7♣' },
  TWO_PAIR:     { id: 'TWO_PAIR',     name: '两 对',     chips: 20,  mult: 2,  desc: '两个不同的对子',         ex: '7♥ 7♣ K♠ K♦' },
  THREE_KIND:   { id: 'THREE_KIND',   name: '三 条',     chips: 30,  mult: 3,  desc: '三张同点数',            ex: '7♥ 7♣ 7♠' },
  STRAIGHT:     { id: 'STRAIGHT',     name: '顺 子',     chips: 30,  mult: 4,  desc: '五张连续点数',          ex: '5-6-7-8-9' },
  FLUSH:        { id: 'FLUSH',        name: '同 花',     chips: 35,  mult: 4,  desc: '五张同花色',            ex: '♥ ♥ ♥ ♥ ♥' },
  FULL_HOUSE:   { id: 'FULL_HOUSE',   name: '葫 芦',     chips: 40,  mult: 4,  desc: '三条加一对',            ex: '7♥ 7♣ 7♠ K♦ K♠' },
  FOUR_KIND:    { id: 'FOUR_KIND',    name: '铁 支',     chips: 60,  mult: 7,  desc: '四张同点数',            ex: '7♥ 7♣ 7♠ 7♦' },
  STRAIGHT_FLUSH:{ id: 'STRAIGHT_FLUSH', name: '同花顺',   chips: 100, mult: 8,  desc: '同花色的顺子',         ex: '5-6-7-8-9 ♠' },
  ROYAL_FLUSH:  { id: 'ROYAL_FLUSH',  name: '皇 家 顺',  chips: 100, mult: 8,  desc: '10-J-Q-K-A 同花',        ex: '10-J-Q-K-A ♠' },
};

const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUE = {};
RANK_ORDER.forEach((r, i) => RANK_VALUE[r] = i + 2); // 2=2, ..., A=14

// Returns the chip value of a single card (face value, A=11, J/Q/K=10)
// Returns 0 for invalid/missing cards (NaN-safe).
function cardChips(card) {
  if (!card || !card.rank) return 0;
  const v = RANK_VALUE[card.rank];
  if (v === undefined || v === null) return 0;
  if (v === 14) return 11; // Ace
  if (v >= 11) return 10;  // J/Q/K
  return v;
}

// Evaluate a hand (array of cards). Returns { type, chips, mult, ... }
// Always picks the best 5-card combination from up to 8 cards.
function evaluateHand(cards) {
  if (!cards || cards.length === 0) {
    return { type: HAND_TYPES.HIGH_CARD, chips: 0, mult: 1, scoringCards: [] };
  }

  // Generate all 5-card combinations if we have 5+, else use all
  const combos = cards.length >= 5 ? combinations(cards, 5) : [cards];
  let best = null;

  for (const combo of combos) {
    const result = scoreCombo(combo);
    if (!best || compareHands(result, best) > 0) {
      best = result;
    }
  }

  if (!best) {
    // No 5-card combo produced a valid hand (only happens with <5 cards).
    // Delegate to scoreCombo which now handles partial hands (pair/trips/quads).
    return scoreCombo(cards);
  }

  return best;
}

function combinations(arr, k) {
  if (k > arr.length) return [arr];
  if (k === arr.length) return [arr];
  if (k === 1) return arr.map(x => [x]);

  const result = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const head = arr[i];
    const tailCombs = combinations(arr.slice(i + 1), k - 1);
    for (const t of tailCombs) {
      result.push([head, ...t]);
    }
  }
  return result;
}

function scoreCombo(cards) {
  if (cards.length < 5) {
    // For 1-4 cards, can still detect pair/trips/quads (straight/flush/full need 5)
    const rankCounts = countRanks(cards);
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    if (counts[0] === 4) return handResult(HAND_TYPES.FOUR_KIND, cards);
    if (counts[0] === 3) return handResult(HAND_TYPES.THREE_KIND, cards);
    if (counts[0] === 2 && counts.length >= 2 && counts[1] === 2) return handResult(HAND_TYPES.TWO_PAIR, cards);
    if (counts[0] === 2) return handResult(HAND_TYPES.PAIR, cards);
    // Fall through to high card
    return handResult(HAND_TYPES.HIGH_CARD, cards);
  }

  const ranks = cards.map(c => RANK_VALUE[c.rank]).sort((a, b) => a - b);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = checkStraight(ranks);

  // Royal flush: A-K-Q-J-10 of same suit
  if (isFlush && isStraight && ranks[4] === 14 && ranks[0] === 10) {
    return handResult(HAND_TYPES.ROYAL_FLUSH, cards);
  }

  // Straight flush
  if (isFlush && isStraight) {
    return handResult(HAND_TYPES.STRAIGHT_FLUSH, cards);
  }

  // Four of a kind
  const rankCounts = countRanks(cards);
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  if (counts[0] === 4) {
    return handResult(HAND_TYPES.FOUR_KIND, cards);
  }

  // Full house
  if (counts[0] === 3 && counts[1] === 2) {
    return handResult(HAND_TYPES.FULL_HOUSE, cards);
  }

  // Flush
  if (isFlush) {
    return handResult(HAND_TYPES.FLUSH, cards);
  }

  // Straight
  if (isStraight) {
    return handResult(HAND_TYPES.STRAIGHT, cards);
  }

  // Three of a kind
  if (counts[0] === 3) {
    return handResult(HAND_TYPES.THREE_KIND, cards);
  }

  // Two pair
  if (counts[0] === 2 && counts[1] === 2) {
    return handResult(HAND_TYPES.TWO_PAIR, cards);
  }

  // Pair
  if (counts[0] === 2) {
    return handResult(HAND_TYPES.PAIR, cards);
  }

  // High card
  return handResult(HAND_TYPES.HIGH_CARD, cards);
}

function handResult(type, cards) {
  return {
    type,
    chips: type.chips + cards.reduce((s, c) => s + cardChips(c), 0),
    mult: type.mult,
    scoringCards: cards,
  };
}

function checkStraight(sortedRanks) {
  if (sortedRanks.length !== 5) return false;
  // Normal straight
  let normal = true;
  for (let i = 1; i < 5; i++) {
    if (sortedRanks[i] !== sortedRanks[i - 1] + 1) {
      normal = false;
      break;
    }
  }
  if (normal) return true;

  // Wheel: A-2-3-4-5 (treat A as 1)
  if (sortedRanks[4] === 14 && sortedRanks[0] === 2 && sortedRanks[1] === 3 && sortedRanks[2] === 4 && sortedRanks[3] === 5) {
    return true;
  }

  return false;
}

function countRanks(cards) {
  const counts = {};
  for (const c of cards) {
    counts[c.rank] = (counts[c.rank] || 0) + 1;
  }
  return counts;
}

function compareHands(a, b) {
  // Returns > 0 if a is better
  // Use the type order
  const order = ['HIGH_CARD', 'PAIR', 'TWO_PAIR', 'THREE_KIND', 'STRAIGHT', 'FLUSH', 'FULL_HOUSE', 'FOUR_KIND', 'STRAIGHT_FLUSH', 'ROYAL_FLUSH'];
  const ai = order.indexOf(a.type.id);
  const bi = order.indexOf(b.type.id);
  if (ai !== bi) return ai - bi;
  // Same type: higher chips wins
  return a.chips - b.chips;
}

// Check if a hand matches a specific type (used by directive)
function handMatchesType(handResult, typeId) {
  return handResult.type.id === typeId;
}

window.HandEval = {
  HAND_TYPES,
  RANK_ORDER,
  RANK_VALUE,
  evaluateHand,
  cardChips,
  handMatchesType,
};
