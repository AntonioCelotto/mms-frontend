const INVENTORY_ORDER_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
const INVENTORY_ORDER_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";

function inventoryOrderState() {
  if (!appState.inventoryOrderPicker) {
    appState.inventoryOrderPicker = {
      selectedSku: "",
      quantity: "1",
      newName: "",
      newCategory: "",
      newQuantity: "1",
    };
  }
  return appState.inventoryOrderPicker;
}

function inventoryOrderEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inventoryOrderItems() {
  return Array.isArray(appData.inventory) ? appData.inventory : [];
}

function inventoryOrderSelectedItem() {
  const state = inventoryOrderState();
  const items = inventoryOrderItems();
  return items.find((item) => item.sku === state.selectedSku) || items[0] || null;
}

function inventoryOrderNumber(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inventoryOrderMaterialFromItem(item, quantity) {
  const available = inventoryOrderNumber(item.available, 0);
  const sku = item.sku || "";
  return {
    product_name: item.product || item.name || "Materiale magazzino",
    source_type: "mms",
    delivery_status: available > 0 ? "consegnato" : "non_consegnato",
    warehouse_status_note: sku ? `Collegato al magazzino - SKU ${sku}` : "Collegato al magazzino MMS",
    preorder_note: available > 0 ? "Disponibile in magazzino" : "Da preordinare / verificare disponibilita'",
    quantity_required: inventoryOrderNumber(quantity, 1) || 1,
    inventory_sku: sku,
  };
}

async function inventoryOrderRequest(path, options = {}) {
  const response = await fetch(`${INVENTORY_ORDER_URL}${path}`, {
    ...options,
    headers: {
      apikey: INVENTORY_ORDER_KEY,
      Authorization: `Bearer ${INVENTORY_ORDER_KEY}`,
      ...(options.headers || {}),
    },
  });
  const raw = await response.text().catch(() => "");
  let payload = null;
  if (raw) {
    try { payload = JSON.parse(raw); } catch (error) { payload = { detail: raw.slice(0, 240) }; }
  }
  if (!response.ok) throw new Error(payload?.message || payload?.detail || payload?.error || `Richiesta non riuscita (${response.status})`);
  return payload;
}

async function inventoryOrderLoadItems(force = false) {
  if (!force && inventoryOrderItems().length) return;
  try {
    const rows = await inventoryOrderRequest("/rest/v1/inventory_items?select=id,sku,name,category,available_quantity,reserved_quantity,status,notes&order=name.asc");
    appData.inventory = (Array.isArray(rows) ? rows : []).map((row) => ({
      id: row.id,
      sku: row.sku || "",
      product: row.name || "",
      category: row.category || "",
      available: row.available_quantity ?? 0,
      reserved: row.reserved_quantity ?? 0,
      status: row.status || "",
      reorder: row.notes || "Senza note",
    }));
  } catch (error) {
    setFlashMessage(`Magazzino non caricato: ${error.message}`);
  }
}

function inventoryOrderEnsureDefaultSelection() {
  const state = inventoryOrderState();
  const items = inventoryOrderItems();
  if (!state.selectedSku && items.length) state.selectedSku = items[0].sku || "";
}

function inventoryOrderSkuBase(name) {
  const base = String(name || "MAT")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
  return base || "MAT";
}

function inventoryOrderGeneratedSku(name) {
  const suffix = Date.now().toString().slice(-6);
  return `MMS-${inventoryOrderSkuBase(name)}-${suffix}`;
}

async function inventoryOrderCreateAndAdd() {
  const state = inventoryOrderState();
  const name = state.newName.trim();
  if (!name) {
    setFlashMessage("Scrivi il nome del nuovo prodotto magazzino");
    return;
  }

  setBusy(true);
  try {
    const sku = inventoryOrderGeneratedSku(name);
    const quantity = inventoryOrderNumber(state.newQuantity, 0);
    const rows = await inventoryOrderRequest("/rest/v1/inventory_items", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        sku,
        name,
        category: state.newCategory || null,
        available_quantity: quantity,
        reserved_quantity: 0,
        reorder_threshold: 0,
        status: quantity > 0 ? "Disponibile" : "Da ordinare",
        notes: "Creato da Nuovo ordine",
      }),
    });
    const created = Array.isArray(rows) ? rows[0] : null;
    if (!created?.id) throw new Error("Prodotto magazzino non creato");

    const item = {
      id: created.id,
      sku: created.sku,
      product: created.name,
      category: created.category || "",
      available: created.available_quantity ?? quantity,
      reserved: created.reserved_quantity ?? 0,
      status: created.status || "Disponibile",
      reorder: created.notes || "Creato da Nuovo ordine",
    };
    appData.inventory = [item, ...inventoryOrderItems().filter((existing) => existing.sku !== item.sku)];
    appState.draftMaterials.push(inventoryOrderMaterialFromItem(item, state.quantity || "1"));
    appState.draftOrder.warehouseLink = "Magazzino MMS attivo";
    appState.inventoryOrderPicker = { selectedSku: item.sku, quantity: "1", newName: "", newCategory: "", newQuantity: "1" };
    setFlashMessage(`${item.product} creato in magazzino e aggiunto all'ordine`);
  } catch (error) {
    setFlashMessage(`Creazione prodotto non riuscita: ${error.message}`);
  } finally {
    appState.busy = false;
    renderApp();
  }
}

function inventoryOrderAddSelected() {
  inventoryOrderEnsureDefaultSelection();
  const state = inventoryOrderState();
  const item = inventoryOrderSelectedItem();
  if (!item?.sku) {
    setFlashMessage("Nessun prodotto disponibile in magazzino: crea prima un prodotto sotto");
    return;
  }
  appState.draftMaterials.push(inventoryOrderMaterialFromItem(item, state.quantity));
  appState.draftOrder.warehouseLink = "Magazzino MMS attivo";
  setFlashMessage(`${item.product} aggiunto ai materiali dell'ordine`);
  renderApp();
}

function inventoryOrderPanelMarkup() {
  inventoryOrderEnsureDefaultSelection();
  const state = inventoryOrderState();
  const items = inventoryOrderItems();
  const selected = inventoryOrderSelectedItem();
  const selectedInfo = selected
    ? `${selected.sku || "SKU n/d"} - disponibili ${selected.available ?? 0}, impegnati ${selected.reserved ?? 0}`
    : "Nessun prodotto caricato in magazzino";

  return `
    <div class="surface inventory-order-link-panel" style="margin:16px 0;">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Materiale da magazzino</h3>
            <p>Seleziona un prodotto reale del magazzino MMS e aggiungilo ai materiali dell'ordine.</p>
          </div>
          <button class="action-pill" data-inventory-order-add type="button">+ Aggiungi all'ordine</button>
        </div>
        <div class="form-grid">
          <div class="field span-2">
            <label>Seleziona materiale</label>
            <select class="filter-chip" data-inventory-order-field="selectedSku">
              ${items.length ? items.map((item) => `<option value="${inventoryOrderEscape(item.sku)}" ${item.sku === state.selectedSku ? "selected" : ""}>${inventoryOrderEscape(item.product)} - ${inventoryOrderEscape(item.sku || "SKU n/d")}</option>`).join("") : `<option value="">Nessun prodotto in magazzino</option>`}
            </select>
            <div class="muted" style="margin-top:6px;">${inventoryOrderEscape(selectedInfo)}</div>
          </div>
          <div class="field">
            <label>Quantita' ordine</label>
            <input class="field-value" data-inventory-order-field="quantity" value="${inventoryOrderEscape(state.quantity)}" />
          </div>
        </div>
        <div style="height:14px;"></div>
        <div class="section-title">
          <div>
            <h3>Nuovo prodotto magazzino</h3>
            <p>Usalo quando il prodotto non esiste ancora: viene creato in magazzino e aggiunto all'ordine.</p>
          </div>
          <button class="mini-btn" data-inventory-order-create type="button">+ Crea prodotto</button>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>Nome prodotto</label>
            <input class="field-value" data-inventory-order-field="newName" value="${inventoryOrderEscape(state.newName)}" placeholder="es. Tessuto lino nero" />
          </div>
          <div class="field">
            <label>Categoria</label>
            <input class="field-value" data-inventory-order-field="newCategory" value="${inventoryOrderEscape(state.newCategory)}" placeholder="Tessuti, accessori, etichette..." />
          </div>
          <div class="field">
            <label>Quantita' disponibile</label>
            <input class="field-value" data-inventory-order-field="newQuantity" value="${inventoryOrderEscape(state.newQuantity)}" />
          </div>
        </div>
      </div>
    </div>
  `;
}

function inventoryOrderEnhanceWarehouseField(section) {
  const warehouseInput = section.querySelector("[data-draft='warehouseLink']");
  if (!warehouseInput || warehouseInput.dataset.inventoryOrderExplained === "true") return;
  const field = warehouseInput.closest(".field");
  const hasLinkedMaterial = appState.draftMaterials.some((material) => material.source_type === "mms" && material.inventory_sku);
  appState.draftOrder.warehouseLink = hasLinkedMaterial ? "Magazzino MMS attivo" : (appState.draftOrder.warehouseLink || "Da definire");
  if (field) {
    field.querySelector("label").textContent = "Stato collegamento magazzino";
    warehouseInput.dataset.inventoryOrderExplained = "true";
    warehouseInput.value = appState.draftOrder.warehouseLink;
    warehouseInput.placeholder = "Si aggiorna quando aggiungi materiale da magazzino";
  }
}

function inventoryOrderMount() {
  if (appState.currentView !== "new-order") return;
  const section = document.querySelector("section.view.active");
  if (!section || section.querySelector(".inventory-order-link-panel")) return;

  inventoryOrderEnhanceWarehouseField(section);
  const materialTitle = Array.from(section.querySelectorAll(".section-title h3")).find((title) => title.textContent.trim().toLowerCase() === "sezione materiale");
  const materialBlock = materialTitle?.closest(".section-title");
  if (materialBlock) materialBlock.insertAdjacentHTML("afterend", inventoryOrderPanelMarkup());
}

function inventoryOrderAttachEvents() {
  document.querySelectorAll("[data-inventory-order-field]").forEach((input) => {
    const handler = (event) => {
      inventoryOrderState()[event.target.dataset.inventoryOrderField] = event.target.value;
    };
    input.oninput = handler;
    input.onchange = handler;
  });

  document.querySelectorAll("[data-inventory-order-add]").forEach((button) => {
    button.onclick = () => inventoryOrderAddSelected();
  });

  document.querySelectorAll("[data-inventory-order-create]").forEach((button) => {
    button.onclick = () => {
      if (!appState.busy) inventoryOrderCreateAndAdd();
    };
  });
}

const baseRenderAppInventoryOrderLink = renderApp;
renderApp = function renderAppWithInventoryOrderLink() {
  baseRenderAppInventoryOrderLink();
  inventoryOrderMount();
  inventoryOrderAttachEvents();
  if ((appState.currentView === "new-order" || appState.currentView === "inventory") && !inventoryOrderItems().length) {
    inventoryOrderLoadItems().then(() => renderApp()).catch(() => {});
  }
};

inventoryOrderLoadItems().then(() => {
  inventoryOrderEnsureDefaultSelection();
  if (appState.currentView === "new-order" || appState.currentView === "inventory") renderApp();
}).catch(() => {});
