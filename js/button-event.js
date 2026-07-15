// button-event.js — "The Button" event after each blind
// 70% good (reward), 30% bad (penalty)

const REWARDS = [
  { type: 'money',   value: 5,  name: '+ $5',  desc: '来钱' },
  { type: 'money',   value: 8,  name: '+ $8',  desc: '暴富' },
  { type: 'joker',   name: '神秘小丑', desc: '随机得 1 个小丑' },
  { type: 'cards',   count: 2, name: '+2 牌', desc: '牌组加 2 张' },
  { type: 'forgive', name: '宽恕', desc: 'Doom -1' },
];

const PENALTIES = [
  { type: 'money',  value: 3,  name: '- $3',  desc: '破财' },
  { type: 'doom',   value: 1,  name: '+1 Doom', desc: '诅咒加深' },
  { type: 'curse',  name: '诅咒', desc: '随机 1 张手牌变禁卡' },
  { type: 'tax',    value: 5,  name: '重税', desc: '弃牌次数 -1' },
];

function rollButton() {
  const r = Math.random();
  if (r < 0.7) {
    // Reward
    const reward = REWARDS[Math.floor(Math.random() * REWARDS.length)];
    return { good: true, ...reward };
  } else {
    // Penalty
    const penalty = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
    return { good: false, ...penalty };
  }
}

window.ButtonEvent = {
  rollButton,
  REWARDS,
  PENALTIES,
};
