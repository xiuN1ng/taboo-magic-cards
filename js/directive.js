// directive.js — Forbidden Directives per blind
// Each directive tells the player NOT to do X. Violating = ×2.5 score.

const DIRECTIVES = [
  {
    id: 'no_discard',
    text: '本关不可弃牌',
    check: (state) => state.discardsUsedThisBlind > 0,
    violationHint: '你弃了牌',
  },
  {
    id: 'no_pair',
    text: '本关不可出一对',
    check: (state, handResult) => handResult.type.id === 'PAIR' || handResult.type.id === 'TWO_PAIR' || handResult.type.id === 'THREE_KIND' || handResult.type.id === 'FULL_HOUSE' || handResult.type.id === 'FOUR_KIND',
    violationHint: '你出了对子',
  },
  {
    id: 'no_flush',
    text: '本关不可出同花',
    check: (state, handResult) => handResult.type.id === 'FLUSH' || handResult.type.id === 'STRAIGHT_FLUSH' || handResult.type.id === 'ROYAL_FLUSH',
    violationHint: '你出了同花',
  },
  {
    id: 'no_straight',
    text: '本关不可出顺子',
    check: (state, handResult) => handResult.type.id === 'STRAIGHT' || handResult.type.id === 'STRAIGHT_FLUSH' || handResult.type.id === 'ROYAL_FLUSH',
    violationHint: '你出了顺子',
  },
  {
    id: 'no_face',
    text: '本关不可出 J Q K',
    check: (state, handResult, selectedCards) => selectedCards.some(c => ['J', 'Q', 'K'].includes(c.rank)),
    violationHint: '你出了人头牌',
  },
  {
    id: 'no_forbidden_play',
    text: '本关不可出禁卡',
    check: (state, handResult, selectedCards) => selectedCards.some(c => c.forbidden),
    violationHint: '你出了禁卡',
  },
  {
    id: 'play_one_card',
    text: '本关只可出 1 张牌',
    check: (state, handResult, selectedCards) => selectedCards.length > 1,
    violationHint: '你出了多张',
  },
  {
    id: 'play_five_cards',
    text: '本关必须出 5 张牌',
    check: (state, handResult, selectedCards) => selectedCards.length !== 5,
    violationHint: '你没出 5 张',
  },
  {
    id: 'use_all_suits',
    text: '本关必须出 4 种花色',
    check: (state, handResult, selectedCards) => new Set(selectedCards.map(c => c.suit)).size < 4,
    violationHint: '花色不够 4 种',
  },
  {
    id: 'low_value_only',
    text: '本关只可出 2-6',
    check: (state, handResult, selectedCards) => selectedCards.some(c => {
      const v = HandEval.RANK_VALUE[c.rank];
      return v > 6;
    }),
    violationHint: '你出了大牌',
  },
];

// Pick a random directive, but prefer ones that haven't been used yet
function pickDirective(usedIds = []) {
  const available = DIRECTIVES.filter(d => !usedIds.includes(d.id));
  const pool = available.length > 0 ? available : DIRECTIVES;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Check if a play violates the directive
function checkViolation(directive, state, handResult, selectedCards) {
  return directive.check(state, handResult, selectedCards);
}

window.Directive = {
  DIRECTIVES,
  pickDirective,
  checkViolation,
};
