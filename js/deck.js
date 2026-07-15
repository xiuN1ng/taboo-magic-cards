// deck.js — Card and deck management
// A card: { id, rank, suit, forbidden, chipValue }
// Ranks: 2-10, J, Q, K, A
// Suits: ♠ ♥ ♦ ♣ (display: 黑桃/红心/方块/梅花)

const SUITS = [
  { id: 'spade',   name: '♠', color: 'black', label: '黑桃' },
  { id: 'heart',   name: '♥', color: 'red',   label: '红心' },
  { id: 'diamond', name: '♦', color: 'red',   label: '方块' },
  { id: 'club',    name: '♣', color: 'black', label: '梅花' },
];

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

let _cardIdCounter = 0;
function nextCardId() { return ++_cardIdCounter; }

// Build a fresh 52-card deck
function buildStandardDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: nextCardId(),
        rank,
        suit: suit.id,
        suitName: suit.name,
        suitColor: suit.color,
        forbidden: false,
      });
    }
  }
  return deck;
}

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Mark `count` random cards as forbidden (red border)
function markForbidden(deck, count) {
  const a = deck.slice();
  for (let i = 0; i < count && a.length > 0; i++) {
    const idx = Math.floor(Math.random() * a.length);
    a[idx] = { ...a[idx], forbidden: true };
  }
  return a;
}

// Count forbidden cards in a hand or deck
function countForbidden(cards) {
  return cards.filter(c => c.forbidden).length;
}

// Remove cards by ids from deck
function removeCards(deck, ids) {
  const idSet = new Set(ids);
  return deck.filter(c => !idSet.has(c.id));
}

window.Deck = {
  SUITS,
  RANKS,
  buildStandardDeck,
  shuffle,
  markForbidden,
  countForbidden,
  removeCards,
  nextCardId,
};
