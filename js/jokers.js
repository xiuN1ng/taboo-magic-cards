// jokers.js — Joker card definitions
// Each joker: { id, name, desc, apply(handResult, selectedCards, state) -> { chips, mult } }

const JOKERS = [
  {
    id: 'joker_pair',
    name: '对子专家',
    desc: '出一对时:+8 筹码',
    apply(hand) {
      if (hand.type.id === 'PAIR' || hand.type.id === 'TWO_PAIR' || hand.type.id === 'THREE_KIND' ||
          hand.type.id === 'FULL_HOUSE' || hand.type.id === 'FOUR_KIND') {
        return { chips: 8 };
      }
      return { chips: 0 };
    },
  },
  {
    id: 'joker_flush',
    name: '同花狂热',
    desc: '出同花时:+15 筹码',
    apply(hand) {
      if (['FLUSH', 'STRAIGHT_FLUSH', 'ROYAL_FLUSH'].includes(hand.type.id)) {
        return { chips: 15 };
      }
      return { chips: 0 };
    },
  },
  {
    id: 'joker_straight',
    name: '顺子信徒',
    desc: '出顺子时:×2 倍率',
    apply(hand) {
      if (['STRAIGHT', 'STRAIGHT_FLUSH', 'ROYAL_FLUSH'].includes(hand.type.id)) {
        return { mult: 2 };
      }
      return { mult: 0 };
    },
  },
  {
    id: 'joker_face',
    name: '人头收藏家',
    desc: '每张人头牌:+4 筹码',
    apply(hand, selected) {
      let c = 0;
      for (const card of selected) {
        if (['J', 'Q', 'K'].includes(card.rank)) c += 4;
      }
      return { chips: c };
    },
  },
  {
    id: 'joker_ace',
    name: 'A 之狂',
    desc: '每张 A:+5 倍率',
    apply(hand, selected) {
      let m = 0;
      for (const card of selected) {
        if (card.rank === 'A') m += 5;
      }
      return { mult: m };
    },
  },
  {
    id: 'joker_red',
    name: '红心迷',
    desc: '每张红色牌:+3 筹码',
    apply(hand, selected) {
      let c = 0;
      for (const card of selected) {
        if (card.suitColor === 'red') c += 3;
      }
      return { chips: c };
    },
  },
  {
    id: 'joker_black',
    name: '黑桃党',
    desc: '每张黑色牌:+3 筹码',
    apply(hand, selected) {
      let c = 0;
      for (const card of selected) {
        if (card.suitColor === 'black') c += 3;
      }
      return { chips: c };
    },
  },
  {
    id: 'joker_fortune',
    name: '命运轮盘',
    desc: '每回合随机:+1 到 +5 倍率',
    apply(hand) {
      return { mult: Math.floor(Math.random() * 5) + 1 };
    },
  },
  {
    id: 'joker_curse',
    name: '诅咒之眼',
    desc: '每张禁卡:+3 倍率(并 +1 Doom)',
    cursed: true,
    apply(hand, selected, state) {
      let m = 0;
      let cnt = 0;
      for (const card of selected) {
        if (card.forbidden) {
          m += 3;
          cnt += 1;
        }
      }
      if (cnt > 0) {
        state.doom += cnt;
      }
      return { mult: m };
    },
  },
  {
    id: 'joker_press',
    name: '按键收藏家',
    desc: '本关按过键:每手 +10 筹码',
    apply(hand, selected, state) {
      if (state.pressedButtonThisAnte) return { chips: 10 };
      return { chips: 0 };
    },
  },
];

function getRandomJokers(count, excludeIds = []) {
  const pool = JOKERS.filter(j => !excludeIds.includes(j.id));
  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function getJokerById(id) {
  return JOKERS.find(j => j.id === id);
}

window.Jokers = {
  JOKERS,
  getRandomJokers,
  getJokerById,
};
