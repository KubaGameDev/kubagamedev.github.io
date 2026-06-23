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
  // Attached DON pips under card
  const attachedDon = card.attached_don || [];
  if (attachedDon.length > 0) {
    const strip = document.createElement("div");
    strip.className = "attached-don-strip";
    attachedDon.forEach(() => {
      const pip = document.createElement("span");
      pip.className = "attached-don-pip";
      pip.title = "Attached DON!! (+1000 power)";
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
    if (gizmoState) {
      ev.stopPropagation();
      return onGizmoTargetClick(wrapper, card, opts);
    }
    ev.stopPropagation();
    openCardModal(card, opts);
  });
  return wrapper;
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

function openCardModal(card, context = {}) {
  const existing = document.querySelector(".card-modal");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.className = "card-modal";
  const imgSrc = getImageUrl(card) || placeholderSvg(card);

  const isMine = context.source === "hand" || context.source === "character" || context.source === "leader";
  const isMain = state && state.phase === "main" && state.turn_player === viewer && !state.winner && !isCpuVsCpu;
  const me = state ? state.players[viewer] : null;

  let buttonsHtml = "";
  if (isMine && isMain) {
    if (context.source === "hand" && (card.card_type || "").toUpperCase() === "CHARACTER") {
      buttonsHtml += `<button class="btn primary modal-action" data-action="play" data-index="${context.index ?? 0}">Play</button>`;
    }
    if ((context.source === "character" || context.source === "leader") && me && me.don_active > 0) {
      buttonsHtml += `<button class="btn primary modal-action" data-action="attach" data-target="${context.source}" data-index="${context.index ?? 0}">+1 DON!!</button>`;
    }
    if ((context.source === "character" || context.source === "leader") && canAttackFromContext(card, context)) {
      buttonsHtml += `<button class="btn danger modal-action" data-action="attack" data-target="${context.source}" data-index="${context.index ?? 0}">Attack</button>`;
    }
    if (card.effect && card.effect.includes("[Activate: Main]")) {
      buttonsHtml += `<button class="btn modal-action" data-action="activate">Activate Ability</button>`;
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
        <span>Cost ${escapeHtml(card?.cost || "—")} · Power ${escapeHtml(card?.power || "—")} · Counter ${escapeHtml(card?.counter || "—")}</span>
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

function canAttackFromContext(card, context) {
  if (!card) return false;
  if (card.rested || card.leader_rested) return false;
  if (context.source === "character" && card.played_this_turn && !card.rush) return false;
  return true;
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
    sendAction({
      type: "attack",
      player: viewer,
      attacker_type: gizmoState.fromType,
      ...(gizmoState.fromType === "character" ? { attacker_index: gizmoState.fromIndex } : {}),
      target: "player",
    });
  } else if (zone.startsWith("opponent-char-")) {
    const slot = parseInt(zone.split("-").pop(), 10);
    if (card.rested) {
      sendAction({
        type: "attack",
        player: viewer,
        attacker_type: gizmoState.fromType,
        ...(gizmoState.fromType === "character" ? { attacker_index: gizmoState.fromIndex } : {}),
        target: "character",
        target_index: slot,
      });
    } else {
      setMessage("You can only attack rested characters.");
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
});

function onDragStart(ev) {
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
  ev.preventDefault();
  const target = ev.currentTarget;
  if (target.classList.contains("char-slot") || target.classList.contains("leader-zone") || target.classList.contains("don-zone")) {
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
  await sendAction(action);
}

function dropToAction(data, zone) {
  if (!state || state.turn_player !== viewer || state.phase !== "main" || isCpuVsCpu) return null;
  const me = state.players[viewer];

  if (data.source === "hand" && zone.startsWith(`${viewer}-char-`)) {
    const card = me.hand[parseInt(data.index, 10)];
    if (!card || (card.card_type || "").toUpperCase() !== "CHARACTER") return null;
    return { type: "play", player: viewer, card_index: parseInt(data.index, 10) };
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

async function sendAction(action) {
  if (actionInFlight) return;
  actionInFlight = true;
  try {
    const res = await api(`/api/game/${gameId}/step`, action ? { action } : {});
    state = res.state;
    syncModeFromState();
    render();
    scheduleAutoStep();
  } catch (err) {
    setMessage(`Action error: ${err.message}`);
  } finally {
    actionInFlight = false;
  }
}

let autoStepTimer = null;
function scheduleAutoStep() {
  if (autoStepTimer) return;
  const phase = state?.phase;
  const isResourcePhase = phase === "refresh" || phase === "draw" || phase === "don";
  // In PvCPU, only auto-step CPU turns. Player must manually click phase button.
  const needsStep = isCpuVsCpu
    ? (!state?.winner && phase !== "mulligan")
    : (!state?.winner && phase !== "mulligan" && state?.turn_player === "cpu");
  if (!needsStep) return;
  autoStepTimer = setTimeout(() => {
    autoStepTimer = null;
    if (!state || state.winner || state.phase === "mulligan") return;
    // Only auto-step CPU turns or CPU-vs-CPU
    if (isCpuVsCpu || state.turn_player === "cpu") {
      sendAction(null).catch(() => {});
    }
  }, 600);
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

  els.turnNumber.textContent = state.turn_number;
  els.turnPlayer.textContent = state.turn_player === "player" ? "Player" : "CPU";
  els.phase.textContent = state.phase;

  renderPiles(me, "player");
  renderPiles(opp, "opponent");
  renderLeader(me, "player");
  renderLeader(opp, "opponent");
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

  if (state.phase === "mulligan") {
    const needMulligan = !state.mulligan_done?.[meKey];
    els.mulliganPanel.classList.toggle("active", needMulligan);
    els.passBtn.disabled = true;
    els.mulliganText.textContent = needMulligan
      ? `Keep or mulligan your opening hand (${me.hand.length} cards).`
      : "Waiting for opponent mulligan...";
  } else {
    els.mulliganPanel.classList.remove("active");
    els.passBtn.disabled = isCpuVsCpu || state.turn_player !== viewer || state.phase !== "main";
  }

  if (state.winner) {
    setMessage(`🎉 ${state.winner === "player" ? "Player" : "CPU"} wins!`);
    els.passBtn.disabled = true;
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

function renderPiles(player, side) {
  document.getElementById(`${side}-deck-count`).textContent = player.deck?.length ?? 0;
  document.getElementById(`${side}-life-count`).textContent = player.life?.length ?? 0;
  const donCount = document.getElementById(`${side}-don-count`);
  donCount.textContent = `${player.don_active ?? 0}+${player.don_rested ?? 0}/${player.don_total ?? 0} (${player.don_deck ?? 0})`;
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
document.querySelectorAll(".char-slot, .leader-zone, .don-zone").forEach((el) => {
  el.addEventListener("dragover", allowDrop);
  el.addEventListener("dragleave", leaveDrop);
  el.addEventListener("drop", onDrop);
});

els.backBtn.addEventListener("click", () => { location.href = "./"; });

els.passBtn.addEventListener("click", async () => {
  if (!state || state.turn_player !== viewer || isCpuVsCpu) return;
  await sendAction({ type: "pass", player: viewer });
});

if (els.phaseBtn) {
  els.phaseBtn.addEventListener("click", async () => {
    if (!state || isCpuVsCpu || state.turn_player !== viewer || state.phase !== "refresh") return;
    await sendAction({ type: "pass", player: viewer });
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
