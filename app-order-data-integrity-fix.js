(() => {
  const state = {
    activeOrderDbId: 0,
    loadingOrderDbId: 0,
  };

  function text(value) {
    return String(value ?? "").trim();
  }

  function number(value, fallback = 0) {
    const parsed = Number(text(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function inventoryMaps() {
    const items = Array.isArray(appData?.inventory) ? appData.inventory : [];
    const byId = new Map();
    const bySku = new Map();
    items.forEach((item) => {
      const id = Number(item?.id || 0);
      const sku = text(item?.sku || item?.mms_code || item?.supplier_material_code).toUpperCase();
      if (id) byId.set(id, item);
      if (sku) bySku.set(sku, item);
    });
    return { byId, bySku };
  }

  function materialsFromQuote(order) {
    const rows = [];
    const articles = Array.isArray(order?.sourceQuotePayload?.articles)
      ? order.sourceQuotePayload.articles
      : [];
    articles.forEach((article) => {
      (Array.isArray(article?.materials) ? article.materials : []).forEach((material) => {
        if (!text(material?.material || material?.product_name || material?.name)) return;
        rows.push({
          ...material,
          product_name: material.product_name || material.material || material.name,
          quantity_required: material.quantity_required || material.quantity || material.qty || 1,
          source_type: text(material.source_type || material.source).toLowerCase() === "cliente" ? "cliente" : "mms",
          inventory_item_id: Number(material.inventory_item_id || material.inventoryItemId || 0) || null,
          inventory_sku: material.inventory_sku || material.sku || material.mms_code || material.product_code || "",
        });
      });
    });
    return rows;
  }

  function materialsForOrder(order) {
    const persisted = appData?.orderMaterials?.[Number(order?.id)] || [];
    return persisted.length ? persisted : materialsFromQuote(order);
  }

  function availabilityFor(material, inventory = inventoryMaps()) {
    const source = text(material?.source_type || material?.source).toLowerCase();
    if (source === "cliente") {
      return { level: "client", missing: 0, label: "Materiale cliente", detail: "Fornitura cliente" };
    }

    const inventoryId = Number(material?.inventory_item_id || material?.inventoryItemId || 0);
    const inventorySku = text(material?.inventory_sku || material?.sku || material?.mms_code || material?.product_code).toUpperCase();
    const item = inventory.byId.get(inventoryId) || inventory.bySku.get(inventorySku);
    const unit = text(material?.unit || item?.unit);
    const suffix = unit ? ` ${unit}` : "";
    const required = number(material?.quantity_required ?? material?.quantity, 1);
    const orderReserved = number(material?.reserved_quantity ?? material?.order_reserved, 0);
    const storedMissing = number(material?.missing_quantity, 0);

    if (!inventoryId || !item) {
      return {
        level: "warning",
        missing: Math.max(required, 1),
        label: "Non collegato",
        detail: "Collegamento Magazzino mancante",
      };
    }

    const stock = number(item.available ?? item.available_quantity, 0);
    const totalReserved = number(item.reserved ?? item.reserved_quantity, 0);
    const free = Math.max(0, stock - totalReserved);
    const computedMissing = Math.max(0, required - orderReserved - free);
    const missing = Math.max(storedMissing, computedMissing);

    if (missing > 0) {
      return {
        level: "missing",
        missing,
        label: `Mancano ${missing}${suffix}`,
        detail: `Stock ${stock}${suffix} - impegnato totale ${totalReserved}${suffix} - richiesto ${required}${suffix}`,
      };
    }

    return {
      level: "ok",
      missing: 0,
      label: "Disponibile",
      detail: `Stock ${stock}${suffix} - riservato ordine ${orderReserved}${suffix} - libero ${free}${suffix}`,
    };
  }

  function availabilitySummary(order) {
    const rows = materialsForOrder(order);
    if (!rows.length) return { level: "empty", label: "Nessun materiale", missingCount: 0 };
    const inventory = inventoryMaps();
    const results = rows.map((row) => availabilityFor(row, inventory));
    const missing = results.filter((item) => item.level === "missing");
    const unlinked = results.filter((item) => item.level === "warning");
    const linked = results.filter((item) => item.level === "ok");
    if (missing.length) return { level: "missing", label: `${missing.length} mancanti`, missingCount: missing.length };
    if (unlinked.length) return { level: "warning", label: `${unlinked.length} da collegare`, missingCount: unlinked.length };
    if (linked.length) return { level: "ok", label: "Disponibili", missingCount: 0 };
    return { level: "client", label: "Materiali cliente", missingCount: 0 };
  }

  function availabilityCell(material) {
    const availability = availabilityFor(material);
    return `
      <td>
        <span class="order-stock-badge ${availability.level}">${escapeHtml(availability.label)}</span>
        <div class="order-stock-detail">${escapeHtml(availability.detail)}</div>
      </td>
    `;
  }

  if (typeof orderDetailEditMaterialRows === "function") {
    orderDetailEditMaterialRows = function orderDetailMaterialRowsWithAvailability(rows) {
      return rows.map((row, index) => `
        <tr>
          <td><input class="field-value" data-order-detail-material-index="${index}" data-order-detail-material-field="product_name" value="${escapeHtml(row.product_name)}" /></td>
          <td><input class="field-value" data-order-detail-material-index="${index}" data-order-detail-material-field="quantity_required" value="${escapeHtml(row.quantity_required)}" /></td>
          <td>
            <select class="filter-chip" data-order-detail-material-index="${index}" data-order-detail-material-field="source_type">
              <option value="mms" ${row.source_type === "mms" ? "selected" : ""}>MMS</option>
              <option value="cliente" ${row.source_type === "cliente" ? "selected" : ""}>Cliente</option>
            </select>
          </td>
          <td>
            <select class="filter-chip" data-order-detail-material-index="${index}" data-order-detail-material-field="delivery_status">
              <option value="non_consegnato" ${row.delivery_status !== "consegnato" ? "selected" : ""}>Non consegnato</option>
              <option value="consegnato" ${row.delivery_status === "consegnato" ? "selected" : ""}>Consegnato</option>
            </select>
          </td>
          <td><input class="field-value" data-order-detail-material-index="${index}" data-order-detail-material-field="warehouse_status_note" value="${escapeHtml(row.warehouse_status_note)}" /></td>
          ${availabilityCell(row)}
          <td><input class="field-value" data-order-detail-material-index="${index}" data-order-detail-material-field="preorder_note" value="${escapeHtml(row.preorder_note)}" /></td>
          <td><button class="mini-btn" data-order-detail-remove-material="${index}" type="button">Rimuovi</button></td>
        </tr>
      `).join("");
    };
  }

  if (typeof orderDetailEditMarkup === "function") {
    const baseDetailMarkup = orderDetailEditMarkup;
    orderDetailEditMarkup = function orderDetailMarkupWithAvailability() {
      return baseDetailMarkup().replace(
        "<th>Magazzino</th><th>Nota</th>",
        "<th>Magazzino</th><th>Disponibilita'</th><th>Nota</th>"
      );
    };
  }

  function mountArchiveAvailability() {
    if (appState.currentView !== "orders") return;
    const section = document.querySelector("section.view.active");
    const table = section?.querySelector("table");
    if (!table) return;
    const actionHeader = Array.from(table.querySelectorAll("thead th")).find(
      (cell) => cell.textContent.trim() === "Azioni"
    );
    if (!actionHeader) return;

    // Availability can be rendered before the inventory and the opened-order
    // materials finish loading. Remove the previous snapshot and rebuild it
    // from the latest in-memory data on every render.
    const previousHeader = actionHeader.previousElementSibling;
    if (previousHeader?.textContent.trim() === "Disponibilita' materiali") previousHeader.remove();
    table.querySelectorAll("tbody tr").forEach((row) => {
      const actionCell = row.querySelector("[data-detail]")?.closest("td");
      if (actionCell?.previousElementSibling?.querySelector(".order-stock-badge")) {
        actionCell.previousElementSibling.remove();
      }
    });
    actionHeader.insertAdjacentHTML("beforebegin", "<th>Disponibilita' materiali</th>");

    table.querySelectorAll("tbody tr").forEach((row) => {
      const button = row.querySelector("[data-detail]");
      const actionCell = button?.closest("td");
      if (!button || !actionCell) return;
      const order = (appData.orders || []).find(
        (item) => String(item.id) === String(button.dataset.detail)
      );
      if (!order) return;
      const summary = availabilitySummary(order);
      actionCell.insertAdjacentHTML(
        "beforebegin",
        `<td><span class="order-stock-badge ${summary.level}">${escapeHtml(summary.label)}</span></td>`
      );
    });
    table.dataset.orderAvailabilityMounted = "true";
  }

  function mountDetailWarning() {
    if (appState.currentView !== "order-detail") return;
    const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
    const panel = document.querySelector(".order-detail-edit-panel .surface-inner");
    if (!order || !panel) return;

    // The first render can still contain the quote fallback while the real
    // order materials and the inventory are loading. Always discard the
    // previous alert and calculate it again only from the completed state.
    panel.querySelector("[data-order-stock-alert]")?.remove();
    const materialsLoading =
      (typeof orderDetailLiveNeedsLoad === "function" && orderDetailLiveNeedsLoad(order)) ||
      !!document.querySelector(".order-detail-edit-panel .empty-state")?.textContent.includes("Caricamento materiali");
    if (materialsLoading) return;

    const summary = availabilitySummary(order);
    if (summary.level !== "missing" && summary.level !== "warning") return;
    const materialSection = Array.from(panel.querySelectorAll(".order-detail-edit-section")).find(
      (section) => section.querySelector("h3")?.textContent.trim() === "Materiali ordine"
    );
    materialSection?.insertAdjacentHTML(
      "beforebegin",
      `<div class="order-stock-alert ${summary.level}" data-order-stock-alert>
        <strong>Attenzione Magazzino</strong>
        <span>${summary.level === "missing"
          ? `${summary.missingCount} materiali non coperti dalle quantita' disponibili.`
          : `${summary.missingCount} materiali MMS non sono collegati a un articolo di Magazzino.`}</span>
      </div>`
    );
  }

  function cleanDate(value) {
    const candidate = text(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
  }

  function priorityKey(value) {
    return text(value).toLowerCase() === "express" ? "express" : "standard";
  }

  async function loadOrderTruth(order) {
    const dbId = Number(order?.db_id || order?.internal_id || 0);
    if (!dbId || state.loadingOrderDbId === dbId || typeof orderFlowRequest !== "function") return;
    state.loadingOrderDbId = dbId;
    try {
      const rows = await orderFlowRequest(
        `/rest/v1/orders?select=id,order_date,estimated_delivery_date,category,priority,internal_notes,status,production_started_at,completed_at,actual_delivery_date&id=eq.${dbId}&limit=1`
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return;
      order.orderDate = row.order_date || "";
      order.estimatedDelivery = row.estimated_delivery_date || "";
      order.eta = row.estimated_delivery_date || "Da definire";
      order.category = row.category || order.category;
      order.priority = text(row.priority).toLowerCase() === "express" ? "Express" : "Standard";
      order.notes = row.internal_notes || "";
      order.statusKey = row.status || order.statusKey;
      order.productionStartedAt = row.production_started_at || "";
      order.completedAt = row.completed_at || "";
      order.actualDeliveryDate = row.actual_delivery_date || "";

      const draft = typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
      if (draft) {
        draft.orderDate = order.orderDate;
        draft.estimatedDelivery = order.estimatedDelivery;
        draft.category = order.category;
        draft.priority = order.priority;
        draft.notes = order.notes;
        if (typeof orderDetailEditWriteStored === "function") {
          orderDetailEditWriteStored(Number(order.id), draft);
        }
      }
      renderApp();
    } catch (error) {
      setFlashMessage(`Dati ordine non aggiornati: ${error.message}`);
    } finally {
      state.loadingOrderDbId = 0;
    }
  }

  function ensureOrderTruthLoaded() {
    if (appState.currentView !== "order-detail") {
      state.activeOrderDbId = 0;
      return;
    }
    const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
    const dbId = Number(order?.db_id || order?.internal_id || 0);
    if (!dbId || state.activeOrderDbId === dbId) return;
    state.activeOrderDbId = dbId;
    void loadOrderTruth(order);
  }

  async function persistCoreOrderFields(order, draft) {
    const dbId = Number(order?.db_id || order?.internal_id || 0);
    if (!dbId || typeof orderFlowRequest !== "function") return;
    const rows = await orderFlowRequest(
      `/rest/v1/orders?id=eq.${dbId}&select=id,order_date,estimated_delivery_date,category,priority,internal_notes`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          order_date: cleanDate(draft.orderDate),
          estimated_delivery_date: cleanDate(draft.estimatedDelivery),
          category: text(draft.category) || text(order.category) || "Da definire",
          priority: priorityKey(draft.priority),
          internal_notes: text(draft.notes) || null,
        }),
      }
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) throw new Error("Nessuna conferma dal database");
    order.orderDate = row.order_date || "";
    order.estimatedDelivery = row.estimated_delivery_date || "";
    order.eta = row.estimated_delivery_date || "Da definire";
    order.category = row.category || order.category;
    order.priority = text(row.priority).toLowerCase() === "express" ? "Express" : "Standard";
    order.notes = row.internal_notes || "";
    draft.orderDate = order.orderDate;
    draft.estimatedDelivery = order.estimatedDelivery;
    if (typeof orderDetailEditWriteStored === "function") {
      orderDetailEditWriteStored(Number(order.id), draft);
    }
  }

  if (typeof orderDetailEditSave === "function") {
    const baseDetailSave = orderDetailEditSave;
    orderDetailEditSave = function orderDetailSaveWithDatabaseFields() {
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const draft = order && typeof orderDetailEditDraftFor === "function"
        ? orderDetailEditDraftFor(order)
        : null;
      const snapshot = draft ? { ...draft } : null;
      const result = baseDetailSave();
      if (order && snapshot) {
        persistCoreOrderFields(order, snapshot).catch((error) => {
          setFlashMessage(`Data e dati ordine non salvati: ${error.message}`);
          renderApp();
        });
      }
      return result;
    };
  }

  const baseRenderApp = renderApp;
  renderApp = function renderAppWithOrderDataIntegrity() {
    baseRenderApp();
    mountArchiveAvailability();
    mountDetailWarning();
    ensureOrderTruthLoaded();
  };

  const style = document.createElement("style");
  style.id = "order-data-integrity-styles";
  style.textContent = `
    .order-stock-badge {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      padding: 3px 9px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
      background: #eef1f4;
      color: #3f4a55;
    }
    .order-stock-badge.ok { background: #e4f5ec; color: #17633d; }
    .order-stock-badge.missing { background: #fde8e7; color: #9f2d28; }
    .order-stock-badge.warning { background: #fff1d8; color: #825014; }
    .order-stock-badge.client { background: #e8eff7; color: #315778; }
    .order-stock-detail { margin-top: 5px; max-width: 250px; font-size: 11px; color: #68727d; line-height: 1.35; }
    .order-stock-alert {
      display: grid;
      gap: 3px;
      margin: 18px 0;
      padding: 12px 14px;
      border-left: 4px solid #d33c32;
      background: #fff3f2;
      color: #7b2824;
    }
    .order-stock-alert.warning { border-left-color: #c77a19; background: #fff7e8; color: #74470f; }
  `;
  if (!document.getElementById(style.id)) document.head.appendChild(style);

  if (document.getElementById("app")?.innerHTML) renderApp();
})();