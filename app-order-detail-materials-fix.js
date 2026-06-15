const ORDER_DETAIL_MATERIAL_STATUS = {
  saving: false,
  selectedSku: "",
  quantity: "1",
};

function orderDetailMaterialsEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function orderDetailMaterialsItems() {
  return Array.isArray(appData.inventory) ? appData.inventory : [];
}

function orderDetailMaterialsNumber(value, fallback = 1) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function orderDetailMaterialsOrder() {
  return typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
}

function orderDetailMaterialsDbId(order) {
  if (typeof orderFlowDbId === "function") return orderFlowDbId(order);
  return Number(order?.db_id || order?.internal_id || order?.id || appState.selectedOrderId || 0);
}

async function orderDetailMaterialsLoadInventory(force = false) {
  if (!force && orderDetailMaterialsItems().length) return;
  if (typeof inventoryOrderLoadItems === "function") {
    await inventoryOrderLoadItems(force);
    return;
  }
  if (typeof orderFlowRequest !== "function") return;
  const rows = await orderFlowRequest("/rest/v1/inventory_items?select=id,sku,name,category,available_quantity,reserved_quantity,status,notes&order=name.asc");
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
}

function orderDetailMaterialsEnsureSelection() {
  const items = orderDetailMaterialsItems();
  if (!ORDER_DETAIL_MATERIAL_STATUS.selectedSku && items.length) {
    ORDER_DETAIL_MATERIAL_STATUS.selectedSku = items[0].sku || "";
  }
}

function orderDetailMaterialsSelectedItem() {
  orderDetailMaterialsEnsureSelection();
  return orderDetailMaterialsItems().find((item) => item.sku === ORDER_DETAIL_MATERIAL_STATUS.selectedSku) || null;
}

function orderDetailMaterialsInfo(item) {
  if (!item) return "Nessun prodotto disponibile in magazzino";
  return `${item.sku || "SKU n/d"} - disponibili ${item.available ?? 0}, impegnati ${item.reserved ?? 0}`;
}

function orderDetailMaterialsPanelMarkup() {
  orderDetailMaterialsEnsureSelection();
  const items = orderDetailMaterialsItems();
  const selected = orderDetailMaterialsSelectedItem();
  return `
    <div class="order-detail-material-add" style="margin: 0 0 16px; padding: 14px; border: 1px solid rgba(120, 80, 40, 0.18); border-radius: 8px;">
      <div class="section-title" style="margin-bottom: 10px;">
        <div>
          <h3>Aggiungi materiale da magazzino</h3>
          <p>Collega un prodotto reale del magazzino MMS all'ordine aperto.</p>
        </div>
        <button class="action-pill" data-order-detail-material-add type="button">${ORDER_DETAIL_MATERIAL_STATUS.saving ? "Salvataggio..." : "+ Aggiungi materiale"}</button>
      </div>
      <div class="form-grid">
        <div class="field span-2">
          <label>Prodotto magazzino</label>
          <select class="filter-chip" data-order-detail-material-field="selectedSku">
            ${items.length ? items.map((item) => `<option value="${orderDetailMaterialsEscape(item.sku)}" ${item.sku === ORDER_DETAIL_MATERIAL_STATUS.selectedSku ? "selected" : ""}>${orderDetailMaterialsEscape(item.product || item.name || "Prodotto")} - ${orderDetailMaterialsEscape(item.sku || "SKU n/d")}</option>`).join("") : `<option value="">Nessun prodotto in magazzino</option>`}
          </select>
          <div class="muted" style="margin-top:6px;">${orderDetailMaterialsEscape(orderDetailMaterialsInfo(selected))}</div>
        </div>
        <div class="field">
          <label>Quantita'</label>
          <input class="field-value" data-order-detail-material-field="quantity" value="${orderDetailMaterialsEscape(ORDER_DETAIL_MATERIAL_STATUS.quantity)}" />
        </div>
      </div>
    </div>
  `;
}

function orderDetailMaterialsMount() {
  if (appState.currentView !== "order-detail") return;
  const section = document.querySelector("section.view.active");
  if (!section || section.querySelector(".order-detail-material-add")) return;
  const materialTitle = Array.from(section.querySelectorAll(".section-title h3")).find((title) => title.textContent.trim().toLowerCase() === "sezione materiale");
  const surfaceInner = materialTitle?.closest(".surface-inner");
  const titleBlock = materialTitle?.closest(".section-title");
  if (surfaceInner && titleBlock) {
    titleBlock.insertAdjacentHTML("afterend", orderDetailMaterialsPanelMarkup());
  }
}

function orderDetailMaterialsAttachEvents() {
  document.querySelectorAll("[data-order-detail-material-field]").forEach((input) => {
    const handler = (event) => {
      ORDER_DETAIL_MATERIAL_STATUS[event.target.dataset.orderDetailMaterialField] = event.target.value;
    };
    input.oninput = handler;
    input.onchange = handler;
  });

  document.querySelectorAll("[data-order-detail-material-add]").forEach((button) => {
    button.onclick = () => {
      if (!ORDER_DETAIL_MATERIAL_STATUS.saving) orderDetailMaterialsAddSelected();
    };
  });
}

async function orderDetailMaterialsAddSelected() {
  const order = orderDetailMaterialsOrder();
  const dbId = orderDetailMaterialsDbId(order);
  const item = orderDetailMaterialsSelectedItem();
  if (!dbId) {
    setFlashMessage("Ordine non disponibile per collegare il materiale");
    return;
  }
  if (!item?.sku) {
    setFlashMessage("Seleziona un prodotto reale del magazzino");
    return;
  }
  if (typeof orderFlowRequest !== "function") {
    setFlashMessage("Collegamento magazzino non disponibile");
    return;
  }

  ORDER_DETAIL_MATERIAL_STATUS.saving = true;
  renderApp();
  try {
    const inventoryId = typeof orderFlowInventoryIdForSku === "function" ? await orderFlowInventoryIdForSku(item.sku) : item.id;
    if (!inventoryId) throw new Error("Prodotto magazzino senza SKU collegabile");

    const quantity = orderDetailMaterialsNumber(ORDER_DETAIL_MATERIAL_STATUS.quantity, 1);
    const available = Number(String(item.available ?? 0).replace(",", ".")) || 0;
    await orderFlowRequest("/rest/v1/order_materials", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        order_id: dbId,
        inventory_item_id: Number(inventoryId),
        product_name: item.product || item.name || "Materiale magazzino",
        source_type: "mms",
        delivery_status: available > 0 ? "consegnato" : "non_consegnato",
        warehouse_status_note: `Collegato al magazzino - SKU ${item.sku}`,
        preorder_note: available > 0 ? "Disponibile in magazzino" : "Da preordinare / verificare disponibilita'",
        quantity_required: quantity,
        notes: "Aggiunto dalla scheda ordine",
      }),
    });
    await orderFlowRequest(`/rest/v1/orders?id=eq.${dbId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ warehouse_linked: true }),
    }).catch(() => null);
    if (order) order.warehouseLinked = true;
    if (typeof orderFlowLoadMaterials === "function") await orderFlowLoadMaterials(order);
    ORDER_DETAIL_MATERIAL_STATUS.quantity = "1";
    setFlashMessage(`${item.product || item.name || "Materiale"} collegato all'ordine`);
  } catch (error) {
    setFlashMessage(error.message || "Materiale non collegato all'ordine");
  } finally {
    ORDER_DETAIL_MATERIAL_STATUS.saving = false;
    renderApp();
  }
}

const baseRenderAppOrderDetailMaterials = renderApp;
renderApp = function renderAppWithOrderDetailMaterials() {
  baseRenderAppOrderDetailMaterials();
  if (appState.currentView !== "order-detail") return;
  orderDetailMaterialsMount();
  orderDetailMaterialsAttachEvents();
  if (!orderDetailMaterialsItems().length) {
    orderDetailMaterialsLoadInventory().then(() => {
      if (appState.currentView === "order-detail") renderApp();
    }).catch(() => {});
  }
};

orderDetailMaterialsLoadInventory().catch(() => {});
