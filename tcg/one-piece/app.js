const STORAGE_KEY = "jumpkat.optcg.collection.v1";
const DECK_STORAGE_KEY = "jumpkat.optcg.deck.v1";
const BACKEND_STORAGE_KEY = "jumpkat.optcg.backendUrl.v1";
const SEED_URL = "./data/collection.seed.json";
const STARTER_DECKS_URL = "./data/starter-decks.mvp.json";
const CONFIG = window.OPTCG_CONFIG || {};
let API_BASE_URL = String(localStorage.getItem(BACKEND_STORAGE_KEY) || CONFIG.apiBaseUrl || "").replace(/\/$/, "");
let USE_API = Boolean(API_BASE_URL);

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.error || `API request failed with ${response.status}`);
  }
  return payload;
}

const state = {
  rows: [],
  selectedId: "",
  search: "",
  statusFilter: "",
  colourFilter: "",
  sortColumn: "card_code",
  sortDirection: "asc",
  activeSection: "collection-section",
  deck: { leaderId: "", cards: [], presetId: "", presetDeck: null },
  starterDecks: [],
  validation: null,
  game: null,
};

const fields = [
  "card_code",
  "official_entry_id",
  "print_version",
  "official_group_id",
  "quantity",
  "variant_notes",
  "card_name",
  "colour",
  "set_code",
  "official_set_label",
  "official_source_url",
  "official_image_url",
  "card_type",
  "rarity",
  "life",
  "cost",
  "power",
  "verification_status",
  "verification_notes",
  "language",
  "cardmarket_avg_50_gbp",
  "cardmarket_lowest_gbp",
  "cardmarket_sample_count",
  "cardmarket_avg_50_eur",
  "cardmarket_lowest_eur",
  "cardmarket_url",
  "cardmarket_status",
  "ebay_sold_avg_20_gbp",
  "ebay_sold_lowest_gbp",
  "ebay_sample_count",
  "ebay_url",
  "ebay_status",
  "created_at",
  "updated_at",
  "last_refreshed_at",
  "status",
];

const elements = {
  cardmarketTotal: document.getElementById("cardmarket-total"),
  ebayTotal: document.getElementById("ebay-total"),
  quantityTotal: document.getElementById("quantity-total"),
  uniqueRows: document.getElementById("unique-rows"),
  searchInput: document.getElementById("search-input"),
  clearFiltersButton: document.getElementById("clear-filters-button"),
  filterSummary: document.getElementById("filter-summary"),
  facetFilters: document.getElementById("facet-filters"),
  tableBody: document.getElementById("card-table-body"),
  detailPanel: document.querySelector(".detail-panel"),
  detailHeading: document.getElementById("detail-heading"),
  detailContent: document.getElementById("detail-content"),
  hideDetailButton: document.getElementById("hide-detail-button"),
  editCardButton: document.getElementById("edit-card-button"),
  deleteCardButton: document.getElementById("delete-card-button"),
  addCardButton: document.getElementById("add-card-button"),
  exportButton: document.getElementById("export-button"),
  importInput: document.getElementById("import-file-input"),
  resetSampleButton: document.getElementById("reset-sample-button"),
  modalBackdrop: document.getElementById("modal-backdrop"),
  modalTitle: document.getElementById("modal-title"),
  cardForm: document.getElementById("card-form"),
  formStatus: document.getElementById("form-status"),
  closeModalButton: document.getElementById("close-modal-button"),
  cancelModalButton: document.getElementById("cancel-modal-button"),
  backendUrlInput: document.getElementById("backend-url-input"),
  saveBackendUrlButton: document.getElementById("save-backend-url-button"),
  useLocalBackendButton: document.getElementById("use-local-backend-button"),
  backendStatus: document.getElementById("backend-status"),
  navButtons: document.querySelectorAll(".app-nav-button"),
  sections: document.querySelectorAll(".app-section"),
  leaderSelect: document.getElementById("leader-select"),
  starterDeckSelect: document.getElementById("starter-deck-select"),
  loadStarterDeckButton: document.getElementById("load-starter-deck-button"),
  starterDeckNote: document.getElementById("starter-deck-note"),
  deckCardSelect: document.getElementById("deck-card-select"),
  deckQtyInput: document.getElementById("deck-card-qty-input"),
  addDeckCardButton: document.getElementById("add-deck-card-button"),
  clearDeckButton: document.getElementById("clear-deck-button"),
  validateDeckButton: document.getElementById("validate-deck-button"),
  deckLeaderSummary: document.getElementById("deck-leader-summary"),
  deckCountSummary: document.getElementById("deck-count-summary"),
  deckValidationSummary: document.getElementById("deck-validation-summary"),
  deckList: document.getElementById("deck-list"),
  deckValidationOutput: document.getElementById("deck-validation-output"),
  startSimButton: document.getElementById("start-sim-button"),
  passTurnButton: document.getElementById("pass-turn-button"),
  simTurnPlayer: document.getElementById("sim-turn-player"),
  simPhase: document.getElementById("sim-phase"),
  simTurnNumber: document.getElementById("sim-turn-number"),
  simPlayerZones: document.getElementById("sim-player-zones"),
  simLog: document.getElementById("sim-log"),
};

function normalizeText(value) {
  return (value ?? "").toString().trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function rowId(row) {
  return [
    row.card_code,
    row.official_entry_id,
    row.print_version || "V.1",
    row.variant_notes,
    row.language || "English",
  ].map((part) => normalizeText(part)).join("||");
}

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "£0.00";
  return `£${number.toFixed(2)}`;
}

function dateLabel(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "—";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function statusLabel(status) {
  return normalizeText(status || "needs_review").replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function coerceRow(raw) {
  const row = {};
  for (const field of fields) row[field] = normalizeText(raw?.[field]);
  row.card_code = row.card_code.toUpperCase();
  row.print_version = row.print_version || "V.1";
  row.language = row.language || "English";
  row.quantity = String(Math.max(1, Number.parseInt(row.quantity || "1", 10) || 1));
  row.status = row.status || "needs_review";
  row.updated_at = row.updated_at || new Date().toISOString();
  row.created_at = row.created_at || row.updated_at;
  return row;
}

async function loadSeedRows() {
  const response = await fetch(SEED_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load seed collection (${response.status})`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload.map(coerceRow) : (payload.rows || []).map(coerceRow);
}

async function loadStarterDecks() {
  const response = await fetch(STARTER_DECKS_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load starter decks (${response.status})`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : (payload.decks || []);
}

async function loadRows() {
  if (USE_API) {
    const payload = await apiFetch("/api/collection");
    return (payload.rows || []).map(coerceRow);
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const payload = JSON.parse(stored);
      return (Array.isArray(payload) ? payload : payload.rows || []).map(coerceRow);
    } catch (error) {
      console.warn("Stored collection was invalid; falling back to seed data.", error);
    }
  }
  return loadSeedRows();
}

function saveRows() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: 1,
    saved_at: new Date().toISOString(),
    rows: state.rows,
  }, null, 2));
}

function visibleRows() {
  const query = state.search.toLowerCase();
  const rows = state.rows.filter((row) => {
    if (state.statusFilter && row.status !== state.statusFilter) return false;
    if (state.colourFilter && row.colour !== state.colourFilter) return false;
    if (!query) return true;
    const haystack = [
      row.card_code,
      row.card_name,
      row.colour,
      row.card_type,
      row.rarity,
      row.set_code,
      row.variant_notes,
      row.status,
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  rows.sort((left, right) => {
    const column = state.sortColumn;
    const leftValue = column.includes("gbp") || column === "quantity" ? Number(left[column] || 0) : normalizeText(left[column]).toLowerCase();
    const rightValue = column.includes("gbp") || column === "quantity" ? Number(right[column] || 0) : normalizeText(right[column]).toLowerCase();
    if (leftValue < rightValue) return state.sortDirection === "asc" ? -1 : 1;
    if (leftValue > rightValue) return state.sortDirection === "asc" ? 1 : -1;
    return 0;
  });
  return rows;
}

function renderSummary() {
  const totals = state.rows.reduce((acc, row) => {
    const quantity = Number(row.quantity || 0) || 0;
    acc.quantity += quantity;
    acc.cardmarket += quantity * (Number(row.cardmarket_avg_50_gbp || 0) || 0);
    acc.ebay += quantity * (Number(row.ebay_sold_avg_20_gbp || 0) || 0);
    return acc;
  }, { quantity: 0, cardmarket: 0, ebay: 0 });
  elements.cardmarketTotal.textContent = money(totals.cardmarket);
  elements.ebayTotal.textContent = money(totals.ebay);
  elements.quantityTotal.textContent = String(totals.quantity);
  elements.uniqueRows.textContent = String(state.rows.length);
}

function renderFacets() {
  const statuses = [...new Set(state.rows.map((row) => row.status).filter(Boolean))].sort();
  const colours = [...new Set(state.rows.map((row) => row.colour).filter(Boolean))].sort();
  const statusButtons = statuses.map((status) => `<button class="facet-pill ${state.statusFilter === status ? "is-active" : ""}" type="button" data-status="${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</button>`).join("");
  const colourButtons = colours.map((colour) => `<button class="facet-pill ${state.colourFilter === colour ? "is-active" : ""}" type="button" data-colour="${escapeHtml(colour)}">${escapeHtml(colour)}</button>`).join("");
  elements.facetFilters.innerHTML = `
    <div class="facet-group"><h3>Status</h3><div class="facet-options">${statusButtons || "<span class='preview-empty'>No statuses yet.</span>"}</div></div>
    <div class="facet-group"><h3>Colour</h3><div class="facet-options">${colourButtons || "<span class='preview-empty'>No colours yet.</span>"}</div></div>
  `;
  elements.facetFilters.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => {
      state.statusFilter = state.statusFilter === button.dataset.status ? "" : button.dataset.status;
      renderAll();
    });
  });
  elements.facetFilters.querySelectorAll("[data-colour]").forEach((button) => {
    button.addEventListener("click", () => {
      state.colourFilter = state.colourFilter === button.dataset.colour ? "" : button.dataset.colour;
      renderAll();
    });
  });
}

function renderTable() {
  const rows = visibleRows();
  elements.filterSummary.textContent = `Showing ${rows.length} of ${state.rows.length} card rows.`;
  if (!rows.length) {
    elements.tableBody.innerHTML = `<tr><td colspan="9" class="empty-state">No matching cards.</td></tr>`;
    return;
  }
  elements.tableBody.innerHTML = rows.map((row) => {
    const id = rowId(row);
    return `
      <tr class="card-row ${state.selectedId === id ? "is-selected" : ""}" data-row-id="${escapeHtml(id)}">
        <td class="col-status"><span class="status-dot status-${escapeHtml(row.status || "needs_review")}" title="${escapeHtml(statusLabel(row.status))}"></span></td>
        <td class="col-code"><strong>${escapeHtml(row.card_code || "—")}</strong><span>${escapeHtml(row.print_version || "V.1")}</span></td>
        <td class="col-rarity">${escapeHtml(row.rarity || "—")}</td>
        <td class="col-name">${escapeHtml(row.card_name || "Unnamed card")}</td>
        <td class="col-qty">${escapeHtml(row.quantity || "0")}</td>
        <td class="col-colour">${escapeHtml(row.colour || "—")}</td>
        <td class="col-recent">${escapeHtml(dateLabel(row.updated_at || row.last_refreshed_at))}</td>
        <td class="col-price">${money(row.cardmarket_avg_50_gbp)}</td>
        <td class="col-price">${money(row.ebay_sold_avg_20_gbp)}</td>
      </tr>
    `;
  }).join("");
  elements.tableBody.querySelectorAll("[data-row-id]").forEach((rowElement) => {
    rowElement.addEventListener("click", () => {
      state.selectedId = rowElement.dataset.rowId;
      renderAll();
    });
  });
}

function selectedRow() {
  return state.rows.find((row) => rowId(row) === state.selectedId) || null;
}

function detailField(label, value) {
  return `<div class="detail-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`;
}

function renderDetails() {
  const row = selectedRow();
  if (!row) {
    elements.detailPanel.classList.add("is-hidden");
    elements.hideDetailButton.disabled = true;
    elements.editCardButton.disabled = true;
    elements.deleteCardButton.disabled = true;
    return;
  }
  elements.detailPanel.classList.remove("is-hidden");
  elements.hideDetailButton.disabled = false;
  elements.editCardButton.disabled = false;
  elements.deleteCardButton.disabled = false;
  elements.detailHeading.textContent = row.card_name || row.card_code || "Selected Card";
  const image = row.official_image_url ? `<img class="detail-image" src="${escapeHtml(row.official_image_url)}" alt="${escapeHtml(row.card_name || row.card_code)}">` : "";
  elements.detailContent.innerHTML = `
    ${image}
    <div class="detail-grid">
      ${detailField("Code", row.card_code)}
      ${detailField("Quantity", row.quantity)}
      ${detailField("Version", row.print_version)}
      ${detailField("Language", row.language)}
      ${detailField("Colour", row.colour)}
      ${detailField("Type", row.card_type)}
      ${detailField("Rarity", row.rarity)}
      ${detailField("Set", row.official_set_label || row.set_code)}
      ${detailField("Life", row.life)}
      ${detailField("Cost", row.cost)}
      ${detailField("Power", row.power)}
      ${detailField("Cardmarket", money(row.cardmarket_avg_50_gbp))}
      ${detailField("eBay Sold", money(row.ebay_sold_avg_20_gbp))}
      ${detailField("Status", statusLabel(row.status))}
    </div>
    ${row.variant_notes ? `<p class="detail-notes"><strong>Notes:</strong> ${escapeHtml(row.variant_notes)}</p>` : ""}
  `;
}

function renderSortIndicators() {
  document.querySelectorAll(".table-sort").forEach((button) => {
    const indicator = button.querySelector(".sort-indicator");
    if (!indicator) return;
    indicator.textContent = button.dataset.sortColumn === state.sortColumn ? (state.sortDirection === "asc" ? "↑" : "↓") : "↕";
  });
}

function deckCardFromRow(row, quantity = null) {
  return {
    card_code: row.card_code,
    card_name: row.card_name,
    card_type: row.card_type,
    colour: row.colour,
    quantity: quantity ?? (Number(row.quantity || 1) || 1),
    life: row.life,
    cost: row.cost,
    power: row.power,
  };
}

function deckPayload() {
  if (state.deck.presetDeck) {
    return {
      name: state.deck.presetDeck.label || state.deck.presetDeck.product_name || "Starter Preset",
      leader: state.deck.presetDeck.leader,
      cards: state.deck.presetDeck.cards || [],
      preset_id: state.deck.presetDeck.id,
      source_url: state.deck.presetDeck.source_url,
    };
  }
  const leader = state.rows.find((row) => rowId(row) === state.deck.leaderId);
  return {
    name: "Browser Deck",
    leader: leader ? deckCardFromRow(leader, 1) : {},
    cards: state.deck.cards.map((entry) => {
      const row = state.rows.find((candidate) => rowId(candidate) === entry.rowId);
      return row ? deckCardFromRow(row, entry.quantity) : null;
    }).filter(Boolean),
  };
}

function saveDeck() {
  localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(state.deck, null, 2));
}

function loadDeck() {
  try {
    const stored = JSON.parse(localStorage.getItem(DECK_STORAGE_KEY) || "{}");
    if (stored && Array.isArray(stored.cards)) {
      state.deck = { leaderId: stored.leaderId || "", cards: stored.cards, presetId: stored.presetId || "", presetDeck: stored.presetDeck || null };
    }
  } catch (error) {
    console.warn("Stored deck was invalid; starting fresh.", error);
  }
}

function localDeckCheck(deck) {
  const errors = [];
  const leaderColours = normalizeText(deck.leader?.colour).toLowerCase().split(/[\/,-]/).map((part) => part.trim()).filter(Boolean);
  const count = deck.cards.reduce((total, card) => total + (Number(card.quantity || 0) || 0), 0);
  if (!deck.leader?.card_code) errors.push("Choose a leader.");
  if (deck.leader?.card_type && normalizeText(deck.leader.card_type).toUpperCase() !== "LEADER") errors.push("Selected leader row is not typed as LEADER.");
  if (count !== 50) errors.push(`Main deck has ${count} cards; expected 50.`);
  for (const card of deck.cards) {
    const qty = Number(card.quantity || 0) || 0;
    if (qty > 4) errors.push(`${card.card_code} has ${qty} copies; maximum is 4.`);
    const colour = normalizeText(card.colour).toLowerCase();
    if (colour && leaderColours.length && !leaderColours.includes(colour)) errors.push(`${card.card_code} has colour ${colour} outside leader colours ${leaderColours.join(", ")}.`);
  }
  return { is_legal: errors.length === 0, main_deck_count: count, leader_colours: leaderColours, errors, warnings: USE_API ? [] : ["Local browser check only; backend validator is preferred."] };
}

function setBackendUrl(url) {
  API_BASE_URL = String(url || "").trim().replace(/\/$/, "");
  USE_API = Boolean(API_BASE_URL);
  if (USE_API) localStorage.setItem(BACKEND_STORAGE_KEY, API_BASE_URL);
  else localStorage.removeItem(BACKEND_STORAGE_KEY);
  renderBackendStatus();
}

async function renderBackendStatus() {
  if (elements.backendUrlInput) elements.backendUrlInput.value = API_BASE_URL;
  if (!elements.backendStatus) return;
  if (!USE_API) {
    elements.backendStatus.textContent = "Browser-local mode. Deck validation can do a basic local check; playtesting needs the backend.";
    return;
  }
  elements.backendStatus.textContent = `Checking ${API_BASE_URL}...`;
  try {
    const payload = await apiFetch("/api/health", { method: "GET" });
    elements.backendStatus.textContent = `Connected: ${payload.service || "backend"} is ${payload.status || "available"}.`;
  } catch (error) {
    elements.backendStatus.textContent = `Backend not reachable: ${error.message}`;
  }
}

function renderNavigation() {
  elements.sections.forEach((section) => section.classList.toggle("is-active", section.id === state.activeSection));
  elements.navButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.section === state.activeSection));
}

function renderDeckBuilder() {
  const leaders = state.rows.filter((row) => normalizeText(row.card_type).toUpperCase() === "LEADER");
  const cards = state.rows.filter((row) => normalizeText(row.card_type).toUpperCase() !== "LEADER");
  const option = (row) => `<option value="${escapeHtml(rowId(row))}">${escapeHtml(row.card_code)} — ${escapeHtml(row.card_name || "Unnamed")} ${row.colour ? `(${escapeHtml(row.colour)})` : ""}</option>`;
  elements.starterDeckSelect.innerHTML = state.starterDecks.length
    ? state.starterDecks.map((deck) => `<option value="${escapeHtml(deck.id)}">${escapeHtml(deck.label)}</option>`).join("")
    : `<option value="">No starter presets loaded</option>`;
  elements.starterDeckSelect.value = state.deck.presetId || state.starterDecks[0]?.id || "";
  if (state.deck.presetDeck) {
    const source = state.deck.presetDeck.source_url ? ` Source: ${state.deck.presetDeck.source_url}` : "";
    elements.starterDeckNote.textContent = `${state.deck.presetDeck.label} loaded. MVP legal shell; exact sealed quantities verified: ${state.deck.presetDeck.exact_product_quantities_verified ? "yes" : "no"}.${source}`;
  } else {
    elements.starterDeckNote.textContent = "Presets are MVP test shells; exact sealed-product quantities still need verification.";
  }
  elements.leaderSelect.innerHTML = `<option value="">Choose leader...</option>${leaders.map(option).join("")}`;
  elements.leaderSelect.value = state.deck.leaderId;
  elements.deckCardSelect.innerHTML = cards.length ? cards.map(option).join("") : `<option value="">No non-leader cards available</option>`;

  const deck = deckPayload();
  const count = deck.cards.reduce((total, card) => total + (Number(card.quantity || 0) || 0), 0);
  elements.deckLeaderSummary.textContent = deck.leader?.card_code ? `${deck.leader.card_code} ${deck.leader.card_name || ""}` : "None";
  elements.deckCountSummary.textContent = `${count} / 50`;
  elements.deckValidationSummary.textContent = state.validation ? (state.validation.is_legal ? "Legal" : "Needs fixes") : "Not checked";

  if (!deck.cards.length) {
    elements.deckList.className = "deck-list empty-state";
    elements.deckList.textContent = "No cards added yet.";
  } else if (state.deck.presetDeck) {
    elements.deckList.className = "deck-list";
    elements.deckList.innerHTML = deck.cards.map((card) => `
      <div class="deck-list-row">
        <span><strong>${escapeHtml(card.quantity)}× ${escapeHtml(card.card_code || "—")}</strong> ${escapeHtml(card.card_name || "Unnamed card")}</span>
        <span>${escapeHtml(card.card_type || "")}</span>
      </div>`).join("");
  } else {
    elements.deckList.className = "deck-list";
    elements.deckList.innerHTML = state.deck.cards.map((entry) => {
      const row = state.rows.find((candidate) => rowId(candidate) === entry.rowId);
      return `
        <div class="deck-list-row">
          <span><strong>${escapeHtml(entry.quantity)}× ${escapeHtml(row?.card_code || "Missing")}</strong> ${escapeHtml(row?.card_name || "Card not found")}</span>
          <button class="icon-button small" type="button" data-remove-deck-card="${escapeHtml(entry.rowId)}" aria-label="Remove card">×</button>
        </div>`;
    }).join("");
    elements.deckList.querySelectorAll("[data-remove-deck-card]").forEach((button) => {
      button.addEventListener("click", () => {
        state.deck.cards = state.deck.cards.filter((entry) => entry.rowId !== button.dataset.removeDeckCard);
        state.validation = null;
        saveDeck();
        renderAll();
      });
    });
  }
}

function renderValidation() {
  const validation = state.validation;
  if (!validation) return;
  elements.deckValidationOutput.innerHTML = `
    <p><strong>${validation.is_legal ? "Deck is legal for the current MVP rules." : "Deck needs changes."}</strong></p>
    <p>Main deck count: ${escapeHtml(validation.main_deck_count ?? "0")}</p>
    ${validation.errors?.length ? `<h4>Errors</h4><ul>${validation.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : "<p>No errors.</p>"}
    ${validation.warnings?.length ? `<h4>Warnings</h4><ul>${validation.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
  `;
}

function renderSimulation() {
  const game = state.game;
  elements.passTurnButton.disabled = !game;
  if (!game) return;
  elements.simTurnPlayer.textContent = game.turn_player || "—";
  elements.simPhase.textContent = game.phase || "—";
  elements.simTurnNumber.textContent = String(game.turn_number || "—");
  const player = game.players?.player || {};
  elements.simPlayerZones.className = "zone-grid";
  elements.simPlayerZones.innerHTML = ["hand", "life", "deck", "trash"].map((zone) => `
    <div class="zone-card"><span>${zone}</span><strong>${(player[zone] || []).length}</strong></div>
  `).join("");
  elements.simLog.innerHTML = (game.log || []).slice(-8).map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
}

function renderAll() {
  renderNavigation();
  renderSummary();
  renderFacets();
  renderTable();
  renderDetails();
  renderSortIndicators();
  renderDeckBuilder();
  renderValidation();
  renderSimulation();
}

function openModal(row = null) {
  elements.cardForm.reset();
  elements.formStatus.textContent = "";
  document.getElementById("editing-id-input").value = row ? rowId(row) : "";
  elements.modalTitle.textContent = row ? "Edit Card" : "Add Card";
  const values = row || { print_version: "V.1", language: "English", quantity: "1", status: "needs_review" };
  const mapping = {
    "card-code-input": "card_code",
    "quantity-input": "quantity",
    "print-version-input": "print_version",
    "language-input": "language",
    "card-name-input": "card_name",
    "colour-input": "colour",
    "rarity-input": "rarity",
    "card-type-input": "card_type",
    "set-code-input": "set_code",
    "official-set-label-input": "official_set_label",
    "life-input": "life",
    "cost-input": "cost",
    "power-input": "power",
    "cardmarket-input": "cardmarket_avg_50_gbp",
    "ebay-input": "ebay_sold_avg_20_gbp",
    "status-input": "status",
    "official-image-url-input": "official_image_url",
    "variant-notes-input": "variant_notes",
  };
  for (const [id, field] of Object.entries(mapping)) {
    const input = document.getElementById(id);
    if (input) input.value = values[field] || "";
  }
  elements.modalBackdrop.classList.remove("hidden");
  elements.modalBackdrop.setAttribute("aria-hidden", "false");
  document.getElementById("card-code-input").focus();
}

function closeModal() {
  elements.modalBackdrop.classList.add("hidden");
  elements.modalBackdrop.setAttribute("aria-hidden", "true");
}

function formRow() {
  const now = new Date().toISOString();
  const editingId = document.getElementById("editing-id-input").value;
  const existing = state.rows.find((row) => rowId(row) === editingId) || {};
  return coerceRow({
    ...existing,
    card_code: document.getElementById("card-code-input").value,
    quantity: document.getElementById("quantity-input").value || "1",
    print_version: document.getElementById("print-version-input").value || "V.1",
    language: document.getElementById("language-input").value || "English",
    card_name: document.getElementById("card-name-input").value,
    colour: document.getElementById("colour-input").value,
    rarity: document.getElementById("rarity-input").value,
    card_type: document.getElementById("card-type-input").value,
    set_code: document.getElementById("set-code-input").value,
    official_set_label: document.getElementById("official-set-label-input").value,
    life: document.getElementById("life-input").value,
    cost: document.getElementById("cost-input").value,
    power: document.getElementById("power-input").value,
    cardmarket_avg_50_gbp: document.getElementById("cardmarket-input").value,
    ebay_sold_avg_20_gbp: document.getElementById("ebay-input").value,
    status: document.getElementById("status-input").value,
    official_image_url: document.getElementById("official-image-url-input").value,
    variant_notes: document.getElementById("variant-notes-input").value,
    created_at: existing.created_at || now,
    updated_at: now,
  });
}

async function saveForm(event) {
  event.preventDefault();
  const editingId = document.getElementById("editing-id-input").value;
  const row = formRow();
  if (!row.card_code) {
    elements.formStatus.textContent = "Card code is required.";
    return;
  }
  const newId = rowId(row);
  const duplicate = state.rows.find((candidate) => rowId(candidate) === newId && rowId(candidate) !== editingId);
  if (duplicate) {
    elements.formStatus.textContent = "That card/version/language/notes row already exists. Edit the existing row instead.";
    return;
  }

  if (USE_API) {
    try {
      if (editingId) {
        const original = state.rows.find((candidate) => rowId(candidate) === editingId);
        const payload = await apiFetch("/api/collection/update", {
          method: "POST",
          body: JSON.stringify({ original, current: row, refresh_prices: false }),
        });
        state.rows = state.rows.map((candidate) => rowId(candidate) === editingId ? coerceRow(payload.row) : candidate);
        state.selectedId = rowId(coerceRow(payload.row));
      } else {
        const payload = await apiFetch("/api/collection/add", {
          method: "POST",
          body: JSON.stringify({ ...row, refresh_prices: false }),
        });
        const savedRow = coerceRow(payload.row);
        state.rows.push(savedRow);
        state.selectedId = rowId(savedRow);
      }
    } catch (error) {
      elements.formStatus.textContent = `Backend save failed: ${error.message}`;
      return;
    }
  } else if (editingId) {
    state.rows = state.rows.map((candidate) => rowId(candidate) === editingId ? row : candidate);
    state.selectedId = newId;
    saveRows();
  } else {
    state.rows.push(row);
    state.selectedId = newId;
    saveRows();
  }

  closeModal();
  renderAll();
}

async function deleteSelected() {
  const row = selectedRow();
  if (!row) return;
  const label = row.card_name || row.card_code;
  if (!confirm(`Remove ${label} from this ${USE_API ? "backend" : "browser-local"} collection?`)) return;
  if (USE_API) {
    try {
      await apiFetch("/api/collection/delete", {
        method: "POST",
        body: JSON.stringify(row),
      });
    } catch (error) {
      alert(`Backend delete failed: ${error.message}`);
      return;
    }
  }
  state.rows = state.rows.filter((candidate) => rowId(candidate) !== state.selectedId);
  state.selectedId = "";
  if (!USE_API) saveRows();
  renderAll();
}

function exportData() {
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    source: "jumpkat.com/tcg/one-piece browser-local OPTCG collection",
    rows: state.rows,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `jumpkat-optcg-collection-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || ""));
      const rows = (Array.isArray(payload) ? payload : payload.rows || []).map(coerceRow);
      if (!rows.length) throw new Error("No rows found in imported file.");
      state.rows = rows;
      state.selectedId = rowId(rows[0]);
      saveRows();
      renderAll();
      alert(`Imported ${rows.length} card rows into this browser.`);
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    } finally {
      elements.importInput.value = "";
    }
  };
  reader.readAsText(file);
}

async function resetSample() {
  if (USE_API) {
    state.rows = await loadRows();
    state.selectedId = "";
    renderAll();
    return;
  }
  if (!confirm("Reset this browser-local collection back to the public sample data?")) return;
  state.rows = await loadSeedRows();
  state.selectedId = "";
  saveRows();
  renderAll();
}

async function validateDeck() {
  const deck = deckPayload();
  if (USE_API) {
    try {
      const payload = await apiFetch("/api/decks/validate", {
        method: "POST",
        body: JSON.stringify({ deck }),
      });
      state.validation = payload.validation;
    } catch (error) {
      state.validation = { is_legal: false, main_deck_count: deck.cards.reduce((total, card) => total + Number(card.quantity || 0), 0), errors: [`Backend validation failed: ${error.message}`], warnings: [] };
    }
  } else {
    state.validation = localDeckCheck(deck);
  }
  renderAll();
}

async function startSimulation() {
  if (!USE_API) {
    alert("Playtest simulation needs the local backend. Click 'Use Laptop Backend' first while this PC backend is running.");
    return;
  }
  const deck = deckPayload();
  const check = localDeckCheck(deck);
  if (!check.is_legal && !confirm("This deck does not pass the basic local check yet. Start the sim anyway?")) return;
  try {
    const payload = await apiFetch("/api/sim/new", {
      method: "POST",
      body: JSON.stringify({ player_deck: deck, cpu_deck: deck, seed: 123 }),
    });
    state.game = payload.game;
    state.activeSection = "playtest-section";
    renderAll();
  } catch (error) {
    alert(`Could not start simulation: ${error.message}`);
  }
}

async function passTurn() {
  if (!state.game || !USE_API) return;
  try {
    const payload = await apiFetch("/api/sim/action", {
      method: "POST",
      body: JSON.stringify({ game: state.game, action: { type: "pass" }, cpu_auto: true }),
    });
    state.game = payload.game;
    renderAll();
  } catch (error) {
    alert(`Simulation action failed: ${error.message}`);
  }
}

function wireEvents() {
  elements.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeSection = button.dataset.section;
      renderAll();
    });
  });
  elements.saveBackendUrlButton.addEventListener("click", () => setBackendUrl(elements.backendUrlInput.value));
  elements.useLocalBackendButton.addEventListener("click", () => setBackendUrl("http://127.0.0.1:8000"));
  elements.leaderSelect.addEventListener("change", () => {
    state.deck.leaderId = elements.leaderSelect.value;
    state.deck.presetId = "";
    state.deck.presetDeck = null;
    state.validation = null;
    saveDeck();
    renderAll();
  });
  elements.loadStarterDeckButton.addEventListener("click", () => {
    const preset = state.starterDecks.find((deck) => deck.id === elements.starterDeckSelect.value);
    if (!preset) return;
    state.deck = { leaderId: "", cards: [], presetId: preset.id, presetDeck: preset };
    state.validation = null;
    state.game = null;
    saveDeck();
    renderAll();
  });
  elements.addDeckCardButton.addEventListener("click", () => {
    const rowIdValue = elements.deckCardSelect.value;
    if (!rowIdValue) return;
    state.deck.presetId = "";
    state.deck.presetDeck = null;
    const quantity = Math.max(1, Math.min(4, Number.parseInt(elements.deckQtyInput.value || "1", 10) || 1));
    const existing = state.deck.cards.find((entry) => entry.rowId === rowIdValue);
    if (existing) existing.quantity = Math.max(1, Math.min(4, existing.quantity + quantity));
    else state.deck.cards.push({ rowId: rowIdValue, quantity });
    state.validation = null;
    saveDeck();
    renderAll();
  });
  elements.clearDeckButton.addEventListener("click", () => {
    state.deck = { leaderId: "", cards: [], presetId: "", presetDeck: null };
    state.validation = null;
    state.game = null;
    saveDeck();
    renderAll();
  });
  elements.validateDeckButton.addEventListener("click", validateDeck);
  elements.startSimButton.addEventListener("click", startSimulation);
  elements.passTurnButton.addEventListener("click", passTurn);
  elements.searchInput.addEventListener("input", () => {
    state.search = elements.searchInput.value;
    renderAll();
  });
  elements.clearFiltersButton.addEventListener("click", () => {
    state.search = "";
    state.statusFilter = "";
    state.colourFilter = "";
    elements.searchInput.value = "";
    renderAll();
  });
  document.querySelectorAll(".table-sort").forEach((button) => {
    button.addEventListener("click", () => {
      const column = button.dataset.sortColumn;
      if (state.sortColumn === column) {
        state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      } else {
        state.sortColumn = column;
        state.sortDirection = "asc";
      }
      renderAll();
    });
  });
  elements.addCardButton.addEventListener("click", () => openModal());
  elements.editCardButton.addEventListener("click", () => openModal(selectedRow()));
  elements.deleteCardButton.addEventListener("click", deleteSelected);
  elements.hideDetailButton.addEventListener("click", () => {
    state.selectedId = "";
    renderAll();
  });
  elements.closeModalButton.addEventListener("click", closeModal);
  elements.cancelModalButton.addEventListener("click", closeModal);
  elements.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === elements.modalBackdrop) closeModal();
  });
  elements.cardForm.addEventListener("submit", saveForm);
  elements.exportButton.addEventListener("click", exportData);
  elements.importInput.addEventListener("change", () => {
    const file = elements.importInput.files?.[0];
    if (file) importData(file);
  });
  elements.resetSampleButton.addEventListener("click", resetSample);
}

async function init() {
  wireEvents();
  loadDeck();
  renderBackendStatus();
  const notice = document.querySelector(".static-notice");
  if (notice && USE_API) {
    notice.innerHTML = `<strong>Private backend mode.</strong> This browser is reading/writing collection rows through <code>${escapeHtml(API_BASE_URL)}</code>. Export Data still creates a local JSON backup.`;
  }
  try {
    state.rows = await loadRows();
    state.starterDecks = await loadStarterDecks();
  } catch (error) {
    console.error(error);
    elements.tableBody.innerHTML = `<tr><td colspan="9" class="empty-state">Could not load collection data.</td></tr>`;
    return;
  }
  renderAll();
}

init();
