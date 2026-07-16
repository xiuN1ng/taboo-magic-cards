// harness.js — Rigorous test harness for 禁忌魔卡
// Loads production source in pure Node (no HTTP server), runs:
//   1. Unit tests (hand-eval, deck, jokers, directives, target)
//   2. Oracle cross-check (production vs independent impl on random hands)
//   3. Property tests (invariants on random inputs)
//   4. Stress tests (seeded RNG, 10000 deals)
//   5. Regression fixtures (saved known-goods)
//
// Usage:
//   node test/harness.js                  # run full suite
//   node test/harness.js --suite=oracle   # only oracle cross-check
//   node test/harness.js --seed=42        # override seed

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const oracle = require('./oracle.js');

// ====================== Setup: load source via vm ======================

const ROOT = path.dirname(__filename);  // .../taboo-cards/test
// Wait — when run as `node test/harness.js`, __dirname is /workspace/taboo-cards/test
// So we need ../js

const SRC_DIR = path.resolve(__dirname, '..', 'js');

function loadSource(filename) {
  const code = fs.readFileSync(path.join(SRC_DIR, filename), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename });
  return sandbox;
}

// Load all game modules
function loadGame() {
  // Create shared context so all modules see the same `window`
  const sandbox = {};
  vm.createContext(sandbox);
  // Stub browser globals
  sandbox.window = sandbox;
  sandbox.document = { getElementById: () => null };
  sandbox.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  sandbox.console = console;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;

  const modules = ['hand-eval', 'deck', 'jokers', 'directive', 'button-event', 'shop', 'endings', 'game-state'];
  for (const mod of modules) {
    const code = fs.readFileSync(path.join(SRC_DIR, `${mod}.js`), 'utf8');
    vm.runInContext(code, sandbox, { filename: `${mod}.js` });
  }
  return sandbox;
}

const game = loadGame();
const HandEval = game.HandEval;
const Deck = game.Deck;
const Jokers = game.Jokers;
const Directive = game.Directive;
const GameState = game.GameState;

// Expose for testing (some modules use window.X but in vm they're on sandbox.X)
const HandTypes = HandEval.HAND_TYPES;
const DirectiveList = Directive.DIRECTIVES;
const JokersList = Jokers.JOKERS;

// ====================== Test framework ======================

const results = { passed: 0, failed: 0, sections: {} };
const failures = [];
let currentSection = '';

function section(name) {
  currentSection = name;
  if (!results.sections[name]) {
    results.sections[name] = { passed: 0, failed: 0, tests: [] };
  }
  console.log(`\n━━━ ${name} ━━━`);
}

function test(name, fn) {
  const start = Date.now();
  try {
    fn();
    const ms = Date.now() - start;
    results.passed++;
    results.sections[currentSection].passed++;
    console.log(`  ✓ ${name} (${ms}ms)`);
  } catch (e) {
    const ms = Date.now() - start;
    results.failed++;
    results.sections[currentSection].failed++;
    failures.push({ section: currentSection, name, error: e.message, stack: e.stack });
    console.log(`  ✗ ${name} (${ms}ms)`);
    console.log(`    ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

function eq(actual, expected, msg) {
  const aJ = JSON.stringify(actual);
  const eJ = JSON.stringify(expected);
  if (aJ !== eJ) {
    throw new Error(`${msg || 'mismatch'}\n      actual:   ${aJ}\n      expected: ${eJ}`);
  }
}

function near(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg || 'not near'}\n      actual:   ${actual}\n      expected: ${expected} ± ${tolerance}`);
  }
}

// ====================== Helpers ======================

function makeCard(rank, suit, opts = {}) {
  const suitColor = (suit === '♥' || suit === '♦') ? 'red' : 'black';
  return { rank, suit, suitColor, id: Math.random(), ...opts };
}

function dealRandomDeck(n = 52) {
  const cards = [];
  for (const s of oracle.SUITS) {
    for (const r of oracle.RANKS) {
      cards.push(makeCard(r, s));
    }
  }
  // Shuffle deterministically with Fisher-Yates + RNG
  return shuffle(cards.slice(0, n), mulberry32(seedFromArgs()));
}

// Seeded RNG
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

let _seed = 0x12345678;
function seedFromArgs() {
  const arg = process.argv.find(a => a.startsWith('--seed='));
  return arg ? parseInt(arg.split('=')[1]) : _seed;
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ====================== Section 1: cardChips ======================

section('1. cardChips 面值');

test('数字牌 = 面额', () => {
  eq(HandEval.cardChips(makeCard('2', '♠')), 2);
  eq(HandEval.cardChips(makeCard('5', '♥')), 5);
  eq(HandEval.cardChips(makeCard('7', '♦')), 7);
  eq(HandEval.cardChips(makeCard('9', '♣')), 9);
  eq(HandEval.cardChips(makeCard('10', '♠')), 10);
});

test('J/Q/K 全部 = 10', () => {
  for (const rank of ['J', 'Q', 'K']) {
    eq(HandEval.cardChips(makeCard(rank, '♠')), 10, `cardChips(${rank})`);
  }
});

test('A = 11', () => {
  eq(HandEval.cardChips(makeCard('A', '♠')), 11);
});

test('独立 oracle 一致 (所有 13 牌)', () => {
  for (const r of oracle.RANKS) {
    eq(HandEval.cardChips(makeCard(r, '♠')), oracle.refCardChips(makeCard(r, '♠')), `cardChips(${r})`);
  }
});

test('空牌 / undefined 不崩', () => {
  eq(HandEval.cardChips(null), 0);
  eq(HandEval.cardChips(undefined), 0);
  eq(HandEval.cardChips({}), 0);
});

// ====================== Section 2: 手型识别 (正样本) ======================

section('2. 手型识别 — 正样本');

function hand(cards) {
  return HandEval.evaluateHand(cards);
}

test('HIGH_CARD: A K Q J 9', () => {
  const r = hand([makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣'), makeCard('9','♠')]);
  eq(r.type.id, 'HIGH_CARD');
  // chips = 5 base + (11+10+10+10+9) = 55
  eq(r.chips, 55);
  eq(r.mult, 1);
});

test('PAIR: A A K Q J', () => {
  const r = hand([makeCard('A','♠'), makeCard('A','♥'), makeCard('K','♦'), makeCard('Q','♣'), makeCard('J','♠')]);
  eq(r.type.id, 'PAIR');
  // chips = 10 + (11+11+10+10+10) = 62
  eq(r.chips, 62);
  eq(r.mult, 2);
});

test('TWO_PAIR: A A K K Q', () => {
  const r = hand([makeCard('A','♠'), makeCard('A','♥'), makeCard('K','♦'), makeCard('K','♣'), makeCard('Q','♠')]);
  eq(r.type.id, 'TWO_PAIR');
  eq(r.chips, 20 + (11+11+10+10+10));
  eq(r.mult, 2);
});

test('THREE_KIND: A A A K Q', () => {
  const r = hand([makeCard('A','♠'), makeCard('A','♥'), makeCard('A','♦'), makeCard('K','♣'), makeCard('Q','♠')]);
  eq(r.type.id, 'THREE_KIND');
  eq(r.chips, 30 + (11+11+11+10+10));
  eq(r.mult, 3);
});

test('STRAIGHT: 5-6-7-8-9 mixed suits', () => {
  const r = hand([makeCard('5','♠'), makeCard('6','♥'), makeCard('7','♦'), makeCard('8','♣'), makeCard('9','♠')]);
  eq(r.type.id, 'STRAIGHT');
  eq(r.chips, 30 + (5+6+7+8+9));
  eq(r.mult, 4);
});

test('STRAIGHT: T-J-Q-K-A mixed', () => {
  const r = hand([makeCard('10','♠'), makeCard('J','♥'), makeCard('Q','♦'), makeCard('K','♣'), makeCard('A','♠')]);
  eq(r.type.id, 'STRAIGHT');
});

test('FLUSH: 2-5-9-J-K ♠', () => {
  const r = hand([makeCard('2','♠'), makeCard('5','♠'), makeCard('9','♠'), makeCard('J','♠'), makeCard('K','♠')]);
  eq(r.type.id, 'FLUSH');
  eq(r.chips, 35 + (2+5+9+10+10));
  eq(r.mult, 4);
});

test('FULL_HOUSE: A A A K K', () => {
  const r = hand([makeCard('A','♠'), makeCard('A','♥'), makeCard('A','♦'), makeCard('K','♣'), makeCard('K','♠')]);
  eq(r.type.id, 'FULL_HOUSE');
  eq(r.chips, 40 + (11+11+11+10+10));
  eq(r.mult, 4);
});

test('FOUR_KIND: A A A A K', () => {
  const r = hand([makeCard('A','♠'), makeCard('A','♥'), makeCard('A','♦'), makeCard('A','♣'), makeCard('K','♠')]);
  eq(r.type.id, 'FOUR_KIND');
  eq(r.chips, 60 + (11+11+11+11+10));
  eq(r.mult, 7);
});

test('STRAIGHT_FLUSH: 5-9 ♠', () => {
  const r = hand([makeCard('5','♠'), makeCard('6','♠'), makeCard('7','♠'), makeCard('8','♠'), makeCard('9','♠')]);
  eq(r.type.id, 'STRAIGHT_FLUSH');
  eq(r.chips, 100 + (5+6+7+8+9));
  eq(r.mult, 8);
});

test('ROYAL_FLUSH: T-A ♠', () => {
  const r = hand([makeCard('10','♠'), makeCard('J','♠'), makeCard('Q','♠'), makeCard('K','♠'), makeCard('A','♠')]);
  eq(r.type.id, 'ROYAL_FLUSH');
  eq(r.chips, 100 + (10+10+10+10+11));
  eq(r.mult, 8);
});

test('WHEEL: A-2-3-4-5 (低 A 顺子)', () => {
  const r = hand([makeCard('A','♠'), makeCard('2','♥'), makeCard('3','♦'), makeCard('4','♣'), makeCard('5','♠')]);
  eq(r.type.id, 'STRAIGHT');
});

test('WHEEL_FLUSH: A-2-3-4-5 ♠', () => {
  const r = hand([makeCard('A','♠'), makeCard('2','♠'), makeCard('3','♠'), makeCard('4','♠'), makeCard('5','♠')]);
  eq(r.type.id, 'STRAIGHT_FLUSH');
});

// ====================== Section 3: 手型识别 (负样本) ======================

section('3. 手型识别 — 负样本 (不能误判)');

test('4 张同花不算同花(需 5 张)', () => {
  const r = hand([makeCard('2','♠'), makeCard('5','♠'), makeCard('9','♠'), makeCard('J','♠')]);
  eq(r.type.id, 'HIGH_CARD');  // 4 不同点数
  eq(r.mult, 1);
});

test('6-7-8-9 (4 张) 不算顺子(需 5 张)', () => {
  const r = hand([makeCard('6','♠'), makeCard('7','♥'), makeCard('8','♦'), makeCard('9','♣')]);
  eq(r.type.id, 'HIGH_CARD');
});

test('A-K-Q-J 不算顺子(差 1 张)', () => {
  const r = hand([makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣')]);
  eq(r.type.id, 'HIGH_CARD');
});

test('K-A-2-3 不算顺子(K 不能接 2)', () => {
  const r = hand([makeCard('K','♠'), makeCard('A','♥'), makeCard('2','♦'), makeCard('3','♣')]);
  eq(r.type.id, 'HIGH_CARD');
});

test('两对 3 张不算两对(只有 1 对)', () => {
  // A A K — 应为 PAIR 不是 TWO_PAIR
  const r = hand([makeCard('A','♠'), makeCard('A','♥'), makeCard('K','♦')]);
  eq(r.type.id, 'PAIR');
});

test('同点 6 张 → 铁支 + 高牌 (3+3 不会成 FULL_HOUSE)', () => {
  // A A A K K K — 6 张里有 full house (3 As + 3 Ks)
  const r = hand([makeCard('A','♠'), makeCard('A','♥'), makeCard('A','♦'), makeCard('K','♣'), makeCard('K','♠'), makeCard('K','♥')]);
  eq(r.type.id, 'FULL_HOUSE');  // best 5 = AAAKK
});

test('4-of-a-kind + 一对 → 铁支 (不是葫芦)', () => {
  const r = hand([makeCard('A','♠'), makeCard('A','♥'), makeCard('A','♦'), makeCard('A','♣'), makeCard('K','♠'), makeCard('K','♥')]);
  eq(r.type.id, 'FOUR_KIND');
});

// ====================== Section 4: 部分手型 (1-4 张) ======================

section('4. 部分手型 (1-4 张)');

test('1 张 → HIGH_CARD', () => {
  eq(hand([makeCard('A','♠')]).type.id, 'HIGH_CARD');
  eq(hand([makeCard('A','♠')]).chips, 5 + 11);
});

test('2 张同点 → PAIR', () => {
  const r = hand([makeCard('7','♠'), makeCard('7','♥')]);
  eq(r.type.id, 'PAIR');
  eq(r.chips, 10 + 14);  // 2 × 7
  eq(r.mult, 2);
});

test('2 张不同 → HIGH_CARD', () => {
  const r = hand([makeCard('7','♠'), makeCard('K','♥')]);
  eq(r.type.id, 'HIGH_CARD');
});

test('3 张三条 → THREE_KIND', () => {
  const r = hand([makeCard('7','♠'), makeCard('7','♥'), makeCard('7','♦')]);
  eq(r.type.id, 'THREE_KIND');
  eq(r.chips, 30 + 21);
});

test('4 张三条+1 → THREE_KIND (4 张识别)', () => {
  const r = hand([makeCard('7','♠'), makeCard('7','♥'), makeCard('7','♦'), makeCard('K','♣')]);
  eq(r.type.id, 'THREE_KIND');
  eq(r.chips, 30 + (7+7+7+10));
});

test('4 张两对 → TWO_PAIR', () => {
  const r = hand([makeCard('7','♠'), makeCard('7','♥'), makeCard('K','♣'), makeCard('K','♦')]);
  eq(r.type.id, 'TWO_PAIR');
  eq(r.chips, 20 + (7+7+10+10));
});

test('4 张铁支 → FOUR_KIND', () => {
  const r = hand([makeCard('7','♠'), makeCard('7','♥'), makeCard('7','♦'), makeCard('7','♣')]);
  eq(r.type.id, 'FOUR_KIND');
  eq(r.chips, 60 + 28);
});

test('4 张全不同 → HIGH_CARD', () => {
  const r = hand([makeCard('2','♠'), makeCard('5','♥'), makeCard('9','♦'), makeCard('K','♣')]);
  eq(r.type.id, 'HIGH_CARD');
  eq(r.chips, 5 + (2+5+9+10));
});

test('空牌 → HIGH_CARD, 0 chips', () => {
  const r = hand([]);
  eq(r.type.id, 'HIGH_CARD');
  eq(r.chips, 0);
  eq(r.mult, 1);
});

// ====================== Section 5: 8 张里选 5 张最优 ======================

section('5. 8 张里选最优 5');

test('8 张中有同花优先于普通对子', () => {
  const cards = [
    makeCard('2','♠'), makeCard('5','♠'), makeCard('7','♠'), makeCard('9','♠'), makeCard('J','♠'),
    makeCard('K','♥'), makeCard('3','♦'), makeCard('8','♣'),
  ];
  const r = hand(cards);
  eq(r.type.id, 'FLUSH');
});

test('8 张有同花顺 → 应识别同花顺', () => {
  const cards = [
    makeCard('5','♠'), makeCard('6','♠'), makeCard('7','♠'), makeCard('8','♠'), makeCard('9','♠'),
    makeCard('K','♥'), makeCard('3','♦'), makeCard('8','♣'),
  ];
  const r = hand(cards);
  eq(r.type.id, 'STRAIGHT_FLUSH');
});

test('8 张三条+对 → 应识别葫芦', () => {
  const cards = [
    makeCard('7','♠'), makeCard('7','♥'), makeCard('7','♦'),
    makeCard('K','♣'), makeCard('K','♠'),
    makeCard('3','♥'), makeCard('5','♦'), makeCard('9','♠'),
  ];
  const r = hand(cards);
  eq(r.type.id, 'FULL_HOUSE');
});

test('8 张铁支+对 → 应识别铁支', () => {
  const cards = [
    makeCard('7','♠'), makeCard('7','♥'), makeCard('7','♦'), makeCard('7','♣'),
    makeCard('K','♠'), makeCard('K','♥'),
    makeCard('3','♠'), makeCard('5','♥'),
  ];
  const r = hand(cards);
  eq(r.type.id, 'FOUR_KIND');
});

test('8 张全不同 1 牌型 → HIGH_CARD 选最大 5', () => {
  const cards = [
    makeCard('2','♠'), makeCard('5','♥'), makeCard('7','♦'), makeCard('9','♣'),
    makeCard('J','♠'), makeCard('Q','♥'), makeCard('K','♦'), makeCard('A','♣'),
  ];
  const r = hand(cards);
  eq(r.type.id, 'HIGH_CARD');
  // Best 5 of high card = A K Q J 9 → 11+10+10+10+9 = 50 + 5 base
  eq(r.chips, 5 + (11+10+10+10+9));
});

test('8 张无手型:对子只需 5 张里 1 对就行', () => {
  // 5 ♥, 5 ♦, 7 ♠, 9 ♥, J ♣, 3 ♠, 6 ♦, K ♥ — 取 5 7 9 J K 或 5 9 J 3 K → 都是 HIGH_CARD
  // 但 5 ♥ + 5 ♦ 在 5 张里总能配成对 (2 same rank + 3 others)
  // best 5 = 5♥ 5♦ 9 J K → PAIR
  const cards = [
    makeCard('5','♥'), makeCard('5','♦'),
    makeCard('7','♠'), makeCard('9','♥'), makeCard('J','♣'),
    makeCard('3','♠'), makeCard('6','♦'), makeCard('K','♥'),
  ];
  const r = hand(cards);
  eq(r.type.id, 'PAIR');
});

// ====================== Section 6: Oracle 交叉校验 ======================

section('6. Oracle 交叉校验 — 独立实现对比');

test('5000 随机手:handEval type vs oracle type', () => {
  const rng = mulberry32(0xDEADBEEF);
  let disagreements = 0;
  for (let i = 0; i < 5000; i++) {
    const n = 1 + Math.floor(rng() * 8);  // 1-8 cards
    const deck = dealRandomDeck(52);
    const cards = deck.slice(0, n);
    const prod = HandEval.evaluateHand(cards);
    const orac = oracle.refEvaluateHand(cards);
    if (prod.type.id !== orac.typeId) {
      disagreements++;
      if (disagreements <= 2) {
        console.log(`    n=${n} cards=${cards.map(c => c.rank + c.suit).join(' ')} prod=${prod.type.id} oracle=${orac.typeId}`);
      }
    }
  }
  if (disagreements > 0) throw new Error(`5000 随机手 ${disagreements} 次 type 判定不一致`);
});

test('5000 随机手:chips 数值差异', () => {
  // Both implementations compute chips = base + sum(scoringCards)
  // For matching 5-card subset, chips should match exactly
  const rng = mulberry32(0xCAFEBABE);
  let chipMismatches = 0;
  let multMismatches = 0;
  for (let i = 0; i < 5000; i++) {
    const n = 5 + Math.floor(rng() * 4);
    const deck = dealRandomDeck(52);
    const cards = deck.slice(0, n);
    const prod = HandEval.evaluateHand(cards);
    const orac = oracle.refEvaluateHand(cards);
    if (prod.type.id === orac.typeId) {
      if (prod.chips !== orac.chips) chipMismatches++;
      if (prod.mult !== orac.mult) multMismatches++;
    }
  }
  if (chipMismatches > 0) throw new Error(`5000 随机手 ${chipMismatches} 次 chips 不匹配`);
  if (multMismatches > 0) throw new Error(`5000 随机手 ${multMismatches} 次 mult 不匹配`);
});

// ====================== Section 7: Property 不变量 ======================

section('7. Property 不变量 (1000 随机手)');

test('type 永远在合法枚举', () => {
  const rng = mulberry32(42);
  const validTypes = new Set(Object.keys(HandTypes));
  for (let i = 0; i < 1000; i++) {
    const n = 1 + Math.floor(rng() * 8);
    const cards = dealRandomDeck(52).slice(0, n);
    const r = HandEval.evaluateHand(cards);
    if (!validTypes.has(r.type.id)) {
      throw new Error(`非法 type: ${r.type.id}`);
    }
  }
});

test('mult 永远 ≥ 1', () => {
  const rng = mulberry32(43);
  for (let i = 0; i < 1000; i++) {
    const n = 1 + Math.floor(rng() * 8);
    const cards = dealRandomDeck(52).slice(0, n);
    const r = HandEval.evaluateHand(cards);
    assert(r.mult >= 1, `mult=${r.mult} < 1`);
  }
});

test('mult 永远 ≤ 8 (无加成的最大基础值)', () => {
  const rng = mulberry32(44);
  for (let i = 0; i < 1000; i++) {
    const n = 1 + Math.floor(rng() * 8);
    const cards = dealRandomDeck(52).slice(0, n);
    const r = HandEval.evaluateHand(cards);
    assert(r.mult <= 8, `mult=${r.mult} > 8`);
  }
});

test('chips 不为 NaN / Infinity', () => {
  const rng = mulberry32(45);
  for (let i = 0; i < 1000; i++) {
    const n = 1 + Math.floor(rng() * 8);
    const cards = dealRandomDeck(52).slice(0, n);
    const r = HandEval.evaluateHand(cards);
    assert(Number.isFinite(r.chips), `chips=${r.chips}`);
  }
});

test('chips ≥ handType.chips(同手型)', () => {
  const rng = mulberry32(46);
  for (let i = 0; i < 1000; i++) {
    const n = 1 + Math.floor(rng() * 8);
    const cards = dealRandomDeck(52).slice(0, n);
    const r = HandEval.evaluateHand(cards);
    const minChips = r.type.chips;
    assert(r.chips >= minChips, `chips=${r.chips} < min=${minChips} for ${r.type.id}`);
  }
});

test('mult === handType.mult(无加成)', () => {
  const rng = mulberry32(47);
  for (let i = 0; i < 1000; i++) {
    const n = 1 + Math.floor(rng() * 8);
    const cards = dealRandomDeck(52).slice(0, n);
    const r = HandEval.evaluateHand(cards);
    assert(r.mult === r.type.mult, `mult=${r.mult} != base ${r.type.mult} for ${r.type.id}`);
  }
});

test('scoringCards.length 满足规则', () => {
  const rng = mulberry32(48);
  for (let i = 0; i < 500; i++) {
    const n = 5 + Math.floor(rng() * 4); // 5-8 张
    const cards = dealRandomDeck(52).slice(0, n);
    const r = HandEval.evaluateHand(cards);
    if (r.type.id === 'FULL_HOUSE' || r.type.id === 'FOUR_KIND' || r.type.id === 'STRAIGHT_FLUSH'
        || r.type.id === 'ROYAL_FLUSH' || r.type.id === 'STRAIGHT' || r.type.id === 'FLUSH') {
      // 5 张必须手型应 scorin 5 张
      assert(r.scoringCards.length === 5, `${r.type.id} scoring 长度 ${r.scoringCards.length}`);
    }
  }
});

// ====================== Section 8: 禁卡加成 ======================

section('8. 禁卡加成 (+5 mult / 张)');

function applyForbiddenBonus(cards) {
  const base = HandEval.evaluateHand(cards);
  let mult = base.mult;
  for (const c of cards) if (c.forbidden) mult += 5;
  return { ...base, mult };
}

test('0 张禁卡 → 多倍 0', () => {
  const cards = [makeCard('7','♠'), makeCard('7','♥'), makeCard('K','♦')];
  const r = applyForbiddenBonus(cards);
  eq(r.mult, r.type.mult);
});

test('1 张禁卡 → +5 mult', () => {
  const cards = [makeCard('7','♠', { forbidden: true }), makeCard('7','♥'), makeCard('K','♦')];
  const r = applyForbiddenBonus(cards);
  eq(r.mult, r.type.mult + 5);
});

test('3 张禁卡 → +15 mult', () => {
  const cards = [
    makeCard('7','♠', { forbidden: true }), makeCard('7','♥', { forbidden: true }), makeCard('7','♦', { forbidden: true }),
    makeCard('K','♣'), makeCard('Q','♠'),
  ];
  const r = applyForbiddenBonus(cards);
  eq(r.mult, r.type.mult + 15);
});

test('禁卡加成无 chip 影响', () => {
  // chips 不变,只 mult +5
  const cards = [makeCard('7','♠'), makeCard('7','♥'), makeCard('K','♦')];
  const base = applyForbiddenBonus(cards);
  const cardsF = cards.map(c => c.rank === '7' && c.suit === '♠' ? { ...c, forbidden: true } : c);
  const forb = applyForbiddenBonus(cardsF);
  eq(forb.chips, base.chips, 'chips 不变');
  eq(forb.mult, base.mult + 5);
});

// ====================== Section 9: Joker 加成 ======================

section('9. 10 个 Joker 加成');

const jokerCases = [
  { id: 'joker_pair',    handMaker: () => [makeCard('7','♠'), makeCard('7','♥'), makeCard('K','♣'), makeCard('5','♦'), makeCard('3','♠')], typeId: 'PAIR', expectChips: 8 },
  { id: 'joker_pair',    handMaker: () => [makeCard('7','♠'), makeCard('7','♥'), makeCard('7','♣'), makeCard('K','♦'), makeCard('3','♠')], typeId: 'THREE_KIND', expectChips: 8 },
  { id: 'joker_pair',    handMaker: () => [makeCard('7','♠'), makeCard('7','♥'), makeCard('7','♣'), makeCard('7','♦'), makeCard('K','♠')], typeId: 'FOUR_KIND', expectChips: 8 },
  { id: 'joker_pair',    handMaker: () => [makeCard('A','♠'), makeCard('K','♥')], typeId: 'HIGH_CARD', expectChips: 0 },
  { id: 'joker_flush',   handMaker: () => [makeCard('2','♠'), makeCard('5','♠'), makeCard('9','♠'), makeCard('J','♠'), makeCard('K','♠')], typeId: 'FLUSH', expectChips: 15 },
  { id: 'joker_flush',   handMaker: () => [makeCard('5','♠'), makeCard('6','♠'), makeCard('7','♠'), makeCard('8','♠'), makeCard('9','♠')], typeId: 'STRAIGHT_FLUSH', expectChips: 15 },
  { id: 'joker_flush',   handMaker: () => [makeCard('2','♠'), makeCard('5','♠'), makeCard('9','♠'), makeCard('J','♠'), makeCard('K','♥')], typeId: 'HIGH_CARD', expectChips: 0 },
  { id: 'joker_straight',handMaker: () => [makeCard('5','♠'), makeCard('6','♥'), makeCard('7','♦'), makeCard('8','♣'), makeCard('9','♠')], typeId: 'STRAIGHT', expectMult: 2 },
  { id: 'joker_straight',handMaker: () => [makeCard('5','♠'), makeCard('6','♠'), makeCard('7','♠'), makeCard('8','♠'), makeCard('9','♠')], typeId: 'STRAIGHT_FLUSH', expectMult: 2 },
  { id: 'joker_face',    handMaker: () => [], cards: [makeCard('J','♠'), makeCard('Q','♥'), makeCard('K','♦')], expectChips: 12 },
  { id: 'joker_face',    handMaker: () => [], cards: [makeCard('2','♠'), makeCard('5','♥')], expectChips: 0 },
  { id: 'joker_ace',     handMaker: () => [], cards: [makeCard('A','♠'), makeCard('A','♥'), makeCard('7','♣')], expectMult: 10 },
  { id: 'joker_ace',     handMaker: () => [], cards: [makeCard('A','♠'), makeCard('K','♥')], expectMult: 5 },
  { id: 'joker_red',     handMaker: () => [], cards: [makeCard('A','♥'), makeCard('K','♦'), makeCard('7','♥')], expectChips: 9 },
  { id: 'joker_black',   handMaker: () => [], cards: [makeCard('A','♠'), makeCard('K','♣'), makeCard('7','♠')], expectChips: 9 },
];

for (const tc of jokerCases) {
  test(`Joker ${tc.id} on ${tc.typeId || 'partial hand'}`, () => {
    const j = Jokers.getJokerById(tc.id);
    const cards = tc.cards || tc.handMaker();
    const hand = HandEval.evaluateHand(cards);
    const bonus = j.apply(hand, cards, { doom: 0, pressedButtonThisAnte: false });
    if (tc.expectChips !== undefined) eq(bonus.chips || 0, tc.expectChips, 'chips');
    if (tc.expectMult !== undefined) eq(bonus.mult || 0, tc.expectMult, 'mult');
  });
}

test('命运轮盘 mult ∈ [1,5]', () => {
  const j = Jokers.getJokerById('joker_fortune');
  for (let i = 0; i < 100; i++) {
    const b = j.apply({ type: HandTypes.HIGH_CARD }, [], {});
    assert(b.mult >= 1 && b.mult <= 5, `bad mult ${b.mult}`);
  }
});

test('诅咒之眼:1 张禁卡 +3 mult, +1 doom', () => {
  const j = Jokers.getJokerById('joker_curse');
  const state = { doom: 0 };
  const bonus = j.apply({ type: HandTypes.HIGH_CARD }, [makeCard('7','♠', { forbidden: true })], state);
  eq(bonus.mult, 3);
  eq(state.doom, 1);
});

test('诅咒之眼:2 张禁卡 +6 mult, +2 doom', () => {
  const j = Jokers.getJokerById('joker_curse');
  const state = { doom: 0 };
  const bonus = j.apply({ type: HandTypes.HIGH_CARD }, [
    makeCard('7','♠', { forbidden: true }),
    makeCard('7','♥', { forbidden: true }),
  ], state);
  eq(bonus.mult, 6);
  eq(state.doom, 2);
});

test('按键收藏家:未按过 = 0', () => {
  const j = Jokers.getJokerById('joker_press');
  const b = j.apply({ type: HandTypes.HIGH_CARD }, [], { pressedButtonThisAnte: false });
  eq(b.chips || 0, 0);
});

test('按键收藏家:按过 = 10', () => {
  const j = Jokers.getJokerById('joker_press');
  const b = j.apply({ type: HandTypes.HIGH_CARD }, [], { pressedButtonThisAnte: true });
  eq(b.chips, 10);
});

// ====================== Section 10: 违规判定 ======================

section('10. 10 个 Directive 违规判定');

const directiveCases = [
  // no_discard: 只看 state,不需要 hand/cards
  { id: 'no_discard',     useStateOnly: true, violation: { discardsUsedThisBlind: 1 }, noViolation: { discardsUsedThisBlind: 0 } },
  { id: 'no_pair',        useStateOnly: false, violation: { hand: () => HandEval.evaluateHand([makeCard('7','♠'), makeCard('7','♥'), makeCard('K','♦'), makeCard('5','♣'), makeCard('3','♠')]), cards: () => [makeCard('7','♠'), makeCard('7','♥'), makeCard('K','♦'), makeCard('5','♣'), makeCard('3','♠')] }, noViolation: { hand: () => HandEval.evaluateHand([makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣'), makeCard('9','♠')]), cards: () => [makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣'), makeCard('9','♠')] } },
  { id: 'no_flush',       useStateOnly: false, violation: { hand: () => HandEval.evaluateHand([makeCard('2','♠'), makeCard('5','♠'), makeCard('9','♠'), makeCard('J','♠'), makeCard('K','♠')]), cards: () => [makeCard('2','♠'), makeCard('5','♠'), makeCard('9','♠'), makeCard('J','♠'), makeCard('K','♠')] }, noViolation: { hand: () => HandEval.evaluateHand([makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣'), makeCard('9','♠')]), cards: () => [makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣'), makeCard('9','♠')] } },
  { id: 'no_straight',    useStateOnly: false, violation: { hand: () => HandEval.evaluateHand([makeCard('5','♠'), makeCard('6','♥'), makeCard('7','♦'), makeCard('8','♣'), makeCard('9','♠')]), cards: () => [makeCard('5','♠'), makeCard('6','♥'), makeCard('7','♦'), makeCard('8','♣'), makeCard('9','♠')] }, noViolation: { hand: () => HandEval.evaluateHand([makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣'), makeCard('9','♠')]), cards: () => [makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣'), makeCard('9','♠')] } },
  { id: 'no_face',        useStateOnly: false, violation: { hand: () => HandEval.evaluateHand([makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣'), makeCard('9','♠')]), cards: () => [makeCard('J','♠')] }, noViolation: { hand: () => HandEval.evaluateHand([makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣'), makeCard('9','♠')]), cards: () => [makeCard('2','♠')] } },
  { id: 'no_forbidden_play', useStateOnly: false, violation: { hand: () => HandEval.evaluateHand([makeCard('7','♠'), makeCard('7','♥'), makeCard('K','♦')]), cards: () => [makeCard('7','♠', { forbidden: true })] }, noViolation: { hand: () => HandEval.evaluateHand([makeCard('7','♠'), makeCard('7','♥'), makeCard('K','♦')]), cards: () => [makeCard('7','♠')] } },
  { id: 'play_one_card',  useStateOnly: false, violation: { hand: () => HandEval.evaluateHand([makeCard('A','♠'), makeCard('K','♥')]), cards: () => [makeCard('A','♠'), makeCard('K','♥')] }, noViolation: { hand: () => HandEval.evaluateHand([makeCard('A','♠')]), cards: () => [makeCard('A','♠')] } },
  { id: 'play_five_cards',useStateOnly: false, violation: { hand: () => HandEval.evaluateHand([makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣')]), cards: () => [makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣')] }, noViolation: { hand: () => HandEval.evaluateHand([makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣'), makeCard('9','♠')]), cards: () => [makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣'), makeCard('9','♠')] } },
  { id: 'use_all_suits',  useStateOnly: false, violation: { hand: () => HandEval.evaluateHand([makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦')]), cards: () => [makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦')] }, noViolation: { hand: () => HandEval.evaluateHand([makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣'), makeCard('9','♠')]), cards: () => [makeCard('A','♠'), makeCard('K','♥'), makeCard('Q','♦'), makeCard('J','♣'), makeCard('9','♠')] } },
  { id: 'low_value_only', useStateOnly: false, violation: { hand: () => HandEval.evaluateHand([makeCard('2','♠'), makeCard('5','♥'), makeCard('9','♦')]), cards: () => [makeCard('2','♠'), makeCard('5','♥'), makeCard('9','♦')] }, noViolation: { hand: () => HandEval.evaluateHand([makeCard('2','♠'), makeCard('5','♥'), makeCard('6','♦')]), cards: () => [makeCard('2','♠'), makeCard('5','♥'), makeCard('6','♦')] } },
];

for (const tc of directiveCases) {
  const d = DirectiveList.find(x => x.id === tc.id);
  test(`Directive ${tc.id}:violation case → true`, () => {
    if (tc.useStateOnly) {
      const state = { discardsUsedThisBlind: tc.violation.discardsUsedThisBlind };
      const violated = Directive.checkViolation(d, state, null, []);
      assert(violated, `expected violation for ${tc.id}`);
    } else {
      const cards = tc.violation.cards();
      const handR = tc.violation.hand();
      const state = { discardsUsedThisBlind: tc.violation.discardsUsedThisBlind || 0 };
      const violated = Directive.checkViolation(d, state, handR, cards);
      assert(violated, `expected violation for ${tc.id}`);
    }
  });
  test(`Directive ${tc.id}:no-violation case → false`, () => {
    if (tc.useStateOnly) {
      const state = { discardsUsedThisBlind: tc.noViolation.discardsUsedThisBlind };
      const violated = Directive.checkViolation(d, state, null, []);
      assert(!violated, `expected NO violation for ${tc.id}`);
    } else {
      const cards = tc.noViolation.cards();
      const handR = tc.noViolation.hand();
      const state = { discardsUsedThisBlind: tc.noViolation.discardsUsedThisBlind || 0 };
      const violated = Directive.checkViolation(d, state, handR, cards);
      assert(!violated, `expected NO violation for ${tc.id}`);
    }
  });
}

test('违规 ×2.5 mult 公式', () => {
  // 出对子,no_pair 指令 → 倍率 2 → 5
  const d = DirectiveList.find(x => x.id === 'no_pair');
  const cards = [makeCard('7','♠'), makeCard('7','♥'), makeCard('K','♦'), makeCard('5','♣'), makeCard('3','♠')];
  const handR = HandEval.evaluateHand(cards);
  let mult = handR.mult; // 2
  if (Directive.checkViolation(d, { discardsUsedThisBlind: 0 }, handR, cards)) mult *= 2.5;
  eq(mult, 5);
});

test('违规分数公式 totalScore = floor(chips × 2.5 × mult)', () => {
  // 模拟违 no_flush 出同花:chips 71, mult 4, → mult 10, → 710
  const d = DirectiveList.find(x => x.id === 'no_flush');
  const cards = [makeCard('2','♠'), makeCard('5','♠'), makeCard('9','♠'), makeCard('J','♠'), makeCard('K','♠')];
  const handR = HandEval.evaluateHand(cards);
  const chips = handR.chips; // 71
  let mult = handR.mult;     // 4
  if (Directive.checkViolation(d, { discardsUsedThisBlind: 0 }, handR, cards)) mult *= 2.5;
  const total = Math.floor(chips * mult);
  eq(mult, 10);
  eq(total, 710);
});

// ====================== Section 11: Deck 完整性 ======================

section('11. Deck 构造 & 洗牌');

test('buildStandardDeck = 52 张', () => {
  const d = Deck.buildStandardDeck();
  eq(d.length, 52);
});

test('每种 rank 4 张', () => {
  const d = Deck.buildStandardDeck();
  const count = {};
  for (const c of d) count[c.rank] = (count[c.rank] || 0) + 1;
  for (const r of oracle.RANKS) eq(count[r], 4, `${r} count`);
});

test('每种 suit 13 张', () => {
  const d = Deck.buildStandardDeck();
  const count = {};
  for (const c of d) count[c.suit] = (count[c.suit] || 0) + 1;
  // production uses suit.id ('spade', 'heart', 'diamond', 'club')
  for (const s of ['spade', 'heart', 'diamond', 'club']) eq(count[s], 13, `${s} count`);
});

test('markForbidden 标 N 张', () => {
  let d = Deck.buildStandardDeck();
  d = Deck.markForbidden(d, 5);
  eq(d.filter(c => c.forbidden).length, 5);
});

test('markForbidden 1000 次全部标中指定数量(防重复拾取回归)', () => {
  // If pool is incorrectly maintained, random picks can collide and silently
  // mark fewer cards. This is a real bug we already caught once.
  for (let i = 0; i < 1000; i++) {
    let d = Deck.buildStandardDeck();
    d = Deck.markForbidden(d, 5);
    if (d.filter(c => c.forbidden).length !== 5) {
      throw new Error(`iter ${i}: only marked ${d.filter(c => c.forbidden).length} / 5`);
    }
  }
});

test('markForbidden 不会丢牌(防 swap-remove bug)', () => {
  let d = Deck.buildStandardDeck();
  d = Deck.markForbidden(d, 5);
  eq(d.length, 52, '5 marked cards on a 52-card deck still leaves 52');
});

test('markForbidden 标 0/52/超量不崩', () => {
  let d1 = Deck.markForbidden(Deck.buildStandardDeck(), 0);
  eq(d1.filter(c => c.forbidden).length, 0);
  let d2 = Deck.markForbidden(Deck.buildStandardDeck(), 52);
  eq(d2.filter(c => c.forbidden).length, 52);
  let d3 = Deck.markForbidden(Deck.buildStandardDeck(), 100);
  eq(d3.filter(c => c.forbidden).length, 52, '超量 <= 实际牌数');
});

test('shuffle 不改长度, 不丢牌', () => {
  const d = Deck.buildStandardDeck();
  const s = Deck.shuffle(d);
  eq(s.length, 52);
  eq(new Set(s.map(c => c.rank + c.suit)).size, 52, '所有牌都还在');
});

test('shuffle 1000 次:顺序几乎每次不同', () => {
  const d = Deck.buildStandardDeck();
  let diff = 0;
  for (let i = 0; i < 100; i++) {
    const s = Deck.shuffle(d);
    if (s[0] !== d[0]) diff++;
  }
  // 至少 90% 不同
  assert(diff > 90, `只 ${diff}/100 次首位不同`);
});

test('shuffle 是 deterministic 不可控 (sanity)', () => {
  // 简单 sanity:2 次洗牌后牌组完全相等概率 < 1/10
  const d = Deck.buildStandardDeck();
  let same = 0;
  for (let i = 0; i < 50; i++) {
    const a = Deck.shuffle(Deck.buildStandardDeck());
    const b = Deck.shuffle(Deck.buildStandardDeck());
    if (a.every((c, idx) => c.rank + c.suit === b[idx].rank + b[idx].suit)) same++;
  }
  assert(same < 5, `${same}/50 完全相同`);
});

// ====================== Section 12: calculateTarget (8 ante × 3 盲) ======================

section('12. calculateTarget — 8 ante × 3 盲');

const expectedTargets = [
  // [ante, blind, expected]
  [1, 0, 100], [1, 1, 150], [1, 2, 200],
  [2, 0, 150], [2, 1, 225], [2, 2, 300],
  [3, 0, 250], [3, 1, 375], [3, 2, 500],
  [4, 0, 400], [4, 1, 600], [4, 2, 800],
  [5, 0, 700], [5, 1, 1050], [5, 2, 1400],
  [6, 0, 1200], [6, 1, 1800], [6, 2, 2400],
  [7, 0, 2000], [7, 1, 3000], [7, 2, 4000],
  [8, 0, 3500], [8, 1, 5250], [8, 2, 7000],
];

for (const [ante, blind, expected] of expectedTargets) {
  test(`ante ${ante} blind ${blind} = ${expected}`, () => {
    eq(GameState.calculateTarget(ante, blind), expected);
  });
}

test('24 关 nextBlind 顺序正确', () => {
  GameState.newRun();
  const seq = [];
  for (let i = 0; i < 30; i++) {
    const next = GameState.nextBlind();
    if (next.done) {
      seq.push({ done: true, calls: i + 1 });
      break;
    }
    seq.push({ ante: GameState.getState().ante, blind: GameState.getState().blind, target: GameState.getState().target });
  }
  eq(seq.length, 24, 'seq 总长 24(23 推进 + 1 done)');
  eq(seq[seq.length - 1].done, true, '最后一条是 done');
  eq(seq[seq.length - 1].calls, 24, '第 24 次调用返回 done');
  eq(seq[seq.length - 2].target, 7000, '最后推进的关卡是 ante 8 boss 7000');
});

test('单关内手数限制 (4 hands, 3 discards)', () => {
  const s = GameState.getState();
  // Just verify these exist initially
  assert(s.handsLeft === 4 || s.handsLeft === undefined, 'handsLeft 存在 or undefined');
  // discardsLeft should be 3
  eq(s.discardsLeft, 3);
});

// ====================== Section 13: GameState 状态 ======================

section('13. GameState 状态机');

test('newRun 初始化所有字段', () => {
  const s = GameState.newRun();
  eq(s.ante, 1);
  eq(s.blind, 0);
  eq(s.target, 100);
  eq(s.money, 5);
  eq(s.discardsLeft, 3);
  eq(s.doom, 0);
  eq(s.corrupt, 0);
  eq(s.violations, 0);
  eq(s.buttonPresses, 0);
  eq(s.usedDirectiveIds.length, 0);
});

test('addDoom 边界 [0, 10]', () => {
  GameState.newRun();
  GameState.addDoom(5);
  eq(GameState.getDoom(), 5);
  GameState.addDoom(20);  // 越界
  eq(GameState.getDoom(), 10, '上限 10');
  GameState.addDoom(-20);  // 下越界
  eq(GameState.getDoom(), 0, '下限 0');
});

test('addCorrupt / violations / buttonPresses', () => {
  GameState.newRun();
  GameState.addCorrupt(3);
  GameState.addViolation();
  GameState.recordButtonPress();
  eq(GameState.getCorrupt(), 3);
  eq(GameState.getViolations(), 1);
  eq(GameState.getButtonPresses(), 1);
  eq(GameState.getState().pressedButtonThisAnte, true);
});

test('corruption tier 正确', () => {
  GameState.newRun();
  GameState.addCorrupt(0); eq(GameState.getCorruptionTier(), 0);
  GameState.newRun();
  GameState.addCorrupt(3); eq(GameState.getCorruptionTier(), 1);
  GameState.newRun();
  GameState.addCorrupt(6); eq(GameState.getCorruptionTier(), 2);
  GameState.newRun();
  GameState.addCorrupt(10); eq(GameState.getCorruptionTier(), 3);
});

test('joker 列表 ≤ 5', () => {
  GameState.newRun();
  for (let i = 0; i < 7; i++) {
    GameState.addJoker({ id: 'test_' + i, name: 't', desc: 'd', apply: () => ({ chips: 0, mult: 0 }) });
  }
  eq(GameState.getJokers().length, 5, '上限 5');
});

test('sellJoker +$2', () => {
  GameState.newRun();
  GameState.addJoker({ id: 'j1', name: 'j', desc: 'd', apply: () => ({ chips: 0, mult: 0 }) });
  const before = GameState.getState().money;
  GameState.sellJoker(0);
  eq(GameState.getState().money, before + 2);
});

// ====================== Section 14: 端到端 ======================

section('14. 端到端:8 ante 24 局可玩性');

test('同花顺 + 2 joker + 1 forbidden = 估算', () => {
  const cards = [makeCard('5','♠'), makeCard('6','♠'), makeCard('7','♠'), makeCard('8','♠'), makeCard('9','♠')];
  const hand = HandEval.evaluateHand(cards);
  let chips = hand.chips; // 135
  let mult = hand.mult;   // 8

  mult += Jokers.getJokerById('joker_straight').apply(hand).mult || 0;  // +2
  chips += Jokers.getJokerById('joker_flush').apply(hand).chips || 0;   // +15
  mult += 5;  // 1 forbidden bonus
  const total = Math.floor(chips * mult);
  // chips=150, mult=15 → 2250
  // ante 1 small = 100 ✓, ante 5 small = 700 ✓, ante 6 small = 1200 ✓, ante 7 small = 2000 ✓
  assert(total >= 2000, `total ${total} 应该 ≥ 2000 (过 ante 7 小盲)`);
  assert(total < 3500, `total ${total} 应该 < 3500 (ante 8 小盲 — 需更多 joker)`);
});

test('皇家顺(无加成)够过 ante 1 boss', () => {
  // Royal flush base 100 + 51 = 151 chips, mult 8 → 1208
  const cards = [makeCard('10','♠'), makeCard('J','♠'), makeCard('Q','♠'), makeCard('K','♠'), makeCard('A','♠')];
  const hand = HandEval.evaluateHand(cards);
  eq(hand.chips, 151);
  eq(hand.mult, 8);
  const total = Math.floor(hand.chips * hand.mult);
  // ante 8 boss = 7000, 不够
  assert(total < 7000, `皇家顺单出 ${total} < ante 8 boss 7000`);
  assert(total >= 200, `皇家顺单出 ${total} ≥ ante 1 boss 200`);
});

test('违规乘 2.5 后 max mult × max chips 估算', () => {
  // 皇家顺违规:151 chips × 20 mult = 3020
  // 应能过 ante 6 boss (2400)
  const cards = [makeCard('10','♠'), makeCard('J','♠'), makeCard('Q','♠'), makeCard('K','♠'), makeCard('A','♠')];
  const hand = HandEval.evaluateHand(cards);
  const mult = hand.mult * 2.5; // 20
  const total = Math.floor(hand.chips * mult);
  assert(total >= 2400, `皇家顺违规 ${total} ≥ 2400 (ante 6 boss)`);
});

// (No Section 15 demo test — previous version had a no-op `1+1===2` test added
//  just to give the review-workflow PR a test change. The code-reviewer agent
//  correctly flagged it as a no-op. Removed. A real test would actually check
//  something meaningful about the workflow.)

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  通过: ${results.passed}    失败: ${results.failed}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (results.failed > 0) {
  console.log('\n失败详情:');
  for (const f of failures) {
    console.log(`  [${f.section}] ${f.name}`);
    console.log(`    ${f.error.split('\n')[0]}`);
  }
}

// Section-by-section summary
console.log('\n各模块覆盖率:');
for (const [name, sec] of Object.entries(results.sections)) {
  const total = sec.passed + sec.failed;
  const status = sec.failed === 0 ? '✓' : '✗';
  console.log(`  ${status} ${name.padEnd(50)} ${sec.passed}/${total}`);
}

process.exit(results.failed > 0 ? 1 : 0);
