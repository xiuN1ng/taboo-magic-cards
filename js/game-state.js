// game-state.js — Single source of truth for game state
// All game logic reads/writes through this module

const GameState = (() => {
  let state = null;

  function newRun() {
    // Build deck: 52 standard + mark 5 forbidden
    let deck = Deck.buildStandardDeck();
    deck = Deck.markForbidden(deck, 5);
    deck = Deck.shuffle(deck);

    state = {
      // Run progress
      ante: 1,             // 关 1-8 (8 antes total)
      blind: 0,            // 0=small, 1=big, 2=boss (3 blinds per ante)
      phase: 'play',       // 'play' | 'between' | 'shop' | 'button' | 'result' | 'end'
      target: 100,         // Score target for current blind

      // Resources
      money: 5,
      discardsLeft: 3,
      discardsUsedThisBlind: 0,

      // Deck state
      deck: deck,
      hand: [],
      played: [],
      discarded: [],

      // Theme state
      directive: null,           // Current forbidden directive
      usedDirectiveIds: [],      // Track which directives have been used
      doom: 0,                   // 0-10
      corrupt: 0,                // 戒断值
      violations: 0,             // Number of times player violated directive
      buttonPresses: 0,          // Number of times player pressed button
      pressedButtonThisAnte: false, // Used by joker
      doomPeak: 0,               // Highest doom reached this run

      // Jokers
      jokers: [],                // Up to 5 jokers

      // Score tracking
      currentHandScore: 0,

      // Ante 2 progression (for MVP, 1 ante = 3 blinds)
      // We'll just bump target each blind
    };
    return state;
  }

  function getState() { return state; }

  // === Hand management ===
  function getHand() { return state.hand; }

  function getDeck() { return state.deck; }

  function drawHand() {
    // Draw 8 cards
    state.hand = state.deck.splice(0, 8);
    return state.hand;
  }

  function playCards(cardIds) {
    const idSet = new Set(cardIds);
    const played = state.hand.filter(c => idSet.has(c.id));
    state.hand = state.hand.filter(c => !idSet.has(c.id));
    state.played.push(...played);
    return played;
  }

  function discardCards(cardIds) {
    const idSet = new Set(cardIds);
    const discarded = state.hand.filter(c => idSet.has(c.id));
    state.hand = state.hand.filter(c => !idSet.has(c.id));
    state.discarded.push(...discarded);
    state.discardsLeft -= 1;
    state.discardsUsedThisBlind += 1;
    return discarded;
  }

  function refillHand() {
    const need = 8 - state.hand.length;
    if (need <= 0) return;
    const drawn = state.deck.splice(0, need);
    state.hand.push(...drawn);
  }

  function reshufflePlayedIntoDeck() {
    if (state.played.length > 0) {
      state.deck = state.deck.concat(state.played);
      state.deck = Deck.shuffle(state.deck);
      state.played = [];
    }
  }

  // === Blind progression ===
  // 8 antes × 3 blinds = 24 levels total
  // Each ante: small(×1) → big(×1.5) → boss(×2)
  function nextBlind() {
    state.blind += 1;
    state.discardsLeft = 3;
    state.discardsUsedThisBlind = 0;
    state.pressedButtonThisAnte = false;

    if (state.blind >= 3) {
      // End of this ante — advance to next ante
      state.blind = 0;
      state.ante += 1;
    }

    // Run complete after ante 8 boss
    if (state.ante > 8) {
      return { done: true };
    }

    // Pick new directive (resets when all 10 used)
    if (state.usedDirectiveIds.length >= 10) {
      state.usedDirectiveIds = [];
    }
    state.directive = Directive.pickDirective(state.usedDirectiveIds);
    state.usedDirectiveIds.push(state.directive.id);

    // Calculate new target
    state.target = calculateTarget(state.ante, state.blind);
    return { done: false };
  }

  function calculateTarget(ante, blind) {
    // 8 antes, target grows ~1.5-2× per ante so late game needs strong jokers
    // Ante 1: 100 / 150 / 200
    // Ante 2: 150 / 225 / 300
    // Ante 3: 250 / 375 / 500
    // Ante 4: 400 / 600 / 800
    // Ante 5: 700 / 1050 / 1400
    // Ante 6: 1200 / 1800 / 2400
    // Ante 7: 2000 / 3000 / 4000
    // Ante 8: 3500 / 5250 / 7000 (final boss)
    const base = 100;
    const anteMultipliers = [1, 1.5, 2.5, 4, 7, 12, 20, 35];
    const blindMultipliers = [1, 1.5, 2];
    return Math.floor(base * anteMultipliers[ante - 1] * blindMultipliers[blind]);
  }

  function isWin(score) {
    return score >= state.target;
  }

  // === Jokers ===
  function getJokers() { return state.jokers; }
  function addJoker(j) {
    if (state.jokers.length >= 5) return false;
    state.jokers.push(j);
    return true;
  }
  function removeJoker(idx) {
    return state.jokers.splice(idx, 1)[0];
  }
  function replaceJoker(idx, newJoker) {
    if (idx < 0 || idx >= state.jokers.length) return false;
    state.jokers[idx] = newJoker;
    return true;
  }
  function sellJoker(idx) {
    if (idx < 0 || idx >= state.jokers.length) return null;
    const sold = state.jokers.splice(idx, 1)[0];
    state.money += 2;
    return sold;
  }
  function canAddJoker() {
    return state.jokers.length < 5;
  }

  // === Discards ===
  function getDiscardsLeft() { return state.discardsLeft; }

  // === Doom & Corrupt ===
  function addDoom(n) {
    state.doom = Math.min(10, Math.max(0, state.doom + n));
    if (state.doom > state.doomPeak) state.doomPeak = state.doom;
  }

  function addCorrupt(n) { state.corrupt += n; }
  function addViolation() { state.violations += 1; }
  function recordButtonPress() {
    state.buttonPresses += 1;
    state.pressedButtonThisAnte = true;
  }

  // Apply Doom threshold effects
  function applyDoomEffects() {
    // 0-2: nothing
    // 3-5: -1 discard per blind
    if (state.doom >= 3) {
      // Reduce discards (call when starting blind)
    }
    // 6-8: each hand, mark a random card forbidden on draw
    // 9-10: heavy penalties
  }

  function getDoom() { return state.doom; }
  function getCorrupt() { return state.corrupt; }
  function getViolations() { return state.violations; }
  function getButtonPresses() { return state.buttonPresses; }
  function getDoomPeak() { return state.doomPeak; }

  // Returns 0/1/2/3 based on 戒断值 (corruption) — drives visual tier
  // 0-2: clean · 3-5: mild · 6-8: medium · 9+: severe
  function getCorruptionTier() {
    const c = state.corrupt;
    if (c >= 9) return 3;
    if (c >= 6) return 2;
    if (c >= 3) return 1;
    return 0;
  }

  return {
    newRun,
    getState,
    getHand,
    getDeck,
    drawHand,
    playCards,
    discardCards,
    refillHand,
    reshufflePlayedIntoDeck,
    nextBlind,
    calculateTarget,
    isWin,
    getJokers,
    addJoker,
    removeJoker,
    replaceJoker,
    sellJoker,
    canAddJoker,
    getDiscardsLeft,
    addDoom,
    addCorrupt,
    addViolation,
    recordButtonPress,
    applyDoomEffects,
    getDoom,
    getCorrupt,
    getViolations,
    getButtonPresses,
    getDoomPeak,
    getCorruptionTier,
  };
})();

window.GameState = GameState;
