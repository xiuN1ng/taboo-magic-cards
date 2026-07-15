// shop.js — Shop between blinds
// Sells jokers, discards (heal), and reroll

function buildShopOffers(state) {
  const offers = [];
  // 2-3 jokers
  const jokerCount = 2 + (Math.random() < 0.5 ? 1 : 0);
  const ownedIds = state.jokers.map(j => j.id);
  const jokers = Jokers.getRandomJokers(jokerCount, ownedIds);
  jokers.forEach(j => {
    offers.push({
      kind: 'joker',
      id: j.id,
      name: j.name,
      desc: j.desc,
      price: 5 + Math.floor(Math.random() * 4),
      data: j,
    });
  });
  // 1-2 money
  if (Math.random() < 0.7) {
    offers.push({
      kind: 'money',
      name: '碎银袋',
      desc: '立得 $5',
      price: 0, // free
      value: 5,
    });
  }
  // 1-2 reroll
  if (Math.random() < 0.5) {
    offers.push({
      kind: 'discard_restore',
      name: '机会',
      desc: '本关弃牌次数 +1',
      price: 4,
    });
  }
  // 1 curse remover
  if (Math.random() < 0.4 && state.doom >= 3) {
    offers.push({
      kind: 'doom_down',
      name: '净化',
      desc: 'Doom -2',
      price: 7,
    });
  }
  return offers;
}

function applyShopOffer(state, offer, options = {}) {
  if (offer.price > 0 && state.money < offer.price) return { ok: false, reason: '钱不够' };
  state.money -= offer.price;
  switch (offer.kind) {
    case 'joker':
      if (state.jokers.length >= 5) {
        if (options.replaceIdx === undefined) {
          // Refund money, signal that replacement is needed
          state.money += offer.price;
          return { ok: false, reason: 'NEED_REPLACE', offer: offer };
        }
        // Replace at index
        state.jokers[options.replaceIdx] = offer.data;
        return { ok: true, msg: `替换为 ${offer.name}` };
      }
      state.jokers.push(offer.data);
      return { ok: true, msg: `获得 ${offer.name}` };
    case 'money':
      state.money += offer.value;
      return { ok: true, msg: `+ $${offer.value}` };
    case 'discard_restore':
      state.discardsLeft += 1;
      return { ok: true, msg: '弃牌次数 +1' };
    case 'doom_down':
      state.doom = Math.max(0, state.doom - 2);
      return { ok: true, msg: 'Doom -2' };
  }
  return { ok: false, reason: '未知商品' };
}

function sellJoker(state, idx) {
  if (idx < 0 || idx >= state.jokers.length) return { ok: false, reason: '无效的 Joker' };
  const sold = state.jokers.splice(idx, 1)[0];
  state.money += 2;
  return { ok: true, msg: `出售 ${sold.name} · +$2`, joker: sold };
}

window.Shop = {
  buildShopOffers,
  applyShopOffer,
  sellJoker,
};
