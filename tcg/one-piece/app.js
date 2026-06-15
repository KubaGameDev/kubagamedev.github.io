const STORAGE_KEY = "jumpkat.optcg.collection.v1";
const SEED_URL = "./data/collection.seed.json";
const CONFIG = window.OPTCG_CONFIG || {};
const API_BASE_URL = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
const USE_API = Boolean(API_BASE_URL);

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

function renderAll() {
  renderSummary();
  renderFacets();
  renderTable();
  renderDetails();
  renderSortIndicators();
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

function wireEvents() {
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
  const notice = document.querySelector(".static-notice");
  if (notice && USE_API) {
    notice.innerHTML = `<strong>Private backend mode.</strong> This browser is reading/writing collection rows through <code>${escapeHtml(API_BASE_URL)}</code>. Export Data still creates a local JSON backup.`;
  }
  try {
    state.rows = await loadRows();
  } catch (error) {
    console.error(error);
    elements.tableBody.innerHTML = `<tr><td colspan="9" class="empty-state">Could not load collection data.</td></tr>`;
    return;
  }
  renderAll();
}

init();
