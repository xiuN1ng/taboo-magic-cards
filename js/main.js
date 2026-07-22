// main.js — Game orchestrator
// Wires GameState, UI, and all sub-systems together

(function main() {
  // ========== Boot ==========
  UI.setHandlers({
    onPlay: handlePlay,
    onDiscard: handleDiscard,
    onSort: handleSort,
  });
  UI.setJokerSlotHandler(handleJokerSlotClick);

  // ========== Voice Lines ==========
  const VOICE = {
    // Forbidden card played
    forbiddenPlay: [
      '红色。你喜欢红色。',
      '你明知故犯。',
      '那张牌在看着你。',
      '你开始上瘾了。',
      '你闻到了吗?甜味。',
    ],
    // Directive violation
    violation: [
      '你做了。',
      '为什么?',
      '没人逼你。',
      '你享受这个。',
      '你听见了吗?',
      '借口。',
    ],
    // Doom thresholds (now 厄运 in UI but kept as doom internally)
    doomLow:    '你开始注意到了吗?',  // 厄运 3
    doomMid:    '空气变得粘稠了。',  // 厄运 6
    doomHigh:   '回不去了。',  // 厄运 9
    // Blind complete
    blindCompleteClean: [
      '你赢了这一关。',
      '下一关呢?',
    ],
    blindCompleteTainted: [
      '赢了。但你变了。',
      '代价开始了。',
    ],
    // Loss / end
    lost: '你输了。',
  };

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Track last spoken line to avoid repetition
  let _lastSpokenKey = null;
  let _currentJokerMode = 'play';  // 'play' | 'shop'
  function voiceOnce(key, line, type) {
    if (_lastSpokenKey === key) return;
    _lastSpokenKey = key;
    UI.speakVoice(line, type);
  }

  let _lastDoomTier = 0;
  function checkDoomVoices(doom) {
    if (doom >= 9 && _lastDoomTier < 3) {
      voiceOnce('doom9', VOICE.doomHigh, 'warning');
      _lastDoomTier = 3;
    } else if (doom >= 6 && _lastDoomTier < 2) {
      voiceOnce('doom6', VOICE.doomMid, 'ominous');
      _lastDoomTier = 2;
    } else if (doom >= 3 && _lastDoomTier < 1) {
      voiceOnce('doom3', VOICE.doomLow, 'ominous');
      _lastDoomTier = 1;
    }
  }

  // ========== Joker UI ==========
  function handleJokerSlotClick(idx, joker, mode) {
    if (mode === 'shop') {
      // Show sell modal
      const handlers = UI.showJokerDetail(joker, 'sell');
      handlers.onSell(() => {
        const result = Shop.sellJoker(GameState.getState(), idx);
        if (result.ok) {
          UI.hideJokerDetail();
          UI.renderJokerBar(GameState.getState().jokers, 'shop');
          UI.updateShopMoney(GameState.getState().money);
          UI.updateHUD(GameState.getState());
          UI.showToast(result.msg, 'info');
        }
      });
    } else {
      // Just view in play mode
      UI.showJokerDetail(joker, 'view');
    }
  }

  // Title screen
  UI.showScreen('screen-title');
  UI.animateTitleEntrance();

  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-rules').addEventListener('click', () => {
    UI.showScreen('screen-rules');
    UI.animateRulesEntrance();
  });
  document.getElementById('btn-back-title').addEventListener('click', () => {
    UI.showScreen('screen-title');
    UI.animateTitleEntrance();
  });

  // ========== Start a new run ==========
  function startGame() {
    const state = GameState.newRun();

    // Pick first directive
    state.directive = Directive.pickDirective(state.usedDirectiveIds);
    state.usedDirectiveIds.push(state.directive.id);

    // Start at small blind (blind 0)
    state.target = GameState.calculateTarget(state.ante, state.blind);

    // Reset voice trackers
    _lastDoomTier = 0;
    _lastSpokenKey = null;

    // Draw opening hand
    state.hand = GameState.drawHand();

    // Switch to game screen
    UI.showScreen('screen-game');
    UI.renderJokerBar(state.jokers, 'play');

    // Animate HUD in
    anime.timeline()
      .add({
        targets: '.hud',
        translateY: [-50, 0],
        opacity: [0, 1],
        duration: 500,
        easing: 'easeOutQuad',
      })
      .add({
        targets: '.action-area',
        translateY: [50, 0],
        opacity: [0, 1],
        duration: 500,
        easing: 'easeOutQuad',
      }, '-=300')
      .add({
        targets: '.joker-bar',
        translateY: [-30, 0],
        opacity: [0, 1],
        duration: 500,
        easing: 'easeOutQuad',
      }, '-=400');

    // Update HUD
    UI.updateHUD(state);
    UI.updateDiscards(state.discardsLeft);
    UI.updateTargetProgress(state.target, 0);

    // Render hand
    setTimeout(() => {
      UI.renderHand(state.hand);
    }, 300);
  }

  // ========== Hand actions ==========
  function handlePlay(selected) {
    const state = GameState.getState();

    // Evaluate
    const handResult = HandEval.evaluateHand(selected);
    let chips = handResult.chips;
    let mult = handResult.mult;

    // Forbidden cards bonus
    let forbiddenCount = 0;
    for (const c of selected) {
      if (c.forbidden) {
        mult += 5;
        GameState.addDoom(1);
        forbiddenCount += 1;
      }
    }

    // Apply jokers
    for (const j of state.jokers) {
      const bonus = j.apply(handResult, selected, state);
      chips += bonus.chips || 0;
      mult += bonus.mult || 0;
    }

    // Check directive violation
    let violated = false;
    let violationMsg = '';
    if (state.directive) {
      violated = Directive.checkViolation(state.directive, state, handResult, selected);
      if (violated) {
        mult *= 2.5;
        GameState.addViolation();
        violationMsg = state.directive.violationHint + ' · 分数 ×2.5';
      }
    }

    const totalScore = Math.floor(chips * mult);

    // Update target progress with current score
    UI.updateTargetProgress(state.target, totalScore);

    // Voice: forbidden card (if any)
    if (forbiddenCount > 0) {
      voiceOnce('forb_' + state.hand.length, pick(VOICE.forbiddenPlay), 'ominous');
    }

    // Voice: violation
    if (violated) {
      // Schedule violation voice after forbidden voice if both
      setTimeout(() => voiceOnce('vio_' + state.violations, pick(VOICE.violation), 'smug'), 800);
    }

    // Doom threshold voice
    checkDoomVoices(state.doom);

    // Play cards (animation)
    const cardIds = selected.map(c => c.id);
    UI.animatePlayCards(cardIds).then(() => {
      // Update state
      GameState.playCards(cardIds);
      GameState.refillHand();
      GameState.reshufflePlayedIntoDeck();

      // Check if won
      const won = totalScore >= state.target;

      // Update HUD + joker bar (jokers may have applied doom changes)
      UI.updateHUD(state);
      UI.renderJokerBar(state.jokers, _currentJokerMode);

      // Animate score display
      UI.animateScoreDisplay(totalScore);

      // Doom visual feedback
      if (forbiddenCount > 0) {
        setTimeout(() => UI.doomFlash(), 200);
      }

      // Show result after animation
      setTimeout(() => {
        const detail = `${handResult.type.name} · 筹码 ${chips} · 倍率 ${mult.toFixed(1)} · 得分 ${totalScore.toLocaleString()}` +
                       (violated ? `\n⚠️ ${violationMsg}` : '') +
                       (forbiddenCount > 0 ? `\n🩸 出了 ${forbiddenCount} 张禁卡 · 厄运 +${forbiddenCount}` : '');

        if (won) {
          // Win this blind
          state.phase = 'between';
          UI.showResult({
            title: '过 关',
            detail: detail + `\n\n目标 ${state.target.toLocaleString()} · 实际 ${totalScore.toLocaleString()}`,
            success: true,
            onNext: () => onBlindComplete(),
          });
        } else {
          // Lose the whole run (for MVP, losing = game over)
          state.phase = 'end';
          voiceOnce('lost', VOICE.lost, 'warning');
          UI.showResult({
            title: '失 败',
            detail: detail + `\n\n目标 ${state.target.toLocaleString()} · 实际 ${totalScore.toLocaleString()}`,
            success: false,
            onNext: () => endRun(),
          });
        }
      }, 600);
    });
  }

  function handleDiscard(selected) {
    // NEW BEHAVIOR: discard UNSELECTED cards (the unselected ones are thrown away,
    // selected ones are KEPT — no shuffle animation on kept cards).
    const state = GameState.getState();
    if (state.discardsLeft <= 0) {
      UI.showToast('弃牌次数用完', 'error');
      UI.shakeHand();
      return;
    }

    const hand = state.hand;
    const selectedIds = new Set(selected.map(c => c.id));
    const toDiscard = hand.filter(c => !selectedIds.has(c.id));
    const toKeep = hand.filter(c => selectedIds.has(c.id));

    if (toDiscard.length === 0) {
      UI.showToast('未选中 0 张牌,不消耗弃牌次数', 'error');
      UI.shakeHand();
      return;
    }
    if (selected.length === 0) {
      UI.showToast('选些要保留的牌再弃牌(否则会弃掉全部)', 'error');
      UI.shakeHand();
      return;
    }

    // Update state
    state.hand = toKeep;
    state.discarded.push(...toDiscard);
    state.discardsLeft -= 1;
    state.discardsUsedThisBlind += 1;

    // Refill from deck (no animation)
    const need = 8 - state.hand.length;
    if (need > 0 && state.deck.length > 0) {
      const drawn = state.deck.splice(0, need);
      state.hand.push(...drawn);
    }

    // Re-render: keep the kept cards highlighted (no entry animation for them)
    UI.renderHandSimple(state.hand, selectedIds);
    UI.updateDiscards(state.discardsLeft);
    UI.updateTargetProgress(state.target, 0);  // reset predicted
    UI.showToast(`保留 ${toKeep.length} 张 · 弃掉 ${toDiscard.length} 张`, 'info');
  }

  function handleSort() {
    const state = GameState.getState();
    state.hand.sort((a, b) => {
      if (a.forbidden !== b.forbidden) return a.forbidden ? -1 : 1;
      if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
      return HandEval.RANK_VALUE[a.rank] - HandEval.RANK_VALUE[b.rank];
    });
    UI.renderHand(state.hand);
  }

  // ========== After blind ==========
  function onBlindComplete() {
    const state = GameState.getState();

    // Voice: blind complete
    const tainted = state.violations > 0;
    setTimeout(() => {
      voiceOnce(
        'blind_' + state.blind,
        tainted ? pick(VOICE.blindCompleteTainted) : pick(VOICE.blindCompleteClean),
        tainted ? 'smug' : 'pleased'
      );
    }, 1200);

    // 1. Shop (only between blinds, not after ante 8 boss)
    afterBlindFlow();
  }

  function afterBlindFlow() {
    const state = GameState.getState();

    if (state.ante < 8 || state.blind < 2) {
      state.phase = 'shop';
      _currentJokerMode = 'shop';
      const offers = Shop.buildShopOffers(state);
      UI.showShop({
        items: offers,
        money: state.money,
        onBuy: (idx, el) => {
          const offer = offers[idx];
          // Special handling for joker when slots full
          if (offer.kind === 'joker' && !GameState.canAddJoker()) {
            // Show replace prompt
            UI.showReplacePrompt(
              GameState.getJokers(),
              (replaceIdx) => {
                const result = Shop.applyShopOffer(state, offer, { replaceIdx });
                if (result.ok) {
                  UI.markShopItemSold(idx);
                  UI.updateShopMoney(state.money);
                  UI.updateHUD(state);
                  UI.renderJokerBar(state.jokers, 'shop');
                  UI.setShopJokersHint(false);
                  UI.showToast(result.msg, 'info');
                }
              },
              () => {
                // Cancelled
              }
            );
            return;
          }
          const result = Shop.applyShopOffer(state, offer);
          if (result.ok) {
            UI.markShopItemSold(idx);
            UI.updateShopMoney(state.money);
            UI.updateHUD(state);
            UI.renderJokerBar(state.jokers, 'shop');
            UI.showToast(result.msg, 'info');
          } else {
            UI.showToast(result.reason, 'error');
            UI.shakeHand();
          }
        },
        onLeave: () => {
          _currentJokerMode = 'play';
          UI.setShopJokersHint(false);
          UI.renderJokerBar(state.jokers, 'play');
          UI.hideShop().then(() => advanceToNextBlind());
        },
      });
      // Render joker bar in shop mode so player can sell jokers
      UI.renderJokerBar(state.jokers, 'shop');
      // If joker slots full, show hint
      if (state.jokers.length >= 5) {
        UI.setShopJokersHint(true, '⚠️ Joker 位已满 · 点击下方 Joker 可替换,或点击自己 Joker 出售 +$2');
      }
    } else {
      // After last blind, end the run
      state.phase = 'end';
      endRun();
    }
  }

  function advanceToNextBlind() {
    const state = GameState.getState();
    const next = GameState.nextBlind();

    if (next.done) {
      state.phase = 'win';
      endRun();
      return;
    }

    // Refill hand for new blind
    GameState.reshufflePlayedIntoDeck();
    state.hand = GameState.drawHand();

    state.phase = 'play';
    UI.updateHUD(state);
    UI.updateDiscards(state.discardsLeft);
    UI.renderHand(state.hand);
  }

  // ========== End of run ==========
  function endRun() {
    const state = GameState.getState();
    const ending = Endings.determineEnding(state);
    UI.showEndScreen({
      title: ending.title,
      subtitle: ending.subtitle,
      description: ending.description,
      stats: {
        ante: state.ante,
        blind: state.blind,
        doomPeak: state.doomPeak,
        violations: state.violations,
      },
      onRestart: startGame,
      onTitle: () => {
        UI.showScreen('screen-title');
        UI.animateTitleEntrance();
      },
    });
  }
})();
