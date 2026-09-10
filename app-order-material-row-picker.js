(function () {
  function text(value) { return String(value ?? "").trim(); }
  function esc(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function inventory() {
    return (Array.isArray(appData?.inventory) ? appData.inventory : [])
      .map((item) => ({
        ...item,
        id: Number(item?.id || 0),
        name: text(item?.name || item?.product),
        sku: text(item?.sku || item?.mms_code || item?.supplier_material_code),
        unit: text(item?.unit),
      }))
      .filter((item) => item.id && item.name);
  }
  function selectedItem(value) {
    return inventory().find((item) => String(item.id) === String(value));
  }
  function setMaterialFromInventory(row, item) {
    if (!row || !item) return;
    row.inventory_item_id = item.id;
    row.inventoryItemId = item.id;
    row.product_name = item.name;
    row.material = item.name;
    row.inventory_sku = item.sku;
    row.sku = item.sku;
    row.unit = item.unit;
    row.source_type = "mms";
    row.source = "mms";
    row.warehouse_status_note = `Collegato al magazzino - SKU ${item.sku}`;
    row.warehouse = row.warehouse_status_note;
    row.preorder_note = row.preorder_note || "Disponibilita' calcolata dal Magazzino";
    row._requiresInventoryLink = false;
  }

  if (typeof orderDetailEditMaterialRows === "function") {
    orderDetailEditMaterialRows = function linkedMaterialRows(rows) {
      const items = inventory();
      return rows.map((row, index) => {
        const currentId = Number(row.inventory_item_id || row.inventoryItemId || 0);
        const source = text(row.source_type || row.source).toLowerCase() === "cliente" ? "cliente" : "mms";
        const currentMissing = currentId || !row.product_name ? "" : `<option value="" disabled>${esc(row.product_name)} - non collegato</option>`;
        return `<tr>
          <td>
            ${source === "cliente" ? `<input class="field-value" data-order-detail-material-index="${index}" data-order-detail-material-field="product_name" value="${esc(row.product_name)}" placeholder="Nome materiale cliente" />` : `<select class="filter-chip" data-order-detail-material-index="${index}" data-order-detail-material-field="inventory_item_id"><option value="">Seleziona dal Magazzino</option>${currentMissing}${items.map((item) => `<option value="${item.id}" ${currentId === item.id ? "selected" : ""}>${esc(item.name)} - ${esc(item.sku)}</option>`).join("")}</select>`}
            ${row.inventory_sku || row.sku ? `<div class="muted" style="margin-top:5px;">Codice MMS: ${esc(row.inventory_sku || row.sku)}</div>` : ""}
          </td>
          <td><input class="field-value" data-order-detail-material-index="${index}" data-order-detail-material-field="quantity_required" value="${esc(row.quantity_required || 1)}" /></td>
          <td><select class="filter-chip" data-order-detail-material-index="${index}" data-order-detail-material-field="source_type"><option value="mms" ${source === "mms" ? "selected" : ""}>MMS</option><option value="cliente" ${source === "cliente" ? "selected" : ""}>Cliente</option></select></td>
          <td><select class="filter-chip" data-order-detail-material-index="${index}" data-order-detail-material-field="delivery_status"><option value="non_consegnato" ${row.delivery_status !== "consegnato" ? "selected" : ""}>Non consegnato</option><option value="consegnato" ${row.delivery_status === "consegnato" ? "selected" : ""}>Consegnato</option></select></td>
          <td><input class="field-value" data-order-detail-material-index="${index}" data-order-detail-material-field="warehouse_status_note" value="${esc(row.warehouse_status_note)}" readonly /></td>
          ${typeof availabilityCell === "function" ? availabilityCell(row) : `<td>${currentId ? "Collegato" : "Da collegare"}</td>`}
          <td><input class="field-value" data-order-detail-material-index="${index}" data-order-detail-material-field="preorder_note" value="${esc(row.preorder_note)}" /></td>
          <td><button class="mini-btn" data-order-detail-remove-material="${index}" type="button">Rimuovi</button></td>
        </tr>`;
      }).join("");
    };
  }

  if (typeof orderDetailEditHandleField === "function") {
    const baseField = orderDetailEditHandleField;
    orderDetailEditHandleField = function linkedMaterialField(target) {
      if (target.matches?.('[data-order-detail-material-field="inventory_item_id"]')) {
        const draft = typeof orderDetailEditCurrentDraft === "function" ? orderDetailEditCurrentDraft() : null;
        const row = draft?.materials?.[Number(target.dataset.orderDetailMaterialIndex)];
        setMaterialFromInventory(row, selectedItem(target.value));
        renderApp();
        return true;
      }
      if (target.matches?.('[data-order-detail-material-field="source_type"]')) {
        const result = baseField(target);
        renderApp();
        return result;
      }
      return baseField(target);
    };
  }

  if (typeof orderDetailEditHandleClick === "function") {
    const baseClick = orderDetailEditHandleClick;
    orderDetailEditHandleClick = function linkedMaterialClick(target) {
      if (!target.closest?.("[data-order-detail-add-material]")) return baseClick(target);
      const draft = typeof orderDetailEditCurrentDraft === "function" ? orderDetailEditCurrentDraft() : null;
      if (!draft) return false;
      draft.materials.push({ product_name: "", quantity_required: "1", source_type: "mms", delivery_status: "non_consegnato", inventory_item_id: null, inventory_sku: "", warehouse_status_note: "Seleziona un elemento del Magazzino", preorder_note: "", _requiresInventoryLink: true });
      renderApp();
      return true;
    };
  }

  if (typeof orderDetailEditSave === "function") {
    const baseSave = orderDetailEditSave;
    orderDetailEditSave = function requireLinkedNewMaterials() {
      const draft = typeof orderDetailEditCurrentDraft === "function" ? orderDetailEditCurrentDraft() : null;
      const missing = (draft?.materials || []).find((row) => row._requiresInventoryLink && row.source_type === "mms" && !Number(row.inventory_item_id || row.inventoryItemId));
      if (missing) {
        if (typeof setFlashMessage === "function") setFlashMessage("Seleziona il materiale dal Magazzino prima di salvare l'ordine");
        return;
      }
      return baseSave();
    };
  }
})();
