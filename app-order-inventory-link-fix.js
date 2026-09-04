(function () {
  const state = {
    loaded: false,
    loading: false,
    detailLoading: new Set(),
    detailLoaded: new Set(),
    query: "",
    selectedId: "",
    quantity: "1",
  };

  function text(value) {
    return String(value ?? "").trim();
  }

  function number(value, fallback = 0) {
    const parsed = Number(text(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeInventoryItem(item) {
    return {
      ...item,
      id: Number(item?.id || 0),
      sku: text(item?.sku || item?.mms_code || item?.supplier_material_code),
      name: text(item?.name || item?.product),
      product: text(item?.product || item?.name),
      available: number(item?.available ?? item?.available_quantity, 0),
      reserved: number(item?.reserved ?? item?.reserved_quantity, 0),
      unit: text(item?.unit),
      item_type: text(item?.item_type) || "materiale",
      material_origin: text(item?.material_origin) || "mms",
    };
  }

  function inventoryItems() {
    return (Array.isArray(appData.inventory) ? appData.inventory : [])
      .map(normalizeInventoryItem)
      .filter((item) => item.id && item.sku && item.name);
  }

  async function loadCompleteInventory(force = false) {
    if (state.loading || (state.loaded && !force)) return;
    state.loading = true;
    try {
      const response = await fetch("/api/inventory", { headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.error || "Magazzino non disponibile");
      appData.inventory = (payload.items || []).map(normalizeInventoryItem);
      state.loaded = true;
      if (!state.selectedId && appData.inventory[0]?.id) state.selectedId = String(appData.inventory[0].id);
      renderApp();
    } catch (error) {
      setFlashMessage(`Magazzino non caricato nell'ordine: ${error.message}`);
    } finally {
      state.loading = false;
    }
  }

  function materialFromInventory(item, quantity) {
    const clean = normalizeInventoryItem(item);
    return {
      product_name: clean.name,
      material: clean.name,
      quantity_required: number(quantity, 1) || 1,
      quantity: number(quantity, 1) || 1,
      inventory_item_id: clean.id,
      inventoryItemId: clean.id,
      inventory_sku: clean.sku,
      sku: clean.sku,
      unit: clean.unit,
      source_type: "mms",
      source: "mms",
      delivery_status: "non_consegnato",
      delivery: "non_consegnato",
      warehouse_status_note: `Collegato al magazzino - SKU ${clean.sku}`,
      warehouse: `Collegato al magazzino - SKU ${clean.sku}`,
      preorder_note: clean.available - clean.reserved > 0 ? "Disponibile in magazzino" : "Disponibilita' da verificare",
      preorder: clean.available - clean.reserved > 0 ? "Disponibile in magazzino" : "Disponibilita' da verificare",
      notes: "",
    };
  }

  function normalizeOrderMaterial(material) {
    const inventoryId = Number(material?.inventory_item_id || material?.inventoryItemId || 0) || null;
    const productName = text(material?.product_name || material?.material || material?.name);
    const sku = text(material?.inventory_sku || material?.sku);
    return {
      ...material,
      product_name: productName,
      material: productName,
      quantity_required: number(material?.quantity_required ?? material?.quantity, 1) || 1,
      quantity: number(material?.quantity_required ?? material?.quantity, 1) || 1,
      inventory_item_id: inventoryId,
      inventoryItemId: inventoryId,
      inventory_sku: sku,
      sku,
      unit: text(material?.unit),
      source_type: text(material?.source_type || material?.source).toLowerCase() === "cliente" ? "cliente" : "mms",
      delivery_status: text(material?.delivery_status || material?.delivery).toLowerCase() === "consegnato" ? "consegnato" : "non_consegnato",
      warehouse_status_note: text(material?.warehouse_status_note || material?.warehouse) || (sku ? `SKU ${sku}` : "Inserimento manuale"),
      preorder_note: text(material?.preorder_note || material?.preorder || material?.note),
      notes: text(material?.notes),
    };
  }

  function materialsFromQuotePayload(payload) {
    const rows = [];
    const articles = Array.isArray(payload?.articles) ? payload.articles : [];
    articles.forEach((article) => {
      (Array.isArray(article?.materials) ? article.materials : []).forEach((material) => {
        const row = normalizeOrderMaterial({
          ...material,
          product_name: material.product_name || material.material || material.name,
          quantity_required: material.quantity_required || material.quantity || material.qty,
          preorder_note: material.preorder_note || material.note || `Articolo: ${article.name || "n/d"}`,
        });
        if (row.product_name) rows.push(row);
      });
    });
    return rows;
  }

  function selectedInventoryItem() {
    const items = inventoryItems();
    return items.find((item) => String(item.id) === String(state.selectedId)) || items[0] || null;
  }

  function filteredInventoryItems() {
    const query = text(state.query).toLowerCase();
    const items = inventoryItems();
    if (!query) return items.slice(0, 160);
    return items.filter((item) => [item.name, item.sku, item.item_type, item.material_origin].join(" ").toLowerCase().includes(query)).slice(0, 200);
  }

  function pickerMarkup() {
    const items = filteredInventoryItems();
    const selected = selectedInventoryItem();
    const free = selected ? Math.max(0, selected.available - selected.reserved) : 0;
    return `
      <div class="surface order-inventory-picker" style="margin:16px 0;">
        <div class="surface-inner">
          <div class="section-title">
            <div><h3>Aggiungi dal Magazzino</h3><p>Collega un articolo o materiale reale anche dopo l'accettazione del preventivo.</p></div>
            <button class="action-pill" data-order-inventory-add type="button">+ Aggiungi</button>
          </div>
          <div class="form-grid">
            <div class="field"><label>Cerca per nome o codice</label><input class="field-value" data-order-inventory-query value="${esc(state.query)}" placeholder="Cerca nel magazzino" /></div>
            <div class="field span-2"><label>Articolo o materiale</label><select class="filter-chip" data-order-inventory-select>${items.length ? items.map((item) => `<option value="${item.id}" ${String(item.id) === String(state.selectedId) ? "selected" : ""}>${esc(item.name)} - ${esc(item.sku)}</option>`).join("") : `<option value="">Nessun risultato</option>`}</select></div>
            <div class="field"><label>Quantita'</label><input class="field-value" inputmode="decimal" data-order-inventory-quantity value="${esc(state.quantity)}" /></div>
          </div>
          <div class="muted" style="margin-top:8px;">${selected ? `${esc(selected.item_type)} - disponibili ${selected.available}, impegnati ${selected.reserved}, liberi ${free} ${esc(selected.unit)}` : "Caricamento magazzino..."}</div>
        </div>
      </div>
    `;
  }

  function currentTargetRows() {
    if (appState.currentView === "order-from-quote") {
      const draft = appState.orderFromQuoteDraft;
      if (!draft) return null;
      if (!Array.isArray(draft.materials)) draft.materials = [];
      return draft.materials;
    }
    if (appState.currentView === "order-detail" && typeof orderDetailEditDraftFor === "function") {
      const order = getSelectedOrder?.();
      const draft = orderDetailEditDraftFor(order);
      if (!draft) return null;
      if (!Array.isArray(draft.materials)) draft.materials = [];
      return draft.materials;
    }
    return null;
  }

  function addSelectedInventoryItem() {
    const item = selectedInventoryItem();
    const rows = currentTargetRows();
    if (!item || !rows) {
      setFlashMessage("Seleziona un elemento del Magazzino");
      return;
    }
    rows.push(materialFromInventory(item, state.quantity));
    if (appState.currentView === "order-from-quote" && typeof orderFromQuoteV2SyncDraft === "function") orderFromQuoteV2SyncDraft();
    setFlashMessage(`${item.name} aggiunto all'ordine e collegato al Magazzino`);
    state.quantity = "1";
    renderApp();
  }

  function mountPicker() {
    if (!state.loaded) {
      void loadCompleteInventory();
      return;
    }
    if (appState.currentView !== "order-from-quote" && appState.currentView !== "order-detail") return;
    const section = document.querySelector("section.view.active");
    if (!section || section.querySelector(".order-inventory-picker")) return;
    if (appState.currentView === "order-from-quote") {
      const materialTitle = Array.from(section.querySelectorAll(".section-title h3")).find((node) => node.textContent.includes("Preventivo riportato"));
      materialTitle?.closest(".surface")?.insertAdjacentHTML("beforebegin", pickerMarkup());
      return;
    }
    const editPanel = section.querySelector(".order-detail-edit-panel");
    const materialTitle = Array.from(editPanel?.querySelectorAll(".section-title h3") || []).find((node) => node.textContent.trim() === "Materiali ordine");
    materialTitle?.closest(".order-detail-edit-section")?.insertAdjacentHTML("beforebegin", pickerMarkup());
  }

  function attachPickerEvents() {
    const query = document.querySelector("[data-order-inventory-query]");
    if (query) query.onchange = (event) => { state.query = event.target.value; state.selectedId = ""; renderApp(); };
    const select = document.querySelector("[data-order-inventory-select]");
    if (select) select.onchange = (event) => { state.selectedId = event.target.value; renderApp(); };
    const quantity = document.querySelector("[data-order-inventory-quantity]");
    if (quantity) quantity.oninput = (event) => { state.quantity = event.target.value; };
    const add = document.querySelector("[data-order-inventory-add]");
    if (add) add.onclick = addSelectedInventoryItem;
  }

  if (typeof orderFlowMaterialShape === "function") {
    orderFlowMaterialShape = function materialShapeWithInventoryLink(material, inventoryById) {
      const inventory = inventoryById.get(Number(material.inventory_item_id));
      return {
        ...normalizeOrderMaterial({
          ...material,
          inventory_sku: inventory?.sku || material.inventory_sku,
          unit: inventory?.unit || material.unit,
        }),
        source: material.source_type === "mms" ? "MMS" : "Cliente",
        warehouse: material.warehouse_status_note || (inventory?.sku ? `SKU ${inventory.sku}` : "Inserimento manuale"),
        delivery: material.delivery_status === "consegnato" ? "Consegnato" : "Non consegnato",
        preorder: material.preorder_note || "Nessun preordine",
      };
    };
  }

  if (typeof orderDetailEditMaterialToDraft === "function") {
    orderDetailEditMaterialToDraft = function materialToEditableDraft(material) {
      return normalizeOrderMaterial(material);
    };
  }

  if (typeof orderDetailEditMaterialFromDraft === "function") {
    orderDetailEditMaterialFromDraft = function materialFromEditableDraft(material) {
      const row = normalizeOrderMaterial(material);
      return {
        ...row,
        source: row.source_type === "mms" ? "MMS" : "Cliente",
        warehouse: row.warehouse_status_note,
        delivery: row.delivery_status === "consegnato" ? "Consegnato" : "Non consegnato",
        preorder: row.preorder_note || "Nessun preordine",
      };
    };
  }

  async function saveMaterialsReliably(order, materials) {
    const dbId = Number(order?.db_id || order?.internal_id || 0);
    if (!dbId) throw new Error("ID database dell'ordine non disponibile");
    const normalized = (Array.isArray(materials) ? materials : []).map(normalizeOrderMaterial).filter((row) => row.product_name);
    let apiError = null;
    try {
      const response = await fetch("/api/save-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_db_id: dbId, materials: normalized }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.error || "API materiali non disponibile");
      if (typeof orderFlowLoadMaterials === "function") await orderFlowLoadMaterials(order);
      return Number(payload.saved || 0);
    } catch (error) {
      apiError = error;
    }
    if (typeof orderFlowRequest !== "function") throw apiError;
    try {
      const saved = await orderFlowRequest("/rest/v1/rpc/replace_order_materials_atomic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_order_id: dbId, p_materials: normalized }),
      });
      if (typeof orderFlowLoadMaterials === "function") await orderFlowLoadMaterials(order);
      return Number(saved || 0);
    } catch (fallbackError) {
      throw new Error(`${apiError?.message || "API materiali non riuscita"}; fallback database: ${fallbackError.message}`);
    }
  }

  orderFlowSaveMaterials = saveMaterialsReliably;

  if (typeof orderFlowFinalize === "function") {
    orderFlowFinalize = async function finalizeOrderWithLinkedInventory(order, materialsSnapshot) {
      if (!order?.id && !order?.db_id) return;
      const meaningful = (Array.isArray(materialsSnapshot) ? materialsSnapshot : []).map(normalizeOrderMaterial).filter((row) => row.product_name);
      let savedMaterials = 0;
      if (meaningful.length) {
        try {
          savedMaterials = await saveMaterialsReliably(order, meaningful);
        } catch (error) {
          setFlashMessage(`Ordine salvato, ma collegamento Magazzino non riuscito: ${error.message}`);
          return;
        }
      }
      const assignedTasks = typeof orderFlowApplyTaskPlan === "function" ? await orderFlowApplyTaskPlan(order).catch(() => 0) : 0;
      if (typeof orderFlowLoadAttachments === "function") await orderFlowLoadAttachments(order).catch(() => {});
      setFlashMessage(`Ordine completato: ${savedMaterials} elementi collegati al Magazzino, ${assignedTasks} task assegnati`);
    };
  }

  async function loadOrderContext(order) {
    const dbId = Number(order?.db_id || order?.internal_id || 0);
    const displayId = Number(order?.id || 0);
    if (!dbId || !displayId || state.detailLoaded.has(dbId) || state.detailLoading.has(dbId) || typeof orderFlowRequest !== "function") return;
    state.detailLoading.add(dbId);
    try {
      const [orderRows, materialRows, inventory] = await Promise.all([
        orderFlowRequest(`/rest/v1/orders?select=id,source_quote_number,source_quote_payload&id=eq.${dbId}&limit=1`),
        orderFlowRequest(`/rest/v1/order_materials?select=*&order_id=eq.${dbId}&order=id.asc`),
        orderFlowRequest("/rest/v1/inventory_items?select=id,sku,name,unit"),
      ]);
      const rawOrder = Array.isArray(orderRows) ? orderRows[0] : null;
      order.sourceQuoteNumber = rawOrder?.source_quote_number || order.sourceQuoteNumber || "";
      order.sourceQuotePayload = rawOrder?.source_quote_payload || order.sourceQuotePayload || {};
      const inventoryById = new Map((Array.isArray(inventory) ? inventory : []).map((item) => [Number(item.id), item]));
      const persisted = (Array.isArray(materialRows) ? materialRows : []).map((row) => orderFlowMaterialShape(row, inventoryById));
      if (!appData.orderMaterials) appData.orderMaterials = {};
      appData.orderMaterials[displayId] = persisted;
      const draft = typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
      if (draft) {
        const inherited = materialsFromQuotePayload(order.sourceQuotePayload);
        draft.materials = persisted.length ? persisted.map(normalizeOrderMaterial) : inherited;
        appState.orderDetailEdits[displayId] = draft;
      }
      state.detailLoaded.add(dbId);
      renderApp();
    } catch (error) {
      console.warn("Collegamento ordine-magazzino non caricato", error);
    } finally {
      state.detailLoading.delete(dbId);
    }
  }

  if (typeof orderDetailEditSave === "function") {
    const baseOrderDetailSave = orderDetailEditSave;
    orderDetailEditSave = function saveOrderDetailWithInventory() {
      const order = getSelectedOrder?.();
      const draft = order && typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
      const materials = (draft?.materials || []).map((row) => ({ ...row }));
      const result = baseOrderDetailSave();
      if (order) {
        saveMaterialsReliably(order, materials)
          .then((saved) => {
            state.detailLoaded.delete(Number(order.db_id || 0));
            setFlashMessage(`Modifiche ordine salvate: ${saved} elementi collegati al Magazzino`);
            renderApp();
          })
          .catch((error) => {
            setFlashMessage(`Ordine aggiornato, ma materiali non salvati: ${error.message}`);
            renderApp();
          });
      }
      return result;
    };
  }

  const baseRenderApp = renderApp;
  renderApp = function renderAppWithOrderInventoryLink() {
    baseRenderApp();
    mountPicker();
    attachPickerEvents();
    if (appState.currentView === "order-detail") void loadOrderContext(getSelectedOrder?.());
  };

  void loadCompleteInventory();
})();
