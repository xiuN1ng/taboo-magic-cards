// ui.js — UI rendering + anime.js driven animations
// All visual effects go through here. CSS provides only the base layout.

const UI = (() => {
  const HAND_AREA = document.getElementById('hand-area');
  const HUD_ANTE = document.getElementById('hud-ante');
  const HUD_BLIND = document.getElementById('hud-blind');
  const HUD_SCORE = document.getElementById('hud-score');
  const HUD_DOOM = document.getElementById('hud-doom');
  const HUD_MONEY = document.getElementById('hud-money');
  const DIRECTIVE_TEXT = document.getElementById('directive-text');
  const SELECTED_COUNT = document.getElementById('selected-count');
  const DISCARDS_LEFT = document.getElementById('discards-left');
  const HAND_TYPE_NAME = document.getElementById('hand-type-name');
  const VOICE_OVERLAY = document.getElementById('voice-overlay');
  const VOICE_TEXT = document.getElementById('voice-text');
  const JOKER_BAR = document.getElementById('joker-bar');
  const TARGET_VALUE = document.getElementById('target-value');
  const TARGET_CURRENT = document.getElementById('target-current');
  const TARGET_NEEDED = document.getElementById('target-needed');
  const TARGET_BAR_FILL = document.getElementById('target-bar-fill');
  const DOOM_WRAP = document.getElementById('hud-doom-wrap');
  const DOOM_TOOLTIP = document.getElementById('doom-tooltip');
  const SF_HAND_NUM = document.getElementById('sf-hand-num');
  const SF_CARDS_NUM = document.getElementById('sf-cards-num');
  const SF_CHIPS_NUM = document.getElementById('sf-chips-num');
  const SF_MULT_NUM = document.getElementById('sf-mult-num');
  const SF_FINAL_NUM = document.getElementById('sf-final-num');
  const SF_PIECE_HAND = document.querySelector('.sf-piece.sf-hand');
  const SF_PIECE_CARDS = document.querySelector('.sf-piece.sf-cards');
  const SF_PIECE_CHIPS = document.querySelector('.sf-piece.sf-chips');
  const SF_PIECE_MULT = document.querySelector('.sf-piece.sf-mult');
  const SF_PIECE_FINAL = document.querySelector('.sf-piece.sf-final');

  let selectedCardIds = new Set();
  let _onPlay = null;
  let _onDiscard = null;
  let _onSort = null;
  let _voiceTimeout = null;
  let _onJokerSlotClick = null;
  let _onReplaceTargetClick = null;
  let _jokerMode = 'play';  // 'play' | 'shop' | 'replace'

  // ========== Card rendering ==========

  function renderHand(cards) {
    HAND_AREA.innerHTML = '';
    selectedCardIds.clear();
    updateSelectionInfo(cards, 0);

    const frag = document.createDocumentFragment();
    cards.forEach((card, i) => {
      const el = createCardElement(card);
      frag.appendChild(el);
    });
    HAND_AREA.appendChild(frag);

    // Deal animation: stagger from top with slight rotation
    anime({
      targets: HAND_AREA.querySelectorAll('.card'),
      translateY: [-200, 0],
      rotateZ: [(i) => (Math.random() - 0.5) * 20, 0],
      opacity: [0, 1],
      scale: [0.6, 1],
      delay: anime.stagger(60, { from: 'first' }),
      duration: 600,
      easing: 'easeOutElastic(1, .7)',
    });
  }

  function createCardElement(card) {
    const el = document.createElement('div');
    el.className = 'card' + (card.forbidden ? ' forbidden' : '');
    el.dataset.cardId = card.id;

    el.innerHTML = `
      <div class="card-corner">
        <div class="card-rank">${card.rank}</div>
        <div>${card.suitName}</div>
      </div>
      <div class="card-suit">${card.suitName}</div>
      <div class="card-corner card-bottom">
        <div class="card-rank">${card.rank}</div>
        <div>${card.suitName}</div>
      </div>
      ${card.forbidden ? '<div class="card-forbidden-tag">禁</div>' : ''}
    `;

    el.addEventListener('click', () => onCardClick(card, el));
    return el;
  }

  function onCardClick(card, el) {
    if (selectedCardIds.has(card.id)) {
      selectedCardIds.delete(card.id);
      el.classList.remove('selected');
      anime.remove(el);
      anime({
        targets: el,
        translateY: [anime.get(el, 'translateY')[0] || -16, 0],
        scale: [1.05, 1],
        duration: 250,
        easing: 'easeOutQuad',
      });
    } else {
      selectedCardIds.add(card.id);
      el.classList.add('selected');
      anime({
        targets: el,
        translateY: [0, -16],
        scale: [1, 1.05],
        duration: 250,
        easing: 'easeOutBack',
      });
    }
    updateSelectionInfoFromDOM();
  }

  function updateSelectionInfoFromDOM() {
    const cards = getCurrentHandCards();
    updateSelectionInfo(cards, selectedCardIds.size);
  }

  function getCurrentHandCards() {
    // Pull from game state
    return GameState.getHand();
  }

  function getSelectedCards() {
    const hand = getCurrentHandCards();
    return hand.filter(c => selectedCardIds.has(c.id));
  }

  function clearSelection() {
    selectedCardIds.clear();
    HAND_AREA.querySelectorAll('.card.selected').forEach(el => {
      el.classList.remove('selected');
    });
  }

  function updateSelectionInfo(handCards, count) {
    SELECTED_COUNT.textContent = count;
    DISCARDS_LEFT.textContent = GameState.getDiscardsLeft();
    if (count === 0) {
      HAND_TYPE_NAME.textContent = '—';
      updateScoreFormula(null, [], 0, 0);
      updateTargetProgress(GameState.getState().target, 0);
      return;
    }
    const selected = handCards.filter(c => selectedCardIds.has(c.id));
    const result = HandEval.evaluateHand(selected);
    HAND_TYPE_NAME.textContent = result.type.name;

    // Calculate breakdown
    let forbBonus = 0;
    for (const c of selected) if (c.forbidden) forbBonus += 5;
    let jokerChips = 0, jokerMult = 0;
    const jokers = GameState.getJokers();
    for (const j of jokers) {
      const bonus = j.apply(result, selected, GameState);
      jokerChips += bonus.chips || 0;
      jokerMult += bonus.mult || 0;
    }
    const handChips = result.chips;
    const cardChips = selected.reduce((s, c) => s + HandEval.cardChips(c), 0);
    const totalChips = handChips + jokerChips;
    const totalMult = result.mult + forbBonus + jokerMult;
    const finalScore = Math.floor(totalChips * totalMult);

    updateScoreFormula(result, selected, finalScore, totalChips, totalMult, cardChips, jokerChips, jokerMult, forbBonus);
    // Update target progress with predicted score so player sees "if I play now, I'd get X"
    updateTargetProgress(GameState.getState().target, finalScore);
  }

  function updateScoreFormula(handResult, selectedCards, finalScore, totalChips, totalMult, cardChips, jokerChips, jokerMult, forbBonus) {
    if (!handResult || selectedCards.length === 0) {
      SF_HAND_NUM.textContent = '0';
      SF_CARDS_NUM.textContent = '0';
      SF_CHIPS_NUM.textContent = '0';
      SF_MULT_NUM.textContent = '0';
      SF_FINAL_NUM.textContent = '0';
      return;
    }
    const handBase = handResult.chips - cardChips;
    SF_HAND_NUM.textContent = handBase;
    SF_CARDS_NUM.textContent = cardChips + jokerChips;
    SF_CHIPS_NUM.textContent = totalChips;
    SF_MULT_NUM.textContent = totalMult.toFixed(1);
    SF_FINAL_NUM.textContent = finalScore.toLocaleString();

    // Bump animations on changed pieces
    [SF_PIECE_HAND, SF_PIECE_CARDS, SF_PIECE_CHIPS, SF_PIECE_MULT, SF_PIECE_FINAL].forEach(p => {
      if (!p) return;
      p.classList.remove('bump');
      void p.offsetWidth;
      p.classList.add('bump');
    });
  }

  // Keep legacy computeTotalScore for backward compat (used by handlePlay)
  function computeTotalScore(handResult, selectedCards) {
    let chips = handResult.chips;
    let mult = handResult.mult;
    for (const c of selectedCards) {
      if (c.forbidden) mult += 5;
    }
    const jokers = GameState.getJokers();
    for (const j of jokers) {
      const bonus = j.apply(handResult, selectedCards, GameState);
      chips += bonus.chips || 0;
      mult += bonus.mult || 0;
    }
    return Math.floor(chips * mult);
  }

  // ========== Target Progress (过关目标) ==========
  function updateTargetProgress(target, current) {
    TARGET_VALUE.textContent = target.toLocaleString();
    TARGET_CURRENT.textContent = Math.floor(current).toLocaleString();
    const needed = Math.max(0, target - Math.floor(current));
    TARGET_NEEDED.textContent = needed.toLocaleString();
    const pct = Math.min(100, (current / target) * 100);
    TARGET_BAR_FILL.style.width = pct + '%';
    if (current >= target) {
      TARGET_BAR_FILL.classList.add('met');
    } else {
      TARGET_BAR_FILL.classList.remove('met');
    }
  }

  // ========== Doom Tooltip (厄运说明) ==========
  function setupDoomTooltip() {
    if (DOOM_WRAP) {
      DOOM_WRAP.addEventListener('click', (e) => {
        e.stopPropagation();
        DOOM_TOOLTIP.classList.toggle('active');
      });
      // Close when clicking elsewhere
      document.addEventListener('click', () => {
        DOOM_TOOLTIP.classList.remove('active');
      });
      // Prevent tooltip clicks from closing
      if (DOOM_TOOLTIP) {
        DOOM_TOOLTIP.addEventListener('click', (e) => e.stopPropagation());
      }
    }
  }

  // ========== Hand actions ==========

  function setHandlers({ onPlay, onDiscard, onSort }) {
    _onPlay = onPlay;
    _onDiscard = onDiscard;
    _onSort = onSort;
  }

  document.getElementById('btn-play').addEventListener('click', () => {
    if (!_onPlay) return;
    const selected = getSelectedCards();
    if (selected.length === 0) {
      flashError('请先选牌');
      return;
    }
    _onPlay(selected);
  });

  document.getElementById('btn-discard').addEventListener('click', () => {
    if (!_onDiscard) return;
    const selected = getSelectedCards();
    _onDiscard(selected);
  });

  document.getElementById('btn-hand-types').addEventListener('click', () => {
    UI.showHandTypesPopup();
  });

  document.getElementById('btn-htp-close').addEventListener('click', () => {
    UI.hideHandTypesPopup();
  });

  document.getElementById('btn-sort').addEventListener('click', () => {
    if (!_onSort) return;
    _onSort();
  });

  function flashError(msg) {
    const t = anime.timeline();
    t.add({
      targets: HAND_AREA,
      translateX: [-8, 8, -6, 6, -3, 3, 0],
      duration: 400,
      easing: 'easeInOutQuad',
    });
    showToast(msg, 'error');
  }

  // ========== HUD updates ==========

  function updateHUD(state) {
    HUD_ANTE.textContent = state.ante;
    HUD_BLIND.textContent = state.blind + 1;
    DIRECTIVE_TEXT.textContent = state.directive ? state.directive.text : '—';

    // Animate number changes
    animateNumber(HUD_DOOM, state.doom);
    animateNumber(HUD_MONEY, state.money);
  }

  function animateScoreDisplay(value) {
    const obj = { v: 0 };
    anime({
      targets: obj,
      v: value,
      round: 1,
      duration: 800,
      easing: 'easeOutCubic',
      update: () => {
        HUD_SCORE.textContent = obj.v.toLocaleString();
      },
    });
  }

  function animateNumber(el, target) {
    const current = parseInt(el.textContent.replace(/,/g, '')) || 0;
    if (current === target) return;
    const obj = { v: current };
    anime({
      targets: obj,
      v: target,
      round: 1,
      duration: 500,
      easing: 'easeOutQuad',
      update: () => {
        el.textContent = obj.v.toString();
      },
    });
  }

  function updateDiscards(n) {
    DISCARDS_LEFT.textContent = n;
  }

  // ========== Card play / discard animation ==========

  function animatePlayCards(cardIds) {
    return new Promise((resolve) => {
      const els = HAND_AREA.querySelectorAll('.card');
      const targets = [];
      els.forEach(el => {
        if (cardIds.includes(parseInt(el.dataset.cardId))) {
          targets.push(el);
        }
      });
      if (targets.length === 0) { resolve(); return; }

      anime.timeline()
        .add({
          targets,
          scale: [1, 1.2],
          duration: 200,
          easing: 'easeOutQuad',
        })
        .add({
          targets,
          translateY: -200,
          opacity: 0,
          rotateZ: (el) => (Math.random() - 0.5) * 30,
          duration: 500,
          easing: 'easeInCubic',
          complete: () => {
            targets.forEach(el => el.remove());
            resolve();
          },
        });
    });
  }

  function animateDiscardCards(cardIds) {
    return new Promise((resolve) => {
      const els = HAND_AREA.querySelectorAll('.card');
      const targets = [];
      els.forEach(el => {
        if (cardIds.includes(parseInt(el.dataset.cardId))) {
          targets.push(el);
        }
      });
      if (targets.length === 0) { resolve(); return; }

      anime.timeline()
        .add({
          targets,
          rotateZ: (el) => (Math.random() - 0.5) * 60,
          duration: 300,
          easing: 'easeInQuad',
        })
        .add({
          targets,
          translateY: 200,
          opacity: 0,
          scale: 0.3,
          duration: 400,
          easing: 'easeInBack',
          complete: () => {
            targets.forEach(el => el.remove());
            resolve();
          },
        });
    });
  }

  function animateDrawCards(newCards) {
    return new Promise((resolve) => {
      const frag = document.createDocumentFragment();
      newCards.forEach(card => {
        frag.appendChild(createCardElement(card));
      });
      HAND_AREA.appendChild(frag);

      const newEls = HAND_AREA.querySelectorAll('.card:not([data-animated])');
      anime({
        targets: HAND_AREA.querySelectorAll('.card'),
        translateY: [-200, 0],
        rotateZ: [(i) => (Math.random() - 0.5) * 20, 0],
        opacity: [0, 1],
        scale: [0.6, 1],
        delay: anime.stagger(60),
        duration: 600,
        easing: 'easeOutElastic(1, .7)',
        complete: () => resolve(),
      });
    });
  }

  // ========== Result overlay ==========

  function showResult({ title, detail, success, onNext }) {
    const overlay = document.getElementById('result-overlay');
    const titleEl = document.getElementById('result-title');
    const detailEl = document.getElementById('result-detail');
    const nextBtn = document.getElementById('btn-next');

    titleEl.textContent = title;
    titleEl.className = success === true ? 'success' : (success === false ? 'fail' : '');
    detailEl.textContent = detail;

    overlay.classList.add('active');

    const tl = anime.timeline();
    tl.add({
      targets: overlay.querySelector('.result-box'),
      scale: [0.5, 1.1],
      opacity: [0, 1],
      duration: 400,
      easing: 'easeOutBack',
    });
    tl.add({
      targets: titleEl,
      translateY: [20, 0],
      opacity: [0, 1],
      duration: 300,
      easing: 'easeOutQuad',
    }, '-=200');
    tl.add({
      targets: detailEl,
      translateY: [20, 0],
      opacity: [0, 1],
      duration: 300,
      easing: 'easeOutQuad',
    }, '-=200');
    tl.add({
      targets: nextBtn,
      translateY: [20, 0],
      opacity: [0, 1],
      duration: 300,
      easing: 'easeOutQuad',
    }, '-=200');

    const handler = () => {
      nextBtn.removeEventListener('click', handler);
      hideResult().then(() => onNext && onNext());
    };
    nextBtn.addEventListener('click', handler);
  }

  function hideResult() {
    return new Promise((resolve) => {
      const overlay = document.getElementById('result-overlay');
      anime({
        targets: overlay.querySelector('.result-box'),
        scale: [1, 0.5],
        opacity: [1, 0],
        duration: 200,
        easing: 'easeInQuad',
        complete: () => {
          overlay.classList.remove('active');
          resolve();
        },
      });
    });
  }

  // ========== Shop ==========

  function showShop({ items, money, onBuy, onLeave }) {
    const overlay = document.getElementById('shop-overlay');
    const itemsEl = document.getElementById('shop-items');
    const moneyEl = document.getElementById('shop-money');
    const leaveBtn = document.getElementById('btn-shop-leave');

    moneyEl.textContent = money;
    itemsEl.innerHTML = '';

    items.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'shop-item';
      el.dataset.idx = idx;
      el.innerHTML = `
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.desc}</div>
        <div class="shop-item-price">$ ${item.price}</div>
      `;
      el.addEventListener('click', () => {
        if (el.classList.contains('sold')) return;
        onBuy(idx, el);
      });
      itemsEl.appendChild(el);
    });

    overlay.classList.add('active');
    anime.timeline()
      .add({
        targets: overlay.querySelector('.shop-frame'),
        scale: [0.7, 1],
        opacity: [0, 1],
        duration: 400,
        easing: 'easeOutBack',
      })
      .add({
        targets: '.shop-item',
        translateY: [20, 0],
        opacity: [0, 1],
        delay: anime.stagger(50),
        duration: 300,
        easing: 'easeOutQuad',
      }, '-=200');

    leaveBtn.onclick = () => {
      onLeave();
    };
  }

  function updateShopMoney(money) {
    const moneyEl = document.getElementById('shop-money');
    anime({
      targets: moneyEl,
      scale: [1.3, 1],
      duration: 300,
      easing: 'easeOutBack',
      update: () => {
        moneyEl.textContent = Math.floor(money);
      },
    });
  }

  function markShopItemSold(idx) {
    const el = document.querySelector(`.shop-item[data-idx="${idx}"]`);
    if (!el) return;
    el.classList.add('sold');
    anime({
      targets: el,
      opacity: [1, 0.3],
      scale: [1, 0.95],
      duration: 300,
      easing: 'easeOutQuad',
    });
  }

  function hideShop() {
    return new Promise((resolve) => {
      const overlay = document.getElementById('shop-overlay');
      anime({
        targets: overlay.querySelector('.shop-frame'),
        scale: [1, 0.7],
        opacity: [1, 0],
        duration: 300,
        easing: 'easeInBack',
        complete: () => {
          overlay.classList.remove('active');
          resolve();
        },
      });
    });
  }

  // ========== Screen transitions ==========

  function showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    const target = document.getElementById(screenId);
    if (!target) return;

    // Hide others
    screens.forEach(s => {
      if (s !== target) s.classList.remove('active');
    });

    target.classList.add('active');
    anime({
      targets: target,
      opacity: [0, 1],
      duration: 400,
      easing: 'easeOutQuad',
    });
  }

  // ========== End screen ==========

  function showEndScreen({ title, subtitle, description, stats, onRestart, onTitle }) {
    document.getElementById('end-title').textContent = title;
    document.getElementById('end-subtitle').textContent = subtitle;
    document.getElementById('end-description').textContent = description;
    document.getElementById('end-ante').textContent = stats.ante;
    if (stats.blind !== undefined) {
      const eb = document.getElementById('end-blind');
      if (eb) eb.textContent = stats.blind + 1;
    }
    document.getElementById('end-doom').textContent = stats.doomPeak;
    document.getElementById('end-violations').textContent = stats.violations;

    showScreen('screen-end');

    const tl = anime.timeline();
    tl.add({
      targets: '#screen-end .end-frame',
      scale: [0.6, 1],
      opacity: [0, 1],
      duration: 600,
      easing: 'easeOutBack',
    });
    tl.add({
      targets: '#end-title',
      translateY: [40, 0],
      opacity: [0, 1],
      duration: 500,
      easing: 'easeOutQuad',
    }, '-=300');
    tl.add({
      targets: '#end-subtitle',
      translateY: [20, 0],
      opacity: [0, 1],
      duration: 400,
      easing: 'easeOutQuad',
    }, '-=300');
    tl.add({
      targets: '#end-description',
      translateY: [20, 0],
      opacity: [0, 1],
      duration: 400,
      easing: 'easeOutQuad',
    }, '-=200');
    tl.add({
      targets: '.end-stats div',
      translateX: [-20, 0],
      opacity: [0, 1],
      delay: anime.stagger(50),
      duration: 300,
      easing: 'easeOutQuad',
    }, '-=200');
    tl.add({
      targets: '#screen-end button',
      translateY: [20, 0],
      opacity: [0, 1],
      delay: anime.stagger(100),
      duration: 300,
      easing: 'easeOutQuad',
    }, '-=200');

    document.getElementById('btn-restart').onclick = onRestart;
    document.getElementById('btn-back-title-2').onclick = onTitle;
  }

  // ========== Toast ==========

  function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    t.style.cssText = `
      position: fixed; top: 30px; left: 50%; transform: translateX(-50%);
      padding: 12px 24px; background: ${type === 'error' ? 'var(--blood)' : 'var(--candy-purple)'};
      color: white; border-radius: 8px; font-size: 16px; font-weight: 700;
      z-index: 1000; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      letter-spacing: 2px;
    `;
    document.body.appendChild(t);
    anime.timeline()
      .add({
        targets: t,
        translateY: [-40, 0],
        opacity: [0, 1],
        duration: 300,
        easing: 'easeOutBack',
      })
      .add({
        targets: t,
        opacity: [1, 0],
        translateY: [0, -20],
        duration: 300,
        easing: 'easeInQuad',
        delay: 1500,
        complete: () => t.remove(),
      });
  }

  // ========== Doom warning flash ==========

  function doomFlash() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; background: var(--blood); z-index: 99;
      pointer-events: none;
    `;
    document.body.appendChild(overlay);
    anime({
      targets: overlay,
      opacity: [0, 0.5, 0],
      duration: 600,
      easing: 'easeOutQuad',
      complete: () => overlay.remove(),
    });
  }

  function shakeHand() {
    anime({
      targets: HAND_AREA,
      translateX: [-6, 6, -4, 4, 0],
      duration: 400,
      easing: 'easeInOutQuad',
    });
  }

  // ========== Title screen animation ==========

  function animateTitleEntrance() {
    anime.timeline()
      .add({
        targets: '.game-title',
        translateY: [40, 0],
        opacity: [0, 1],
        duration: 800,
        easing: 'easeOutBack',
      })
      .add({
        targets: '.subtitle',
        translateY: [20, 0],
        opacity: [0, 1],
        duration: 500,
        easing: 'easeOutQuad',
      }, '-=400')
      .add({
        targets: '.tagline',
        translateY: [20, 0],
        opacity: [0, 1],
        duration: 500,
        easing: 'easeOutQuad',
      }, '-=300')
      .add({
        targets: '.title-buttons button',
        translateY: [20, 0],
        opacity: [0, 1],
        delay: anime.stagger(100),
        duration: 400,
        easing: 'easeOutQuad',
      }, '-=200');
  }

  function animateRulesEntrance() {
    anime.timeline()
      .add({
        targets: '#screen-rules .rules-frame',
        scale: [0.7, 1],
        opacity: [0, 1],
        duration: 500,
        easing: 'easeOutBack',
      })
      .add({
        targets: '#screen-rules li',
        translateX: [-30, 0],
        opacity: [0, 1],
        delay: anime.stagger(50),
        duration: 300,
        easing: 'easeOutQuad',
      }, '-=200');
  }

  // ========== Joker Bar (Joker 预览条) ==========

  function renderJokerBar(jokers, mode = 'play') {
    _jokerMode = mode;
    JOKER_BAR.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const slot = document.createElement('div');
      const j = jokers[i];
      if (j) {
        slot.className = 'joker-slot filled';
        slot.dataset.slotIdx = i;
        const effectText = j.desc.length > 14 ? j.desc.slice(0, 14) + '…' : j.desc;
        slot.innerHTML = `
          <div class="js-name">${j.name}</div>
          <div class="js-effect">${effectText}</div>
        `;
        slot.addEventListener('click', () => {
          if (_onJokerSlotClick) _onJokerSlotClick(i, j, mode);
        });
      } else {
        slot.className = 'joker-slot empty';
        slot.innerHTML = '<span>+</span>';
      }
      JOKER_BAR.appendChild(slot);
    }
    // Entrance animation
    anime({
      targets: '.joker-slot',
      scale: [0.8, 1],
      opacity: [0, 1],
      delay: anime.stagger(60),
      duration: 400,
      easing: 'easeOutBack',
    });
  }

  function setJokerBarReplaceMode(active) {
    const slots = JOKER_BAR.querySelectorAll('.joker-slot.filled');
    slots.forEach(s => {
      if (active) s.classList.add('replace-target');
      else s.classList.remove('replace-target');
    });
  }

  function setJokerSlotHandler(handler) {
    _onJokerSlotClick = handler;
  }

  // ========== Joker Detail Modal ==========

  function showJokerDetail(joker, mode = 'view') {
    const overlay = document.getElementById('joker-detail');
    const nameEl = document.getElementById('jd-name');
    const descEl = document.getElementById('jd-desc');
    const sellBtn = document.getElementById('jd-sell');
    const closeBtn = document.getElementById('jd-close');

    nameEl.textContent = joker.name;
    descEl.textContent = joker.desc;

    overlay.classList.remove('sell-mode', 'replace-mode');
    if (mode === 'sell') overlay.classList.add('sell-mode');
    if (mode === 'replace') overlay.classList.add('replace-mode');

    overlay.classList.add('active');
    anime({
      targets: overlay.querySelector('.joker-detail-box'),
      scale: [0.7, 1],
      opacity: [0, 1],
      duration: 400,
      easing: 'easeOutBack',
    });

    sellBtn.onclick = null;
    closeBtn.onclick = () => hideJokerDetail();

    return {
      onSell: (cb) => { sellBtn.onclick = cb; },
      onClose: (cb) => { closeBtn.onclick = cb; },
    };
  }

  function hideJokerDetail() {
    const overlay = document.getElementById('joker-detail');
    return new Promise((resolve) => {
      anime({
        targets: overlay.querySelector('.joker-detail-box'),
        scale: [1, 0.7],
        opacity: [1, 0],
        duration: 200,
        easing: 'easeInQuad',
        complete: () => {
          overlay.classList.remove('active');
          overlay.classList.remove('sell-mode', 'replace-mode');
          resolve();
        },
      });
    });
  }

  // ========== Replace Prompt Modal ==========

  function showReplacePrompt(jokers, onPick, onCancel) {
    const overlay = document.getElementById('replace-prompt');
    const targets = document.getElementById('replace-targets');

    targets.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const j = jokers[i];
      const el = document.createElement('div');
      el.className = 'replace-target';
      if (j) {
        const effectText = j.desc.length > 14 ? j.desc.slice(0, 14) + '…' : j.desc;
        el.innerHTML = `
          <div class="js-name">${j.name}</div>
          <div class="js-effect">${effectText}</div>
        `;
        el.addEventListener('click', () => {
          hideReplacePrompt().then(() => onPick(i));
        });
      } else {
        el.innerHTML = '<span>+</span>';
        el.style.opacity = '0.3';
        el.style.cursor = 'not-allowed';
      }
      targets.appendChild(el);
    }

    overlay.classList.add('active');
    anime({
      targets: overlay.querySelector('.replace-frame'),
      scale: [0.7, 1],
      opacity: [0, 1],
      duration: 400,
      easing: 'easeOutBack',
    });

    document.getElementById('btn-replace-cancel').onclick = () => {
      hideReplacePrompt().then(() => onCancel && onCancel());
    };
  }

  function hideReplacePrompt() {
    return new Promise((resolve) => {
      const overlay = document.getElementById('replace-prompt');
      anime({
        targets: overlay.querySelector('.replace-frame'),
        scale: [1, 0.7],
        opacity: [1, 0],
        duration: 200,
        easing: 'easeInQuad',
        complete: () => {
          overlay.classList.remove('active');
          resolve();
        },
      });
    });
  }

  function setShopJokersHint(active, text = '') {
    const el = document.getElementById('shop-jokers-hint');
    if (active) {
      el.textContent = text || '💡 Joker 位已满 · 点击下方 Joker 可替换,或点击自己的 Joker 出售';
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }

  // ========== Hand Types Popup (牌型大全) ==========

  function showHandTypesPopup() {
    const overlay = document.getElementById('hand-types-popup');
    const list = document.getElementById('htp-list');
    list.innerHTML = '';

    const order = [
      'HIGH_CARD', 'PAIR', 'TWO_PAIR', 'THREE_KIND', 'STRAIGHT',
      'FLUSH', 'FULL_HOUSE', 'FOUR_KIND', 'STRAIGHT_FLUSH', 'ROYAL_FLUSH',
    ];
    const rare = ['FOUR_KIND', 'STRAIGHT_FLUSH', 'ROYAL_FLUSH'];

    for (const id of order) {
      const h = HandEval.HAND_TYPES[id];
      const item = document.createElement('div');
      item.className = 'htp-item' + (rare.includes(id) ? ' htp-rare' : '');
      item.innerHTML = `
        <div class="htp-name">${h.name}</div>
        <div class="htp-desc">${h.desc}</div>
        <div class="htp-stats">${h.chips} <span class="htp-mult">× ${h.mult}</span><div class="htp-ex">例: ${h.ex}</div></div>
      `;
      list.appendChild(item);
    }

    overlay.classList.add('active');
    anime({
      targets: overlay.querySelector('.htp-frame'),
      scale: [0.7, 1],
      opacity: [0, 1],
      duration: 400,
      easing: 'easeOutBack',
    });
    // Stagger in items
    anime({
      targets: '.htp-item',
      translateX: [-30, 0],
      opacity: [0, 1],
      delay: anime.stagger(40, { start: 200 }),
      duration: 300,
      easing: 'easeOutQuad',
    });
  }

  function hideHandTypesPopup() {
    return new Promise((resolve) => {
      const overlay = document.getElementById('hand-types-popup');
      anime({
        targets: overlay.querySelector('.htp-frame'),
        scale: [1, 0.7],
        opacity: [1, 0],
        duration: 200,
        easing: 'easeInQuad',
        complete: () => {
          overlay.classList.remove('active');
          resolve();
        },
      });
    });
  }

  // ========== Simple Render (no animation, optional preserve selection) ==========

  function renderHandSimple(cards, preserveSelectedIds = null) {
    HAND_AREA.innerHTML = '';
    if (preserveSelectedIds instanceof Set) {
      selectedCardIds = new Set(preserveSelectedIds);
    } else {
      selectedCardIds.clear();
    }
    cards.forEach(card => {
      const el = createCardElement(card);
      if (selectedCardIds.has(card.id)) {
        el.classList.add('selected');
      }
      HAND_AREA.appendChild(el);
    });
    updateSelectionInfo(cards, selectedCardIds.size);
  }

  // ========== Voice (那个声音) ==========

  function speakVoice(text, type = 'ominous') {
    if (_voiceTimeout) {
      clearTimeout(_voiceTimeout);
      _voiceTimeout = null;
    }
    VOICE_TEXT.textContent = text;
    VOICE_OVERLAY.style.opacity = '0';
    anime.remove(VOICE_OVERLAY);

    const styles = {
      ominous: { color: 'var(--blood-glow)', glow: 'var(--blood)' },
      smug:    { color: 'var(--candy-pink)',  glow: 'var(--candy-purple)' },
      warning: { color: 'var(--candy-yellow)', glow: 'var(--candy-yellow)' },
      pleased: { color: 'var(--candy-mint)',   glow: 'var(--candy-mint)' },
    };
    const s = styles[type] || styles.ominous;
    VOICE_TEXT.style.color = s.color;
    VOICE_TEXT.style.textShadow = `0 0 8px ${s.glow}`;

    anime.timeline()
      .add({
        targets: VOICE_OVERLAY,
        opacity: [0, 1],
        translateY: [12, 0],
        duration: 400,
        easing: 'easeOutQuad',
      })
      .add({
        targets: VOICE_TEXT,
        letterSpacing: ['8px', '4px'],
        duration: 400,
        easing: 'easeOutQuad',
      }, 0);

    _voiceTimeout = setTimeout(() => {
      anime({
        targets: VOICE_OVERLAY,
        opacity: [1, 0],
        translateY: [0, -8],
        duration: 600,
        easing: 'easeInQuad',
      });
    }, 2400);
  }

  // Setup doom tooltip on load (DOM is ready)
  setupDoomTooltip();

  return {
    renderHand,
    clearSelection,
    getSelectedCards,
    setHandlers,
    updateHUD,
    updateDiscards,
    animateScoreDisplay,
    animatePlayCards,
    animateDiscardCards,
    animateDrawCards,
    showResult,
    showShop,
    markShopItemSold,
    updateShopMoney,
    hideShop,
    showScreen,
    showEndScreen,
    showToast,
    doomFlash,
    shakeHand,
    animateTitleEntrance,
    animateRulesEntrance,
    speakVoice,
    renderJokerBar,
    setJokerBarReplaceMode,
    setJokerSlotHandler,
    showJokerDetail,
    hideJokerDetail,
    showReplacePrompt,
    hideReplacePrompt,
    setShopJokersHint,
    updateScoreFormula,
    updateTargetProgress,
    setupDoomTooltip,
    showHandTypesPopup,
    hideHandTypesPopup,
    renderHandSimple,
  };
})();
