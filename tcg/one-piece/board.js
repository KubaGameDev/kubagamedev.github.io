"use strict";
// OPTCG visual playtest board controller

const API_BASE = (() => {
  const fallback = `${location.protocol}//${location.hostname || "127.0.0.1"}:8001`;
  try {
    const stored = localStorage.getItem("jumpkat.optcg.backendUrl.v1")
      || localStorage.getItem("optcg_backend_url")
      || "";
    const pageHost = location.hostname;
    const pageIsRemote = pageHost && !["127.0.0.1", "localhost", "::1"].includes(pageHost);
    let storedHost = "";
    try {
      storedHost = stored ? new URL(stored).hostname : "";
    } catch {
      storedHost = "";
    }
    const storedIsFrontend = /:8000\b/.test(stored);
    const storedIsLocalhost = ["127.0.0.1", "localhost", "::1"].includes(storedHost);
    if (!stored || storedIsFrontend || (pageIsRemote && storedIsLocalhost)) return fallback;
    return stored.replace(/\/$/, "");
  } catch {
    return fallback;
  }
})();
const params = new URLSearchParams(location.search);
const gameId = params.get("game_id");
const mode = params.get("mode") || "player-vs-cpu";
let isCpuVsCpu = mode === "cpu-vs-cpu";
let viewer = isCpuVsCpu ? "spectator" : "player";
let state = null;
let actionInFlight = false;
let gizmoState = null; // {fromEl, fromCard, fromType, fromIndex}

/* ============================================================
   ABILITY RESOLUTION SYSTEM
   ============================================================ */
window.abilityState = {
  mode: 'idle',
  sourceCard: null,
  abilityType: null,
  pendingAction: null,
  validTargets: [],
  selectedTargets: [],
  selectedAmount: null,
  selectedRevealIndices: [],
  chainQueue: [],
  toastTimer: null,
  blockerUsedThisTurn: new Set(),
};

function closeCardModal() {
  const existing = document.querySelector('.card-modal');
  if (existing) existing.remove();
}

function findCardElement(zone, index) {
  // Map backend zone descriptors to DOM data-zone values
  let selector = '';
  if (zone === 'leader' || zone === 'player-leader') selector = '[data-zone="player-leader"]';
  else if (zone === 'opponent-leader') selector = '[data-zone="opponent-leader"]';
  else if (zone === 'character' || zone === 'player-char') selector = `[data-zone="player-char-${index}"]`;
  else if (zone === 'opponent-char') selector = `[data-zone="opponent-char-${index}"]`;
  else if (zone.startsWith('player-char-') || zone.startsWith('opponent-char-') || zone === 'player-leader' || zone === 'opponent-leader') {
    selector = `[data-zone="${zone}"]`;
  }
  if (selector) {
    const slot = document.querySelector(selector);
    if (slot) return slot.querySelector('.card-wrapper');
  }
  // Fallback by data-slot
  const slot2 = document.querySelector(`[data-slot="${zone}"]`);
  if (slot2) return slot2.querySelector('.card-wrapper');
  return null;
}

function showAbilityToast(ability) {
  const toasts = document.querySelectorAll('.ability-toast');
  if (toasts.length >= 3) toasts[0].remove();

  const toast = document.createElement('div');
  toast.className = 'ability-toast';
  const imgSrc = ability.card_code ? getImageUrl({ card_code: ability.card_code, image_url: '' }) : '';
  const typeLabel = ability.type ? ability.type.replace(/_/g, ' ').toUpperCase() : 'ABILITY';
  toast.innerHTML = `
    <img class="toast-art" src="${escapeHtml(imgSrc)}" alt="" onerror="this.style.display='none'"/>
    <div class="toast-body">
      <span class="toast-title">${escapeHtml(`[${typeLabel}] — ${ability.card_name}`)}</span>
      <span class="toast-text">${escapeHtml(ability.teaching_copy || ability.rule_text || '')}</span>
      <div class="toast-actions">
        <button class="btn danger toast-abort">Abort</button>
      </div>
    </div>
  `;

  const timer = setTimeout(() => toast.remove(), 2500);
  toast.addEventListener('click', (ev) => {
    if (ev.target.classList.contains('toast-abort')) {
      ev.stopPropagation();
      abilityState.mode = 'idle';
      abilityState.pendingAction = null;
      sendAbilityAbort(ability.ability_id);
    }
    clearTimeout(timer);
    toast.remove();
  });
  document.body.appendChild(toast);
}

function hideAbilityAmountChooser() {
  const existing = document.querySelector('.ability-amount-modal');
  if (existing) existing.remove();
  document.body.classList.remove('ability-choosing-amount');
}

function showAbilityAmountChooser(ability) {
  const choice = ability.amount_choice || {};
  const min = Number(choice.min ?? 1);
  const max = Math.max(min, Number(choice.max ?? 1));
  let selected = Math.min(max, Math.max(min, Number(choice.default ?? max)));
  abilityState.mode = 'amount_select';
  abilityState.pendingAction = ability;
  abilityState.selectedAmount = selected;
  document.body.classList.add('ability-choosing-amount');

  const modal = document.createElement('div');
  modal.className = 'ability-amount-modal';
  modal.innerHTML = `
    <div class="ability-modal-backdrop"></div>
    <div class="ability-amount-panel">
      <h3 class="ability-modal-title">${escapeHtml(choice.label || 'Choose amount')}</h3>
      <p class="ability-modal-effect">${escapeHtml(ability.rule_text || '')}</p>
      <div class="amount-stepper" aria-label="Choose amount">
        <button class="btn amount-minus" type="button">−</button>
        <strong class="amount-value">${selected}</strong>
        <button class="btn amount-plus" type="button">+</button>
      </div>
      <div class="ability-modal-actions">
        <button class="btn primary amount-next" type="button">Choose Target</button>
        <button class="btn amount-abort" type="button">Abort Ability</button>
      </div>
    </div>
  `;
  const valueEl = modal.querySelector('.amount-value');
  const sync = () => { valueEl.textContent = String(selected); abilityState.selectedAmount = selected; };
  modal.querySelector('.amount-minus').addEventListener('click', () => { selected = Math.max(min, selected - 1); sync(); });
  modal.querySelector('.amount-plus').addEventListener('click', () => { selected = Math.min(max, selected + 1); sync(); });
  modal.querySelector('.amount-abort').addEventListener('click', () => {
    hideAbilityAmountChooser();
    abilityState.mode = 'idle';
    abilityState.pendingAction = null;
    sendAbilityAbort(ability.ability_id);
  });
  modal.querySelector('.amount-next').addEventListener('click', () => {
    hideAbilityAmountChooser();
    enterTargetSelect({
      card_code: ability.card_code,
      card_name: ability.card_name,
      source: ability.source,
      index: ability.source_index,
      abilityType: ability.type,
      ruleText: ability.rule_text
    }, ability.valid_targets || []);
  });
  document.body.appendChild(modal);
}

function showAbilityDecision(ability) {
  closeCardModal();
  document.body.classList.add('ability-modal-open');
  abilityState.mode = 'decision';
  abilityState.pendingAction = ability;

  const modal = document.createElement('div');
  modal.className = 'ability-decision-modal';
  const imgSrc = ability.card_code ? getImageUrl({ card_code: ability.card_code, image_url: '' }) : '';
  const typeLabel = ability.type ? ability.type.replace(/_/g, ' ').toUpperCase() : 'ABILITY';

  modal.innerHTML = `
    <div class="ability-modal-backdrop"></div>
    <div class="ability-modal-panel">
      <img class="ability-modal-art" src="${escapeHtml(imgSrc)}" alt="" onerror="this.style.display='none'"/>
      <div class="ability-modal-body">
        <h3 class="ability-modal-title">${escapeHtml(`[${typeLabel}] — ${ability.card_name}`)}</h3>
        <p class="ability-modal-rule">${escapeHtml(ability.teaching_copy || '')}</p>
        <p class="ability-modal-effect">${escapeHtml(ability.rule_text || '')}</p>
        <div class="ability-modal-actions">
          <button class="btn primary" data-choice="confirm">Confirm</button>
          <button class="btn" data-choice="skip">Skip</button>
          <button class="btn danger" data-choice="abort">Abort</button>
        </div>
      </div>
    </div>
  `;

  modal.addEventListener('click', (ev) => {
    if (ev.target.classList.contains('ability-modal-backdrop')) {
      modal.remove();
      document.body.classList.remove('ability-modal-open');
      sendAbilitySkip(ability.ability_id);
      return;
    }
    const btn = ev.target.closest('[data-choice]');
    if (!btn) return;
    const choice = btn.dataset.choice;
    modal.remove();
    document.body.classList.remove('ability-modal-open');
    if (choice === 'confirm') {
      if (ability.needs_target) {
        enterTargetSelect({
          card_code: ability.card_code,
          card_name: ability.card_name,
          source: ability.source,
          index: ability.source_index,
          abilityType: ability.type,
          ruleText: ability.rule_text
        }, ability.valid_targets || []);
      } else {
        sendAbilityResolve(ability.ability_id, 'confirm', []);
      }
    } else if (choice === 'abort') {
      abilityState.mode = 'idle';
      abilityState.pendingAction = null;
      sendAbilityAbort(ability.ability_id);
    } else {
      sendAbilitySkip(ability.ability_id);
    }
  });

  document.body.appendChild(modal);
}

function showAbilityAbort(title, body, onClose) {
  closeCardModal();
  document.body.classList.add('ability-modal-open');
  const modal = document.createElement('div');
  modal.className = 'ability-abort-modal';
  modal.innerHTML = `
    <div class="ability-modal-backdrop"></div>
    <div class="ability-modal-panel" style="grid-template-columns: 1fr;">
      <div class="ability-modal-body">
        <h3 class="ability-modal-title">${escapeHtml(title)}</h3>
        <p class="ability-modal-effect">${escapeHtml(body)}</p>
        <div class="ability-modal-actions">
          <button class="btn primary" data-choice="ok">OK</button>
        </div>
      </div>
    </div>
  `;
  modal.addEventListener('click', (ev) => {
    if (ev.target.classList.contains('ability-modal-backdrop') || ev.target.closest('[data-choice="ok"]')) {
      modal.remove();
      document.body.classList.remove('ability-modal-open');
      if (onClose) onClose();
      else {
        if (abilityState.mode === 'target_select') {
          exitTargetSelect(true, false);
        } else {
          abilityState.mode = 'idle';
          processChainQueue();
        }
      }
    }
  });
  document.body.appendChild(modal);
}

function showRevealedCardSelector(ability) {
  closeCardModal();
  document.body.classList.add('ability-modal-open');
  abilityState.mode = 'reveal_select';
  abilityState.pendingAction = ability;
  abilityState.selectedRevealIndices = [];

  const revealed = ability.revealed_cards || [];
  const maxSelect = ability.revealed_select_count || 1;

  const modal = document.createElement('div');
  modal.className = 'ability-decision-modal';
  const typeLabel = ability.type ? ability.type.replace(/_/g, ' ').toUpperCase() : 'ABILITY';

  const cardsHtml = revealed.map((card, idx) => {
    const imgSrc = getImageUrl(card);
    return `
      <div class="revealed-card-option" data-index="${idx}" role="button" tabindex="0"
           title="Click to select ${escapeHtml(card.card_name || card.card_code)}">
        <img class="revealed-card-img" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(card.card_name || '')}"
             onerror="this.style.display='none'">
        <div class="revealed-card-name">${escapeHtml(card.card_name || card.card_code)}</div>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div class="ability-modal-backdrop"></div>
    <div class="ability-modal-panel revealed-panel">
      <h3 class="ability-modal-title">${escapeHtml(`[${typeLabel}] — ${ability.card_name}`)}</h3>
      <p class="ability-modal-rule">Choose up to ${maxSelect} card(s) to add to your hand.</p>
      <div class="revealed-card-grid">${cardsHtml}</div>
      <div class="ability-modal-actions">
        <button class="btn primary" id="revealed-confirm" disabled>Confirm (0/${maxSelect})</button>
        <button class="btn" id="revealed-skip">Add None (Place All Bottom)</button>
        <button class="btn" id="revealed-abort">Abort</button>
      </div>
    </div>
  `;

  const updateConfirm = () => {
    const confirmBtn = modal.querySelector('#revealed-confirm');
    const count = abilityState.selectedRevealIndices.length;
    confirmBtn.textContent = `Confirm (${count}/${maxSelect})`;
    confirmBtn.disabled = count === 0;
  };

  modal.querySelectorAll('.revealed-card-option').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index, 10);
      const selected = abilityState.selectedRevealIndices;
      if (selected.includes(idx)) {
        abilityState.selectedRevealIndices = selected.filter((i) => i !== idx);
        el.classList.remove('selected');
      } else if (selected.length < maxSelect) {
        abilityState.selectedRevealIndices = [...selected, idx];
        el.classList.add('selected');
      }
      updateConfirm();
    });
  });

  modal.addEventListener('click', (ev) => {
    if (ev.target.classList.contains('ability-modal-backdrop')) {
      modal.remove();
      document.body.classList.remove('ability-modal-open');
      sendAbilityAbort(ability.ability_id);
      return;
    }
    if (ev.target.id === 'revealed-skip') {
      modal.remove();
      document.body.classList.remove('ability-modal-open');
      sendAbilityResolve(ability.ability_id, 'confirm', []);
      return;
    }
    if (ev.target.id === 'revealed-abort') {
      modal.remove();
      document.body.classList.remove('ability-modal-open');
      sendAbilityAbort(ability.ability_id);
      return;
    }
    if (ev.target.id === 'revealed-confirm') {
      modal.remove();
      document.body.classList.remove('ability-modal-open');
      sendAbilityResolve(
        ability.ability_id,
        'confirm',
        [],
        null,
        abilityState.selectedRevealIndices
      );
    }
  });

  document.body.appendChild(modal);
}

function showAbilityBanner(title, ruleText, showCancel) {
  hideAbilityBanner();
  const banner = document.createElement('div');
  banner.className = 'ability-banner';
  banner.id = 'ability-banner';
  banner.innerHTML = `
    <span class="banner-rule">${escapeHtml(title)}</span>
    <span>${escapeHtml(ruleText || '')}</span>
    ${showCancel ? '<span class="banner-actions"><button class="btn primary" id="ability-banner-confirm" disabled>Confirm</button><button class="banner-cancel" id="ability-banner-cancel">Abort Ability</button></span>' : ''}
  `;
  document.body.appendChild(banner);
  if (showCancel) {
    banner.querySelector('#ability-banner-confirm').addEventListener('click', () => {
      if (abilityState.selectedTargets.length === 0) return;
      const targets = abilityState.selectedTargets;
      const ability = abilityState.pendingAction;
      const amount = abilityState.selectedAmount;
      exitTargetSelect(false, false);
      if (ability) {
        sendAbilityResolve(ability.ability_id, 'confirm', targets, amount);
      }
    });
    banner.querySelector('#ability-banner-cancel').addEventListener('click', () => {
      exitTargetSelect(true, false);
    });
  }
}

function updateBannerConfirm() {
  const banner = document.getElementById('ability-banner');
  if (!banner) return;
  const confirmBtn = banner.querySelector('#ability-banner-confirm');
  if (!confirmBtn) return;
  confirmBtn.disabled = abilityState.selectedTargets.length === 0;
}

function hideAbilityBanner() {
  const existing = document.getElementById('ability-banner');
  if (existing) existing.remove();
}

function enterTargetSelect(sourceCard, validTargets) {
  abilityState.mode = 'target_select';
  abilityState.sourceCard = sourceCard;
  abilityState.validTargets = validTargets;
  abilityState.selectedTargets = [];
  document.body.classList.add('target-select-active');

  const sourceEl = findCardElement(sourceCard.source, sourceCard.index);
  if (sourceEl) sourceEl.classList.add('ability-source-pulse');

  validTargets.forEach(t => {
    const el = findCardElement(t.zone, t.index);
    if (el) el.classList.add('ability-target-valid');
  });

  document.querySelectorAll('.card-wrapper').forEach(el => {
    if (!el.classList.contains('ability-target-valid') && el !== sourceEl) {
      el.classList.add('ability-dimmed');
    }
  });

  const typeLabel = sourceCard.abilityType ? sourceCard.abilityType.replace(/_/g, ' ').toUpperCase() : 'ABILITY';
  showAbilityBanner(
    `Select a target for ${sourceCard.card_name}`,
    `[${typeLabel}] — ${sourceCard.ruleText || ''}`,
    true
  );
}

function exitTargetSelect(abort = false, continueQueue = true) {
  abilityState.mode = 'idle';
  document.body.classList.remove('target-select-active');
  document.querySelectorAll('.ability-source-pulse, .ability-target-valid, .ability-target-selected, .ability-dimmed')
    .forEach(el => el.classList.remove('ability-source-pulse', 'ability-target-valid', 'ability-target-selected', 'ability-dimmed'));
  hideAbilityBanner();

  if (abort && abilityState.pendingAction) {
    sendAbilityAbort(abilityState.pendingAction.ability_id);
  }
  abilityState.pendingAction = null;
  abilityState.sourceCard = null;
  abilityState.validTargets = [];
  abilityState.selectedTargets = [];
  abilityState.selectedAmount = null;
  if (continueQueue) processChainQueue();
}

function sendAbilityResolve(abilityId, choice, targets, amount = null, revealedSelection = null) {
  const action = { type: 'ability_resolve', player: viewer, ability_id: abilityId, choice, targets };
  if (amount !== null && amount !== undefined) action.amount = amount;
  if (revealedSelection !== null && revealedSelection !== undefined) action.revealed_selection = revealedSelection;
  sendAction(action);
}

function sendAbilitySkip(abilityId) {
  sendAction({ type: 'ability_skip', player: viewer, ability_id: abilityId });
}

function sendAbilityAbort(abilityId) {
  sendAction({ type: 'ability_abort', player: viewer, ability_id: abilityId });
}

function processChainQueue() {
  if (!state) return;
  const pending = state.pending_abilities || [];
  if (abilityState.mode !== 'idle') return;
  // Only process abilities for the viewer; let backend/cpu handle theirs via auto-step
  const mine = pending.filter(a => a.player === viewer);
  if (mine.length === 0) return;
  const ability = mine[0];
  resolveAbility(ability);
}

function resolveAbility(ability) {
  if (ability.amount_choice) {
    showAbilityAmountChooser(ability);
  } else if (ability.needs_reveal_choice && ability.revealed_cards?.length > 0) {
    showRevealedCardSelector(ability);
  } else if (ability.needs_choice) {
    showAbilityDecision(ability);
  } else if (ability.needs_target) {
    if (!ability.valid_targets || ability.valid_targets.length === 0) {
      showAbilityAbort('No Valid Targets', `There are no valid targets for ${ability.card_name}'s ability right now. The ability will be skipped.`, () => {
        sendAbilitySkip(ability.ability_id);
      });
    } else {
      abilityState.pendingAction = ability;
      enterTargetSelect({
        card_code: ability.card_code,
        card_name: ability.card_name,
        source: ability.source,
        index: ability.source_index,
        abilityType: ability.type,
        ruleText: ability.rule_text
      }, ability.valid_targets);
    }
  } else {
    showAbilityToast(ability);
    sendAbilityResolve(ability.ability_id, 'confirm', []);
  }
}

const els = {
  loading: document.getElementById("loading"),
  backBtn: document.getElementById("back-btn"),
  passBtn: document.getElementById("pass-btn"),
  phaseBtn: document.getElementById("phase-btn"),
  turnNumber: document.getElementById("turn-number"),
  turnPlayer: document.getElementById("turn-player"),
  phase: document.getElementById("phase"),
  message: document.getElementById("game-message"),
  mulliganPanel: document.getElementById("mulligan-panel"),
  mulliganText: document.getElementById("mulligan-text"),
  mulliganKeep: document.getElementById("mulligan-keep"),
  mulliganRedraw: document.getElementById("mulligan-redraw"),
  log: document.getElementById("log"),
  attackPrompt: document.getElementById("attack-prompt"),
  attackPromptText: document.getElementById("attack-prompt-text"),
  attackPromptActions: document.getElementById("attack-prompt-actions"),
};

function api(path, body) {
  const method = body ? "POST" : "GET";
  const init = { method, headers: { "Content-Type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  return fetch(`${API_BASE}${path}`, init).then((r) => {
    if (!r.ok) return r.text().then((t) => { throw new Error(t || `HTTP ${r.status}`); });
    return r.json();
  });
}

function getImageUrl(card) {
  if (!card) return "";
  const raw = card.image_url || card.official_image_cache_url || card.official_image_url || card.official_image_cache_path || "";
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  const normalized = raw.replace(/\\/g, "/").replace(/^\/?tcg\/one-piece\//, "");
  return new URL(normalized, location.href).href;
}

function cardEl(card, opts = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `card-wrapper ${opts.className || ""}`;
  wrapper.draggable = opts.draggable !== false;
  wrapper.dataset.cardCode = card.card_code || "";
  if (card.card_id) wrapper.dataset.cardId = card.card_id;
  if (opts.source) wrapper.dataset.source = opts.source;
  if (opts.index != null) wrapper.dataset.index = opts.index;

  const img = document.createElement("img");
  img.className = "card";
  if (opts.inHand) img.classList.add("in-hand");
  if (card.rested) img.classList.add("rested");
  img.src = getImageUrl(card) || placeholderSvg(card);
  img.alt = card.card_name || card.card_code;
  img.loading = "lazy";
  img.onerror = () => { img.src = placeholderSvg(card); };

  wrapper.appendChild(img);
  if (opts.overlay) {
    const ov = document.createElement("span");
    ov.className = "card-overlay";
    ov.textContent = opts.overlay;
    wrapper.appendChild(ov);
  }
  // Active / rested / NEW visual indicators
  if (!opts.inHand && opts.source && (opts.source === "character" || opts.source === "opponent-char" || opts.source === "leader" || opts.source === "opponent-leader")) {
    if (card.played_this_turn) {
      const newBadge = document.createElement("span");
      newBadge.className = "new-turn-indicator";
      newBadge.textContent = "NEW";
      wrapper.appendChild(newBadge);
    }
    if (!card.rested) {
      img.classList.add("active-character");
    }
  }
  // Effective power overlay when different from printed power
  const basePower = parseInt(card.power, 10) || 0;
  const isMyTurn = state && state.turn_player === viewer;
  const isMyCard = opts.source && (
    (viewer === "player" && !opts.source.startsWith("opponent")) ||
    (viewer === "cpu" && opts.source.startsWith("opponent"))
  );
  const attachedBoost = (isMyTurn && isMyCard) ? (card.attached_don?.length || 0) * 1000 : 0;
  const bonusPower = card.bonus_power || 0;
  const battleBoost = card.battle_power_boost || 0;
  const effectivePower = basePower + attachedBoost + bonusPower + battleBoost;
  if (effectivePower !== basePower && basePower > 0) {
    const powerBadge = document.createElement("span");
    powerBadge.className = "power-badge";
    powerBadge.textContent = effectivePower;
    wrapper.appendChild(powerBadge);
  }
  // DON!! count badge on cards with attached DON
  const attachedDonCount = card.attached_don?.length || 0;
  if (attachedDonCount > 0) {
    const donBadge = document.createElement("span");
    donBadge.className = "don-badge";
    donBadge.textContent = attachedDonCount;
    wrapper.appendChild(donBadge);
  }
  // Attached DON pips under card
  const attachedDon = card.attached_don || [];
  if (attachedDon.length > 0) {
    const strip = document.createElement("div");
    strip.className = "attached-don-strip";
    attachedDon.forEach((don) => {
      const pip = document.createElement("span");
      pip.className = "attached-don-pip";
      if (don?.rested) pip.classList.add("rested-attached-don");
      pip.title = don?.rested
        ? "Attached rested DON!! (+1000 power; counts as attached DON)"
        : "Attached DON!! (+1000 power)";
      strip.appendChild(pip);
    });
    wrapper.appendChild(strip);
  }

  wrapper.addEventListener("dragstart", onDragStart);
  wrapper.addEventListener("dragend", () => {
    wrapper.classList.remove("dragging");
    wrapper.dataset.wasDragged = "1";
    setTimeout(() => { wrapper.dataset.wasDragged = ""; }, 0);
  });
  wrapper.addEventListener("click", (ev) => {
    if (wrapper.dataset.wasDragged === "1") return;
    // Target selection mode takes priority
    if (abilityState.mode === 'target_select') {
      ev.stopPropagation();
      if (wrapper.classList.contains('ability-target-valid')) {
        const zone = wrapper.closest('[data-zone]')?.dataset.zone || '';
        const idxStr = wrapper.closest('[data-zone]')?.dataset.slot?.split('-').pop() ?? wrapper.dataset.index;
        const idx = parseInt(idxStr, 10);
        const target = { zone, index: isNaN(idx) ? null : idx };
        const already = abilityState.selectedTargets.find(t => t.zone === target.zone && t.index === target.index);
        document.querySelectorAll('.ability-target-selected')
          .forEach(el => el.classList.remove('ability-target-selected'));
        abilityState.selectedTargets = already ? [] : [target];
        if (!already) wrapper.classList.add('ability-target-selected');
        updateBannerConfirm();
      }
      return;
    }
    if (gizmoState) {
      ev.stopPropagation();
      return onGizmoTargetClick(wrapper, card, opts);
    }
    if (abilityState.mode !== 'idle') {
      ev.stopPropagation();
      return; // Block card modal during ability resolution
    }
    ev.stopPropagation();
    openCardModal(card, opts);
  });
  return wrapper;
}

function attachedDonCount(card) {
  return (card?.attached_don || []).length;
}

function totalDonInPlay(player) {
  const leaderAttached = attachedDonCount(player?.leader);
  const characterAttached = (player?.characters || []).reduce(
    (sum, card) => sum + attachedDonCount(card),
    0
  );
  return (player?.don_active || 0) + (player?.don_rested || 0) + leaderAttached + characterAttached;
}

function formatDonCount(player) {
  const inPlay = totalDonInPlay(player);
  const remaining = Math.max(0, 10 - inPlay);
  return `${player?.don_active ?? 0}/${inPlay} (${remaining})`;
}

function placeholderSvg(card) {
  const name = (card?.card_name || card?.card_code || "?").slice(0, 12);
  const cost = card?.cost || "—";
  const power = card?.power || "—";
  const svg = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='140'><rect width='100' height='140' fill='%231e3a55' rx='6'/><text x='50' y='40' fill='white' font-size='10' text-anchor='middle'>${name}</text><text x='50' y='80' fill='%23ffd700' font-size='12' text-anchor='middle'>${cost}/${power}</text></svg>`
  )}`;
  return svg;
}

function isAttackWindowActive() {
  return Boolean(state?.active_attack || state?.pending_input);
}

function openCardModal(card, context = {}) {
  const existing = document.querySelector(".card-modal");
  if (existing) existing.remove();
  if (isAttackWindowActive()) {
    setMessage("Resolve the current attack timing window before using normal card actions.");
    return;
  }
  const modal = document.createElement("div");
  modal.className = "card-modal";
  const imgSrc = getImageUrl(card) || placeholderSvg(card);

  const isMine = context.source === "hand" || context.source === "character" || context.source === "leader";
  const isMain = state && state.phase === "main" && state.turn_player === viewer && !state.winner && !isCpuVsCpu && !isAttackWindowActive();
  const me = state ? state.players[viewer] : null;

  let buttonsHtml = "";
  if (isMine && isMain) {
    if (context.source === "hand" && (card.card_type || "").toUpperCase() === "CHARACTER") {
      buttonsHtml += `<button class="btn primary modal-action" data-action="play" data-index="${context.index ?? 0}">Play</button>`;
    }
    if (context.source === "hand" && (card.card_type || "").toUpperCase() === "STAGE") {
      buttonsHtml += `<button class="btn primary modal-action" data-action="play" data-index="${context.index ?? 0}">Play Stage</button>`;
    }
    if (context.source === "hand" && (card.card_type || "").toUpperCase() === "EVENT") {
      const eventCost = Number(card.cost || 0);
      const canAfford = Number(me?.don_active || 0) >= eventCost;
      const playBtn = canAfford
        ? `<button class="btn primary modal-action" data-action="play" data-index="${context.index ?? 0}">Play Event (${eventCost} DON)</button>`
        : `<button class="btn" disabled title="Needs ${eventCost} active DON!!">Play Event (Needs ${eventCost} DON)</button>`;
      buttonsHtml += playBtn;
    }
    if ((context.source === "character" || context.source === "leader") && me && me.don_active > 0) {
      buttonsHtml += `<button class="btn primary modal-action" data-action="attach" data-target="${context.source}" data-index="${context.index ?? 0}">+1 DON!!</button>`;
    }
    if ((context.source === "character" || context.source === "leader") && canAttackFromContext(card, context)) {
      buttonsHtml += buildAttackButton(card, context);
    }
    if (context.source === "stage" && isMain) {
      buttonsHtml += `<button class="btn modal-action" data-action="rest-stage">Rest Stage</button>`;
    }
    if (card.effect && card.effect.includes("[Activate: Main]")) {
      const phaseOk = state && state.phase === "main" && state.turn_player === viewer && !isCpuVsCpu;
      const oncePerTurn = card.effect.includes("[Once Per Turn]");
      const usedIds = new Set((state?.once_per_turn_used?.[viewer]) || []);
      const used = oncePerTurn && usedIds.has(card.card_id || '');
      if (phaseOk && !used) {
        buttonsHtml += `<button class="btn modal-action" data-action="activate">Activate Ability</button>`;
      }
    }
  }

  modal.innerHTML = `
    <div class="card-modal-backdrop"></div>
    <div class="card-modal-panel">
      <button class="card-modal-close" type="button">×</button>
      <img class="card-modal-image" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(card?.card_name || card?.card_code || "Card")}" />
      <div class="card-modal-details">
        <strong>${escapeHtml(card?.card_name || card?.card_code || "Card")}</strong>
        <span>${escapeHtml(card?.card_code || "")} · ${escapeHtml(card?.card_type || "")}</span>
        <span>Cost ${escapeHtml(card?.cost || "—")} · Power ${escapeHtml(card?.power || "—")} · Counter ${escapeHtml(displayCounterValue(card))}</span>
        ${card?.effect ? `<p>${escapeHtml(card.effect)}</p>` : ""}
        ${card?.trigger ? `<p><strong>Trigger:</strong> ${escapeHtml(card.trigger)}</p>` : ""}
        <div class="modal-actions">${buttonsHtml}</div>
      </div>
    </div>`;

  modal.addEventListener("click", (ev) => {
    if (ev.target.classList.contains("card-modal") || ev.target.classList.contains("card-modal-backdrop") || ev.target.classList.contains("card-modal-close")) {
      modal.remove();
    }
    const btn = ev.target.closest(".modal-action");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "play") {
      sendAction({ type: "play", player: viewer, card_index: parseInt(btn.dataset.index, 10) });
    } else if (action === "attach") {
      const target = btn.dataset.target;
      const idx = target === "character" ? parseInt(btn.dataset.index, 10) : undefined;
      sendAction({ type: "attach", player: viewer, target, ...(idx !== undefined ? { target_index: idx } : {}) });
    } else if (action === "attack") {
      const target = btn.dataset.target;
      const idx = parseInt(btn.dataset.index, 10);
      startAttackGizmo(card, target, idx);
    } else if (action === "activate") {
      const source = context.source;
      const idx = source === "character" ? parseInt(context.index ?? "0", 10) : undefined;
      sendAction({ type: "activate_ability", player: viewer, card_source: source, ...(idx !== undefined ? { card_index: idx } : {}) });
    } else if (action === "rest-stage") {
      sendAction({ type: "rest_stage", player: viewer });
    }
    modal.remove();
  });

  document.addEventListener("keydown", function onEsc(ev) {
    if (ev.key === "Escape") {
      modal.remove();
      document.removeEventListener("keydown", onEsc);
    }
  });
  document.body.appendChild(modal);
}

function displayCounterValue(card) {
  if (!card || !Object.prototype.hasOwnProperty.call(card, "counter")) {
    return "Unknown";
  }
  const rawValue = card.counter;
  if (rawValue === null || rawValue === undefined) {
    return "Unknown";
  }
  const normalized = String(rawValue).trim();
  if (!normalized || normalized === "-" || normalized === "0") {
    return "No printed counter";
  }
  return normalized;
}

function canAttackFromContext(card, context) {
  if (!card) return false;
  if (card.rested || card.leader_rested) return false;
  // Non-Rush characters cannot attack on the turn they are played.
  if (context.source === "character" && card.played_this_turn && !hasActiveRush(card)) return false;
  return true;
}

function attachedDonCount(card) {
  return Array.isArray(card?.attached_don) ? card.attached_don.length : Number(card?.attached_don || 0);
}

function hasActiveRush(card) {
  if (!card) return false;
  if (card.rush || (Array.isArray(card.keywords) && card.keywords.includes("Rush"))) return true;
  const required = Number(card.rush_cost || 0);
  return required > 0 && attachedDonCount(card) >= required;
}

/**
 * Build the attack button HTML for a character modal.
 * Shows attached-DON condition state for continuous Rush effects.
 */
function buildAttackButton(card, context) {
  const rushCost = (card?.rush_cost) || 0;
  const attached = attachedDonCount(card);
  const hasEnoughDon = attached >= rushCost;
  const isRushThisTurn = rushCost > 0 && card.played_this_turn;

  // For normal characters (no rush cost), just show Attack
  if (!isRushThisTurn) {
    return `<button class="btn danger modal-action" data-action="attack" data-target="${context.source}" data-index="${context.index ?? 0}">Attack</button>`;
  }

  // Rush character played this turn: show attached-DON requirement state
  if (hasEnoughDon) {
    return `<button class="btn danger modal-action" data-action="attack" data-target="${context.source}" data-index="${context.index ?? 0}" title="Rush active from ${rushCost} attached DON!!">Attack (Rush active)</button>`;
  }
  // Not enough attached DON: show disabled
  return `<button class="btn modal-action disabled" disabled title="Attach ${rushCost} DON!! to gain Rush">Attack — Attach ${rushCost} DON!! first</button>`;
}

async function declareAttack(action) {
  if (actionInFlight) return;
  actionInFlight = true;
  try {
    // Resolve attacker card_id from type+index
    const me = state.players[viewer];
    let attackerCardId = null;
    if (action.attacker_type === "leader") {
      attackerCardId = me.leader?.card_id || null;
    } else if (action.attacker_type === "character" && action.attacker_index != null) {
      attackerCardId = me.characters[action.attacker_index]?.card_id || null;
    }
    if (!attackerCardId) throw new Error("Could not resolve attacker card_id");

    // Build target_zone for backend
    let targetZone = "player"; // leader
    if (action.target === "character" && action.target_index != null) {
      targetZone = `character:${action.target_index}`;
    }

    const res = await api(`/api/game/${gameId}/attack/declare`, {
      attacker_card_id: attackerCardId,
      target_zone: targetZone,
    });
    state = res.state;
    syncModeFromState();
    render();
  } catch (err) {
    setMessage(`Attack error: ${err.message}`);
    await loadGame();
  } finally {
    actionInFlight = false;
    scheduleAutoStep();
  }
}

function startAttackGizmo(card, fromType, fromIndex) {
  if (gizmoState) clearGizmo();
  gizmoState = { fromCard: card, fromType, fromIndex };
  document.body.classList.add("attack-gizmo");
  setMessage("Click target to attack (Leader or rested Character)");
  createAttackLine();
}

function createAttackLine() {
  let svg = document.getElementById("attack-svg");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "attack-svg";
    svg.style.position = "fixed";
    svg.style.top = "0";
    svg.style.left = "0";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.pointerEvents = "none";
    svg.style.zIndex = "150";
    document.body.appendChild(svg);
  }
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.id = "attack-line";
  line.setAttribute("stroke", "var(--accent)");
  line.setAttribute("stroke-width", "3");
  line.setAttribute("stroke-dasharray", "6,4");
  svg.appendChild(line);
}

function updateAttackLine(x, y) {
  const svg = document.getElementById("attack-svg");
  const line = document.getElementById("attack-line");
  if (!svg || !line || !gizmoState) return;
  const selector = gizmoState.fromType === "leader"
    ? `[data-zone="player-leader"] .card`
    : `[data-zone="player-char-${gizmoState.fromIndex}"] .card`;
  const fromEl = document.querySelector(selector);
  if (!fromEl) return;
  const rect = fromEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  line.setAttribute("x1", cx);
  line.setAttribute("y1", cy);
  line.setAttribute("x2", x);
  line.setAttribute("y2", y);
}

/* Persistent attack arrow during attack resolution */
function drawPersistentAttackArrow(fromEl, toEl, resolved) {
  clearPersistentAttackArrow();
  let svg = document.getElementById("attack-arrow-svg");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "attack-arrow-svg";
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    // Default red arrowhead
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "arrowhead");
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "3.5");
    marker.setAttribute("orient", "auto");
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", "0 0, 10 3.5, 0 7");
    polygon.setAttribute("fill", "#ff5a5a");
    marker.appendChild(polygon);
    defs.appendChild(marker);
    // Resolved green arrowhead
    const markerResolved = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    markerResolved.setAttribute("id", "arrowhead-resolved");
    markerResolved.setAttribute("markerWidth", "10");
    markerResolved.setAttribute("markerHeight", "7");
    markerResolved.setAttribute("refX", "9");
    markerResolved.setAttribute("refY", "3.5");
    markerResolved.setAttribute("orient", "auto");
    const polygonResolved = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygonResolved.setAttribute("points", "0 0, 10 3.5, 0 7");
    polygonResolved.setAttribute("fill", "#4ade80");
    markerResolved.appendChild(polygonResolved);
    defs.appendChild(markerResolved);
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }
  if (resolved) {
    svg.classList.add("resolved");
    // Fade out when resolved
    svg.classList.add("fading-out");
    setTimeout(() => clearPersistentAttackArrow(), 400);
    return;
  } else {
    svg.classList.remove("resolved");
  }

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.classList.add("attack-arrow-line");
  const r1 = fromEl.getBoundingClientRect();
  const r2 = toEl.getBoundingClientRect();
  line.setAttribute("x1", r1.left + r1.width / 2);
  line.setAttribute("y1", r1.top + r1.height / 2);
  line.setAttribute("x2", r2.left + r2.width / 2);
  line.setAttribute("y2", r2.top + r2.height / 2);
  svg.appendChild(line);
}

function clearPersistentAttackArrow() {
  const svg = document.getElementById("attack-arrow-svg");
  if (svg) svg.remove();
}

function clearGizmo() {
  gizmoState = null;
  document.body.classList.remove("attack-gizmo");
  const svg = document.getElementById("attack-svg");
  if (svg) svg.remove();
  setMessage("Drag a card to play, attach, or attack.");
}

function onGizmoTargetClick(wrapper, card, opts) {
  if (!gizmoState || !state) return;
  const zone = wrapper.closest("[data-zone]")?.dataset.zone || "";
  if (zone === "opponent-leader") {
    declareAttack({
      attacker_type: gizmoState.fromType,
      attacker_index: gizmoState.fromType === "character" ? gizmoState.fromIndex : undefined,
      target: "player",
    });
  } else if (zone.startsWith("opponent-char-")) {
    const slot = parseInt(zone.split("-").pop(), 10);
    if (card.rested) {
      declareAttack({
        attacker_type: gizmoState.fromType,
        attacker_index: gizmoState.fromType === "character" ? gizmoState.fromIndex : undefined,
        target: "character",
        target_index: slot,
      });
    } else {
      setMessage("You can only attack rested characters.");
      return;
    }
  } else {
    setMessage("Invalid target. Click opponent Leader or rested Character.");
    return;
  }
  clearGizmo();
}

document.addEventListener("mousemove", (ev) => {
  if (gizmoState) updateAttackLine(ev.clientX, ev.clientY);
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && gizmoState) clearGizmo();
  // Global Escape for ability resolution
  if (ev.key === "Escape") {
    if (abilityState.mode === 'decision') {
      const modal = document.querySelector('.ability-decision-modal');
      if (modal) modal.remove();
      document.body.classList.remove('ability-modal-open');
      const ability = abilityState.pendingAction;
      abilityState.mode = 'idle';
      abilityState.pendingAction = null;
      if (ability) sendAbilitySkip(ability.ability_id);
      processChainQueue();
    } else if (abilityState.mode === 'target_select') {
      exitTargetSelect(true, false);
    } else if (abilityState.mode === 'amount_select') {
      const ability = abilityState.pendingAction;
      hideAbilityAmountChooser();
      abilityState.mode = 'idle';
      abilityState.pendingAction = null;
      abilityState.selectedAmount = null;
      if (ability) sendAbilityAbort(ability.ability_id);
    }
  }
});

function onDragStart(ev) {
  if (abilityState.mode !== 'idle') {
    ev.preventDefault();
    return;
  }
  const wrapper = ev.currentTarget;
  wrapper.classList.add("dragging");
  ev.dataTransfer.setData("text/plain", JSON.stringify({
    source: wrapper.dataset.source,
    index: wrapper.dataset.index,
    cardCode: wrapper.dataset.cardCode,
  }));
  ev.dataTransfer.effectAllowed = "move";
}

function allowDrop(ev) {
  if (abilityState.mode !== 'idle') {
    return;
  }
  ev.preventDefault();
  const target = ev.currentTarget;
  if (target.classList.contains("char-slot") || target.classList.contains("leader-zone") || target.classList.contains("don-zone") || target.classList.contains("stage-zone")) {
    target.classList.add("drop-hover");
  }
}

function leaveDrop(ev) {
  ev.currentTarget.classList.remove("drop-hover");
}

async function onDrop(ev) {
  ev.preventDefault();
  ev.currentTarget.classList.remove("drop-hover");
  if (!state || state.winner || isCpuVsCpu) return;
  const data = JSON.parse(ev.dataTransfer.getData("text/plain") || "{}");
  const zone = ev.currentTarget.dataset.zone;
  if (!zone) return;

  const action = dropToAction(data, zone);
  if (!action) {
    setMessage("Illegal drop.");
    return;
  }
  if (action.type === "attack") {
    await declareAttack({
      attacker_type: action.attacker_type,
      attacker_index: action.attacker_index,
      target: action.target,
      target_index: action.target_index,
    });
  } else {
    await sendAction(action);
  }
}

function dropToAction(data, zone) {
  if (!state || state.turn_player !== viewer || state.phase !== "main" || isCpuVsCpu) return null;
  const me = state.players[viewer];

  if (data.source === "hand" && zone.startsWith(`${viewer}-char-`)) {
    const card = me.hand[parseInt(data.index, 10)];
    if (!card || (card.card_type || "").toUpperCase() !== "CHARACTER") return null;
    return { type: "play", player: viewer, card_index: parseInt(data.index, 10) };
  }

  // Events can be dropped anywhere on player's side to play them
  if (data.source === "hand" && (zone.startsWith(`${viewer}-`) || zone === `${viewer}-leader` || zone.startsWith(`${viewer}-char-`) || zone === `${viewer}-stage`)) {
    const card = me.hand[parseInt(data.index, 10)];
    if (card && (card.card_type || "").toUpperCase() === "EVENT") {
      const eventCost = Number(card.cost || 0);
      if (me.don_active >= eventCost) {
        return { type: "play", player: viewer, card_index: parseInt(data.index, 10) };
      }
      return null;
    }
  }

  if (data.source === "don" && (zone === `${viewer}-leader` || zone.startsWith(`${viewer}-char-`))) {
    if (me.don_active <= 0) return null;
    if (zone === `${viewer}-leader`) return { type: "attach", player: viewer, target: "leader" };
    const slot = parseInt(zone.split("-").pop(), 10);
    return { type: "attach", player: viewer, target: "character", target_index: slot };
  }

  if (data.source === "character" && zone.startsWith("opponent-")) {
    const attackerIndex = parseInt(data.index, 10);
    const attacker = me.characters[attackerIndex];
    if (!attacker || attacker.rested || (attacker.played_this_turn && !attacker.rush)) return null;
    if (zone === "opponent-leader") return { type: "attack", player: viewer, attacker_type: "character", attacker_index: attackerIndex, target: "player" };
    if (zone.startsWith("opponent-char-")) {
      const slot = parseInt(zone.split("-").pop(), 10);
      return { type: "attack", player: viewer, attacker_type: "character", attacker_index: attackerIndex, target: "character", target_index: slot };
    }
  }

  return null;
}

function opponentKey() {
  if (isCpuVsCpu) return "cpu";
  return viewer === "player" ? "cpu" : "player";
}

function syncModeFromState() {
  if (state?.mode === "cpu-vs-cpu") {
    isCpuVsCpu = true;
    viewer = "spectator";
  }
}

const STEP_DELAY_MS = 1000;           // base pause between automated actions
const STEP_JITTER_MS = 150;            // random extra 0–150ms for organic feel

let autoStepTimer = null;
let cpuThinking = false;

function stepDelay() {
  return STEP_DELAY_MS + Math.floor(Math.random() * STEP_JITTER_MS);
}

function showPhaseBanner(icon, text) {
  const banner = document.getElementById("phase-banner");
  const iconEl = document.getElementById("phase-banner-icon");
  const textEl = document.getElementById("phase-banner-text");
  if (!banner || !iconEl || !textEl) return;
  iconEl.textContent = icon;
  textEl.textContent = text;
  banner.style.display = "";
}

function hidePhaseBanner() {
  const banner = document.getElementById("phase-banner");
  if (banner) banner.style.display = "none";
}

function phaseBannerTextFor(phase, turnPlayer) {
  const actor = turnPlayer === "cpu" ? "CPU" : "Player";
  switch (phase) {
    case "refresh": return `${actor} Refresh Phase — all rested cards and DON!! are made active.`;
    case "draw":    return `${actor} Draw Phase — ${actor} draws one card.`;
    case "don":     return `${actor} DON!! Phase — ${actor} adds available DON!! to the cost area.`;
    case "main":    return turnPlayer === "cpu" ? "CPU Main Phase — CPU is deciding, playing cards, attaching DON!!, attacking, or ending." : "Player Main Phase — play cards, attach DON!!, attack, or pass.";
    default:        return `${actor} ${phase}…`;
  }
}

async function sendAction(action, opts = {}) {
  if (actionInFlight) return;
  actionInFlight = true;
  try {
    const body = action ? { action } : {};
    // Use single_step when backend should only execute one action iteration.
    if (opts.single_step) body.single_step = true;
    const res = await api(`/api/game/${gameId}/step`, body);
    state = res.state;
    syncModeFromState();
    render();
    // Show toast after successful event play
    if (action && action.type === "play") {
      const lastLog = (state.log || []).slice(-1)[0] || "";
      const match = lastLog.match(/played event (.+?) \(cost (\d+)\)/i);
      if (match) {
        showEventToast(match[1], match[2]);
      }
    }
  } catch (err) {
    setMessage(`Action error: ${err.message}`);
    await loadGame();
  } finally {
    actionInFlight = false;
    scheduleAutoStep();
  }
}

function showEventToast(name, cost) {
  const toasts = document.querySelectorAll('.ability-toast');
  if (toasts.length >= 3) toasts[0].remove();
  const toast = document.createElement('div');
  toast.className = 'ability-toast';
  toast.innerHTML = `
    <div class="toast-body">
      <span class="toast-title">EVENT PLAYED</span>
      <span class="toast-text">${escapeHtml(name)} — paid ${cost} DON!!</span>
    </div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function scheduleAutoStep() {
  if (autoStepTimer) return;
  if (!state || state.winner || state.phase === "mulligan") {
    hidePhaseBanner();
    return;
  }

  const aa = state.active_attack;

  // Attack subphase pacing takes priority over normal phase pacing
  if (aa) {
    const isCpuPending = aa.pending_player_id === "cpu";
    const isPlayerPending = aa.pending_player_id === "player";
    const isResolved = aa.resolved;
    const pendingInput = aa.pending_input;

    if (isResolved) {
      // Show result for 2s then refresh
      showPhaseBanner("⚔️", attackBannerText(aa));
      autoStepTimer = setTimeout(() => {
        autoStepTimer = null;
        hidePhaseBanner();
        loadGame();
      }, 2000);
      return;
    }

    if (pendingInput) {
      if (isCpuPending) {
        // CPU needs to decide: call /step which triggers auto_decide() on backend
        showPhaseBanner("⏳", attackBannerText(aa));
        autoStepTimer = setTimeout(() => {
          autoStepTimer = null;
          if (!state || !state.active_attack) return;
          // /step endpoint handles CPU auto-decide for attack subphases
          sendAction(null, { single_step: true }).catch(() => {});
        }, 1000);
        return;
      } else {
        // Player needs to decide: show UI, don't auto-step
        showPhaseBanner("⚔️", attackBannerText(aa));
        return;
      }
    }

    // No pending input and not resolved: poll after 1s
    showPhaseBanner("⏳", attackBannerText(aa));
    autoStepTimer = setTimeout(() => {
      autoStepTimer = null;
      loadGame().catch(() => {});
    }, 1000);
    return;
  }

  // Normal phase scheduling
  const isCpuTurn = state.turn_player === "cpu";
  const isResourcePhase = state.phase === "refresh" || state.phase === "draw" || state.phase === "don";

  let needsStep = false;
  if (isCpuVsCpu) {
    needsStep = true;
  } else if (isCpuTurn) {
    needsStep = true;
  } else if (isResourcePhase && state.phase !== "refresh") {
    needsStep = true;
  }

  if (!needsStep) {
    hidePhaseBanner();
    return;
  }

  const bannerIcon = isCpuTurn && state.phase === "main" ? "🔄" : "⏳";
  showPhaseBanner(bannerIcon, phaseBannerTextFor(state.phase, state.turn_player));

  autoStepTimer = setTimeout(() => {
    autoStepTimer = null;
    if (!state || state.winner || state.phase === "mulligan") {
      hidePhaseBanner();
      return;
    }
    const action = (!isCpuTurn && isResourcePhase)
      ? { type: "pass", player: viewer }
      : null;
    sendAction(action, { single_step: true }).catch(() => {});
  }, stepDelay());
}

function combatFeedHtml() {
  const combatWords = [
    "attack", "attacking", "block", "counter", "battle", "damage", "trigger", "reveals", "math", "survives", "k.o", "passes"
  ];
  const entries = (state?.log || [])
    .filter((entry) => combatWords.some((word) => String(entry).toLowerCase().includes(word)))
    .slice(-5);
  return entries
    .map((entry) => `<div class="combat-feed-entry">${escapeHtml(entry)}</div>`)
    .join("");
}

function attackBannerText(aa) {
  if (!aa) return "";
  const subphase = aa.subphase;
  const pending = aa.pending_input;
  const attacker = aa.attacker_name || "Attacker";
  const defender = aa.defender_name || aa.target_name || "target";
  const attackerPower = aa.attacker_power ?? "?";
  const defenderPower = aa.defender_power ?? "?";
  const chooser = aa.pending_player_id === "cpu" ? "CPU" : aa.pending_player_id === "player" ? "Player" : "Defender";
  if (aa.resolved) {
    if (aa.attacker_wins) {
      return `⚔️ ${attacker} (${attackerPower}) vs ${defender} (${defenderPower}) → ${attacker} wins! ${defender} is K.O.'d`;
    }
    return `⚔️ ${attacker} (${attackerPower}) vs ${defender} (${defenderPower}) → ${defender} survives!`;
  }
  const matchup = `${attacker} (${attackerPower}) attacking ${defender} (${defenderPower})`;
  if (pending === "BLOCKER_DECLARATION") return `Block Step — ${matchup}. ${chooser} chooses whether to declare a Blocker.`;
  if (pending === "COUNTER_PLAY") return `Counter Step — ${matchup}. ${chooser} chooses whether to use counters.`;
  if (pending === "TRIGGER_ACTIVATION") return `Damage/Trigger Step — ${matchup}. ${chooser} chooses whether to activate the Life trigger.`;
  if (subphase === "attack_step") return `Attack Step — ${matchup}. When Attacking effects resolve now.`;
  if (subphase === "battle_resolution") return `Battle Resolution — compare ${attackerPower} attack power against ${defenderPower} defender power.`;
  if (subphase === "damage_resolution") return `Damage Resolution — leader damage and Trigger checks happen now.`;
  return `Resolving attack — ${matchup}.`;
}

async function loadGame() {
  try {
    const res = await api(`/api/game/${gameId}`);
    state = res.state;
    syncModeFromState();
    render();
    els.loading.style.display = "none";

    if (isCpuVsCpu && state.phase === "mulligan") {
      if (!state.mulligan_done?.player) {
        await api(`/api/game/${gameId}/mulligan`, { player: "player", keep: true });
      }
      if (!state.mulligan_done?.cpu) {
        await api(`/api/game/${gameId}/mulligan`, { player: "cpu", keep: true });
      }
      const refreshed = await api(`/api/game/${gameId}`);
      state = refreshed.state;
      syncModeFromState();
      render();
    } else if (mode === "player-vs-cpu" && state.phase === "mulligan" && !state.mulligan_done?.cpu) {
      await api(`/api/game/${gameId}/mulligan`, { player: "cpu", keep: true });
      const refreshed = await api(`/api/game/${gameId}`);
      state = refreshed.state;
      syncModeFromState();
      render();
    }

    scheduleAutoStep();
  } catch (err) {
    els.loading.textContent = `Failed to load game: ${err.message}`;
  }
}

function render() {
  if (!state) return;
  const meKey = isCpuVsCpu ? "player" : viewer;
  const oppKey = opponentKey();
  const me = state.players[meKey];
  const opp = state.players[oppKey];

  els.turnNumber.textContent = `Global Turn ${state.turn_number}`;
  els.turnPlayer.textContent = `Active Player: ${state.turn_player === "player" ? "Player" : "CPU"}`;
  els.phase.textContent = state.phase;

  renderPiles(me, "player");
  renderPiles(opp, "opponent");
  renderLeader(me, "player");
  renderLeader(opp, "opponent");
  renderStage(me, "player");
  renderStage(opp, "opponent");
  renderCharacters(me, "player");
  renderCharacters(opp, "opponent");
  renderHand(me, "player-hand", true);

  if (isCpuVsCpu) {
    renderHand(opp, "opponent-hand", false);
  } else {
    document.getElementById("opponent-hand").innerHTML = `<span class="zone-label">Hand</span><span class="zone-count" id="opponent-hand-count">${opp.hand_count ?? opp.hand?.length ?? 0}</span>`;
  }

  renderLog();
  renderPhaseBtn();

  // Disable normal interactions during ability or attack resolution
  const isResolving = abilityState.mode !== 'idle';
  const isAttackResolving = isAttackWindowActive();
  if (isAttackResolving) {
    closeCardModal();
  }
  els.passBtn.disabled = isCpuVsCpu || state.turn_player !== viewer || state.phase !== "main" || isResolving || isAttackResolving;
  document.body.classList.toggle('ability-modal-open', isResolving);
  document.body.classList.toggle('attack-window-open', isAttackResolving);

  if (state.phase === "mulligan") {
    const needMulligan = !state.mulligan_done?.[meKey];
    els.mulliganPanel.classList.toggle("active", needMulligan);
    els.passBtn.disabled = true;
    els.mulliganText.textContent = needMulligan
      ? `Keep or mulligan your opening hand (${me.hand.length} cards).`
      : "Waiting for opponent mulligan...";
  } else {
    els.mulliganPanel.classList.remove("active");
    els.passBtn.disabled = isCpuVsCpu || state.turn_player !== viewer || state.phase !== "main" || isResolving || isAttackResolving;
  }

  if (state.winner) {
    setMessage(`🎉 ${state.winner === "player" ? "Player" : "CPU"} wins!`);
    els.passBtn.disabled = true;
  }

  // Chain queue processing
  processChainQueue();

  // Attack subphase UI
  renderAttackUI();
}

function renderAttackUI() {
  const promptEl = document.getElementById("attack-prompt");
  const textEl = document.getElementById("attack-prompt-text");
  const logEl = document.getElementById("attack-prompt-log");
  const actionsEl = document.getElementById("attack-prompt-actions");
  if (!promptEl || !textEl || !actionsEl) return;

  // Clear highlights and persistent arrow
  document.querySelectorAll('.blocker-highlight, .counter-highlight, .attacker-highlight, .attack-target-highlight')
    .forEach(el => el.classList.remove('blocker-highlight', 'counter-highlight', 'attacker-highlight', 'attack-target-highlight'));
  clearPersistentAttackArrow();

  const aa = state?.active_attack;
  if (!aa) {
    promptEl.style.display = "none";
    promptEl.className = "attack-prompt";
    textEl.textContent = "";
    if (logEl) logEl.innerHTML = "";
    actionsEl.innerHTML = "";
    return;
  }

  promptEl.style.display = "";
  promptEl.className = "attack-prompt active";
  if (logEl) logEl.innerHTML = combatFeedHtml();

  const attackerId = aa.attacker_card_id;
  const targetId = aa.blocker_card_id || aa.target_card_id;
  const defenderKey = aa.pending_player_id;
  const pending = aa.pending_input;

  // Highlight attacker and current attack target
  const attackerEl = document.querySelector(`[data-card-id="${attackerId}"]`);
  if (attackerEl) attackerEl.classList.add("attacker-highlight");
  const targetEl = document.querySelector(`[data-card-id="${targetId}"]`);
  if (targetEl) targetEl.classList.add("attack-target-highlight");

  // Draw persistent attack arrow from attacker to target
  if (attackerEl && targetEl) {
    drawPersistentAttackArrow(attackerEl, targetEl, aa.resolved);
  }

  if (pending === "BLOCKER_DECLARATION") {
    textEl.textContent = attackBannerText(aa);
    if (defenderKey === viewer) {
      // Find valid blockers among active characters
      const meKey = isCpuVsCpu ? "player" : viewer;
      const me = state.players[meKey];
      const blockers = (me.characters || []).filter((c, idx) => {
        const isBlocker = (c.keywords || []).some(k => k.toLowerCase() === "blocker") ||
          (c.effect || "").toLowerCase().includes("[blocker]");
        return isBlocker && !c.rested;
      });
      actionsEl.innerHTML = "";
      if (!blockers.length) {
        const none = document.createElement("span");
        none.className = "attack-prompt-text";
        none.textContent = "No legal blockers available — continue.";
        actionsEl.appendChild(none);
      }
      blockers.forEach((b) => {
        const btn = document.createElement("button");
        btn.className = "btn primary";
        btn.textContent = `Block with ${b.card_name || b.card_code}`;
        btn.addEventListener("click", () => {
          sendBlockerChoice(b.card_id);
        });
        actionsEl.appendChild(btn);
        // Highlight blocker card
        const bel = document.querySelector(`[data-card-id="${b.card_id}"]`);
        if (bel) bel.classList.add("blocker-highlight");
      });
      const passBtn = document.createElement("button");
      passBtn.className = "btn";
      passBtn.textContent = "Don't Block";
      passBtn.addEventListener("click", () => sendBlockerChoice(null));
      actionsEl.appendChild(passBtn);
    } else {
      actionsEl.innerHTML = `<span class="attack-prompt-text">CPU is deciding…</span>`;
    }
    return;
  }

  if (pending === "COUNTER_PLAY") {
    textEl.textContent = attackBannerText(aa);
    if (defenderKey === viewer) {
      const meKey = isCpuVsCpu ? "player" : viewer;
      const me = state.players[meKey];
      const counters = (me.hand || []).filter(c => {
        const type = (c.card_type || "").toUpperCase();
        // Event Counters: Event cards with "Counter" in effect text
        if (type === "EVENT") return (c.effect || "").toLowerCase().includes("counter");
        // Character Counters: Character cards with a printed Counter value
        if (type === "CHARACTER") return !!(c.counter && String(c.counter) !== "0" && String(c.counter) !== "");
        return false;
      });
      actionsEl.innerHTML = "";
      if (!counters.length) {
        const none = document.createElement("span");
        none.className = "attack-prompt-text";
        none.textContent = "No usable counters available — continue.";
        actionsEl.appendChild(none);
      }
      counters.forEach((c, idx) => {
        const btn = document.createElement("button");
        btn.className = "btn primary";
        const type = (c.card_type || "").toUpperCase();
        const isCharCounter = type === "CHARACTER";
        const eventCost = Number(c.cost || 0);
        const canPay = isCharCounter || Number(me.don_active || 0) >= eventCost;
        if (!canPay) {
          btn.disabled = true;
          btn.title = `Needs ${eventCost} active DON!!`;
        }
        btn.textContent = isCharCounter
          ? `Discard ${c.card_name || c.card_code} (+${c.counter})`
          : `Play ${c.card_name || c.card_code} (${eventCost} DON)`;
        btn.addEventListener("click", () => {
          if (canPay) sendCounterChoice(c.card_id);
        });
        actionsEl.appendChild(btn);
        // Highlight counter card in hand
        const hel = document.querySelector(`#player-hand [data-card-id="${c.card_id}"]`);
        if (hel) hel.classList.add("counter-highlight");
      });
      const doneBtn = document.createElement("button");
      doneBtn.className = "btn";
      doneBtn.textContent = "Done";
      doneBtn.addEventListener("click", () => sendCounterChoice(null));
      actionsEl.appendChild(doneBtn);
    } else {
      actionsEl.innerHTML = `<span class="attack-prompt-text">CPU is deciding…</span>`;
    }
    return;
  }

  if (pending === "TRIGGER_ACTIVATION") {
    textEl.textContent = "Activate Trigger?";
    if (defenderKey === viewer) {
      actionsEl.innerHTML = "";
      const yesBtn = document.createElement("button");
      yesBtn.className = "btn primary";
      yesBtn.textContent = "Activate Trigger";
      yesBtn.addEventListener("click", () => sendTriggerChoice(true));
      actionsEl.appendChild(yesBtn);
      const noBtn = document.createElement("button");
      noBtn.className = "btn";
      noBtn.textContent = "Decline";
      noBtn.addEventListener("click", () => sendTriggerChoice(false));
      actionsEl.appendChild(noBtn);
    } else {
      actionsEl.innerHTML = `<span class="attack-prompt-text">CPU is deciding…</span>`;
    }
    return;
  }

  if (aa.resolved) {
    promptEl.classList.add("resolved");
    textEl.textContent = attackBannerText(aa);
    actionsEl.innerHTML = "";
    return;
  }

  // Default subphase display
  textEl.textContent = attackBannerText(aa);
  actionsEl.innerHTML = "";
}

async function sendBlockerChoice(blockerCardId) {
  if (actionInFlight) return;
  actionInFlight = true;
  try {
    const res = await api(`/api/game/${gameId}/attack/blocker`, { blocker_card_id: blockerCardId });
    state = res.state;
    syncModeFromState();
    render();
  } catch (err) {
    setMessage(`Blocker error: ${err.message}`);
    await loadGame();
  } finally {
    actionInFlight = false;
    scheduleAutoStep();
  }
}

async function promptCounterTarget(counterCard) {
  return new Promise((resolve) => {
    const meKey = isCpuVsCpu ? "player" : viewer;
    const me = state.players[meKey];
    const leader = me?.leader;
    const characters = me?.characters || [];

    // Remove any existing modal
    const existing = document.querySelector(".counter-target-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.className = "counter-target-modal card-modal";

    const panel = document.createElement("div");
    panel.className = "card-modal-panel counter-target-panel";
    panel.innerHTML = `<button class="card-modal-close" type="button">×</button><div class="counter-target-header"><strong>Select target for ${escapeHtml(counterCard.card_name || counterCard.card_code)}</strong></div>`;

    const grid = document.createElement("div");
    grid.className = "counter-target-grid";

    const targets = [];
    if (leader) targets.push({ card: leader, label: "Leader" });
    characters.forEach((c, i) => {
      if (c) targets.push({ card: c, label: `Character ${i + 1}` });
    });

    if (targets.length === 0) {
      const emptyMsg = document.createElement("p");
      emptyMsg.style.color = "var(--muted)";
      emptyMsg.textContent = "No valid targets available.";
      grid.appendChild(emptyMsg);
    }

    targets.forEach(({ card, label }) => {
      const wrapper = cardEl(card, { draggable: false, overlay: label });
      wrapper.style.cursor = "pointer";
      wrapper.addEventListener("click", () => {
        modal.remove();
        resolve(card.card_id);
      });
      const item = document.createElement("div");
      item.className = "counter-target-item";
      item.appendChild(wrapper);
      grid.appendChild(item);
    });

    panel.appendChild(grid);
    modal.appendChild(document.createElement("div")).className = "card-modal-backdrop";
    modal.appendChild(panel);

    const cleanup = () => {
      modal.remove();
      resolve(null);
    };

    modal.querySelector(".card-modal-close").addEventListener("click", cleanup);
    modal.addEventListener("click", (ev) => {
      if (ev.target.classList.contains("card-modal") || ev.target.classList.contains("card-modal-backdrop")) {
        cleanup();
      }
    });
    document.addEventListener("keydown", function onEsc(ev) {
      if (ev.key === "Escape") {
        cleanup();
        document.removeEventListener("keydown", onEsc);
      }
    });

    document.body.appendChild(modal);
  });
}

async function sendCounterChoice(counterCardId) {
  if (actionInFlight) return;
  actionInFlight = true;
  try {
    let payload;
    if (!counterCardId) {
      payload = { pass: true };
    } else {
      // Find the counter card to check if it's an event counter
      const meKey = isCpuVsCpu ? "player" : viewer;
      const me = state.players[meKey];
      const counterCard = (me.hand || []).find(c => c.card_id === counterCardId);
      const isEventCounter = counterCard && (counterCard.card_type || "").toUpperCase() === "EVENT";

      if (isEventCounter) {
        // Prompt for target selection
        const targetCardId = await promptCounterTarget(counterCard);
        if (!targetCardId) {
          // User cancelled target selection; abort counter without sending
          actionInFlight = false;
          return;
        }
        payload = { counter_card_id: counterCardId, target_card_id: targetCardId };
      } else {
        // Character counter — discard, no target needed
        payload = { counter_card_id: counterCardId };
      }
    }
    const res = await api(`/api/game/${gameId}/attack/counter`, payload);
    state = res.state;
    syncModeFromState();
    render();
  } catch (err) {
    setMessage(`Counter error: ${err.message}`);
    await loadGame();
  } finally {
    actionInFlight = false;
    scheduleAutoStep();
  }
}

async function sendTriggerChoice(activate) {
  if (actionInFlight) return;
  actionInFlight = true;
  try {
    const res = await api(`/api/game/${gameId}/attack/trigger`, { activate });
    state = res.state;
    syncModeFromState();
    render();
  } catch (err) {
    setMessage(`Trigger error: ${err.message}`);
    await loadGame();
  } finally {
    actionInFlight = false;
    scheduleAutoStep();
  }
}

function renderPhaseBtn() {
  const phaseBtn = els.phaseBtn;
  if (!phaseBtn) return;
  const canStartTurn = state.phase === "refresh" && state.turn_player === viewer && !state.winner && !isCpuVsCpu;
  if (canStartTurn) {
    phaseBtn.style.display = "";
    phaseBtn.textContent = "Start Turn";
    phaseBtn.disabled = false;
  } else {
    phaseBtn.style.display = "none";
  }
}

function setLifeCountClass(el, count) {
  if (!el) return;
  el.classList.remove("life-high", "life-low", "life-zero");
  if (count <= 0) el.classList.add("life-zero");
  else if (count <= 2) el.classList.add("life-low");
  else el.classList.add("life-high");
}

function renderPiles(player, side) {
  document.getElementById(`${side}-deck-count`).textContent = player.deck?.length ?? 0;
  const lifeCount = document.getElementById(`${side}-life-count`);
  const lifeValue = player.life?.length ?? 0;
  lifeCount.textContent = lifeValue;
  setLifeCountClass(lifeCount, lifeValue);
  const donCount = document.getElementById(`${side}-don-count`);
  donCount.textContent = formatDonCount(player);
  document.getElementById(`${side}-trash-count`).textContent = player.trash?.length ?? 0;

  // Render DON pips in the DON area (just above hand) for player side
  if (side === "player") {
    const donArea = document.getElementById("player-don-area");
    if (donArea) {
      donArea.innerHTML = "";
      const active = Number(player.don_active || 0);
      const rested = Number(player.don_rested || 0);
      for (let i = 0; i < active; i++) {
        const pip = document.createElement("span");
        pip.className = "don-pip active";
        pip.title = "Active DON!! — drag to your Leader/Character to attach";
        if (!isCpuVsCpu) {
          pip.draggable = true;
          pip.dataset.source = "don";
          pip.dataset.index = String(i);
          pip.addEventListener("dragstart", onDragStart);
        }
        donArea.appendChild(pip);
      }
      for (let i = 0; i < rested; i++) {
        const pip = document.createElement("span");
        pip.className = "don-pip rested";
        pip.title = "Rested/spent DON!!";
        donArea.appendChild(pip);
      }
    }
  }
  // Also render pips in the pile zone for opponent
  if (side !== "player") {
    const donArea = document.getElementById("opponent-don-area");
    if (donArea) {
      donArea.innerHTML = "";
      const active = Number(player.don_active || 0);
      const rested = Number(player.don_rested || 0);
      for (let i = 0; i < active; i++) {
        const pip = document.createElement("span");
        pip.className = "don-pip active";
        pip.title = "Active DON!!";
        donArea.appendChild(pip);
      }
      for (let i = 0; i < rested; i++) {
        const pip = document.createElement("span");
        pip.className = "don-pip rested";
        pip.title = "Rested/spent DON!!";
        donArea.appendChild(pip);
      }
    }
  }
}

function renderLeader(player, side) {
  const zone = document.getElementById(`${side}-leader`);
  zone.innerHTML = "";
  if (player.leader) {
    const isMine = side === "player" && !isCpuVsCpu;
    const leaderData = { ...player.leader, rested: player.leader_rested || player.leader.rested };
    const leaderCard = cardEl(leaderData, { className: "leader-card", draggable: false, overlay: `Life ${player.life?.length ?? 0}`, source: isMine ? "leader" : "opponent-leader" });
    zone.appendChild(leaderCard);
  }
  zone.dataset.zone = `${side}-leader`;
  const trashZone = document.querySelector(`[data-zone="${side}-trash"]`);
  if (trashZone && !trashZone.dataset.clickSet) {
    trashZone.dataset.clickSet = "1";
    trashZone.style.cursor = "pointer";
    trashZone.addEventListener("click", () => {
      const p = state.players[side === "player" ? (isCpuVsCpu ? "player" : viewer) : opponentKey()];
      showTrash(p.trash || [], `${side === "player" ? "Player" : "CPU"} Trash`);
    });
  }
}

function renderStage(player, side) {
  const zone = document.getElementById(`${side}-stage`);
  if (!zone) return;
  zone.innerHTML = "";
  const stages = player.stages || [];
  if (stages.length > 0) {
    const stageData = stages[0];
    const isMine = side === "player" && !isCpuVsCpu;
    const stageCard = cardEl(stageData, {
      className: "stage-card",
      draggable: false,
      source: isMine ? "stage" : "opponent-stage"
    });
    zone.appendChild(stageCard);
  }
  zone.dataset.zone = `${side}-stage`;
}

function renderCharacters(player, side) {
  const row = document.getElementById(`${side}-characters`);
  const chars = player.characters || [];
  for (let i = 0; i < 5; i++) {
    const slot = row.children[i];
    if (!slot) continue;
    slot.innerHTML = "";
    slot.dataset.zone = `${side}-char-${i}`;
    if (chars[i]) {
      const c = chars[i];
      const totalPower = (Number(c.power) || 0) + (c.attached_don?.length || 0) * 1000;
      const isMine = side === "player" && !isCpuVsCpu;
      const wrapper = cardEl(c, { source: isMine ? "character" : "opponent-char", index: i, overlay: `${totalPower}`, draggable: isMine });
      slot.appendChild(wrapper);
    }
  }
}

function renderHand(player, containerId, isPlayer) {
  const hand = document.getElementById(containerId);
  if (!hand) return;
  hand.innerHTML = "";
  (player.hand || []).forEach((card, i) => {
    hand.appendChild(cardEl(card, { source: isPlayer ? "hand" : "opponent-hand", index: i, inHand: true, overlay: `Cost ${card.cost || 0}`, draggable: isPlayer }));
  });
}

function renderLog() {
  els.log.innerHTML = (state.log || []).slice(-20).map((entry) => `<div class="entry">${escapeHtml(entry)}</div>`).join("");
  els.log.scrollTop = els.log.scrollHeight;
}

function showTrash(trash, title) {
  const existing = document.querySelector(".card-modal");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.className = "card-modal";
  const panel = document.createElement("div");
  panel.className = "card-modal-panel trash-panel";
  panel.innerHTML = `<button class="card-modal-close" type="button">×</button><div class="trash-header"><strong>${escapeHtml(title)}</strong></div>`;
  if (trash.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.style.color = "var(--muted)";
    emptyMsg.textContent = "Trash is empty.";
    panel.appendChild(emptyMsg);
  } else {
    const grid = document.createElement("div");
    grid.className = "trash-grid";
    for (const c of trash) {
      const wrapper = cardEl(c, { className: "trash-card", draggable: false });
      const item = document.createElement("div");
      item.className = "trash-item";
      item.appendChild(wrapper);
      grid.appendChild(item);
    }
    panel.appendChild(grid);
  }
  modal.appendChild(document.createElement("div")).className = "card-modal-backdrop";
  modal.appendChild(panel);
  modal.addEventListener("click", (ev) => {
    if (ev.target.classList.contains("card-modal") || ev.target.classList.contains("card-modal-backdrop") || ev.target.classList.contains("card-modal-close")) {
      modal.remove();
    }
  });
  document.addEventListener("keydown", function onEsc(ev) {
    if (ev.key === "Escape") {
      modal.remove();
      document.removeEventListener("keydown", onEsc);
    }
  });
  document.body.appendChild(modal);
}

function setMessage(msg) {
  els.message.textContent = msg;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

// Event wiring
document.querySelectorAll(".char-slot, .leader-zone, .don-zone, .stage-zone").forEach((el) => {
  el.addEventListener("dragover", allowDrop);
  el.addEventListener("dragleave", leaveDrop);
  el.addEventListener("drop", onDrop);
});

// Log show/hide toggle — persists in localStorage for mobile-friendly play
(function setupLogToggle() {
  const board = document.getElementById("board");
  const panel = document.getElementById("info-panel");
  const toggle = document.getElementById("log-toggle");
  if (!board || !panel || !toggle) return;
  if (localStorage.getItem("optcg-log-hidden") === "1") {
    board.classList.add("logs-collapsed");
    panel.classList.add("collapsed");
    toggle.textContent = "📜";
    toggle.title = "Show logs";
  }
  toggle.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("collapsed");
    board.classList.toggle("logs-collapsed", collapsed);
    toggle.textContent = collapsed ? "📜" : "👁️";
    toggle.title = collapsed ? "Show logs" : "Hide logs";
    localStorage.setItem("optcg-log-hidden", collapsed ? "1" : "0");
  });
})();

els.backBtn.addEventListener("click", () => { location.href = "./"; });

els.passBtn.addEventListener("click", async () => {
  if (!state || state.turn_player !== viewer || isCpuVsCpu) return;
  await sendAction({ type: "pass", player: viewer }, { single_step: true });
});

if (els.phaseBtn) {
  els.phaseBtn.addEventListener("click", async () => {
    if (!state || isCpuVsCpu || state.turn_player !== viewer || state.phase !== "refresh") return;
    await sendAction({ type: "pass", player: viewer }, { single_step: true });
  });
}

els.mulliganKeep.addEventListener("click", async () => {
  await api(`/api/game/${gameId}/mulligan`, { player: viewer, keep: true });
  await loadGame();
});

els.mulliganRedraw.addEventListener("click", async () => {
  await api(`/api/game/${gameId}/mulligan`, { player: viewer, keep: false });
  await loadGame();
});

if (!gameId) {
  els.loading.textContent = "No game_id in URL. Start a match from the main app.";
} else {
  loadGame();
}

// Polling fallback in case auto-step gets stuck.
setInterval(() => {
  if (!state || state.winner || state.phase === "mulligan" || document.hidden) return;
  if (isCpuVsCpu || state.turn_player === "cpu") {
    sendAction(null).catch(() => {});
  }
}, 3000);
