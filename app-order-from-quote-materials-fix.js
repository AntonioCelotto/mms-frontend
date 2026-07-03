(function () {
  function text(value) {
    return String(value ?? "").trim();
  }

  function normalizeQuantity(value) {
    return text(value || "1") || "1";
  }

  function normalizeQuoteMaterial(material, quoteId, articleName) {
    const raw = material && typeof material === "object" ? material : {};
    const productName = text(raw.product_name || raw.material || raw.name || raw.title);
    if (!productName) return null;
    const inventorySku = text(raw.inventory_sku || raw.sku);
    const inventoryId = raw.inventory_item_id || raw.inventoryItemId || null;
    return {
      product_name: productName,
      material: productName,
      quantity_required: normalizeQuantity(raw.quantity_required || raw.quantity || raw.qty),
      quantity: normalizeQuantity(raw.quantity_required || raw.quantity || raw.qty),
      inventory_item_id: inventoryId,
      inventoryItemId: inventoryId,
      inventory_sku: inventorySku,
      sku: inventorySku,
      unit: text(raw.unit),
      source_type: text(raw.source_type || raw.source) || "mms",
      source: text(raw.source_type || raw.source) || "mms",
      delivery_status: text(raw.delivery_status || raw.delivery) || "non_consegnato",
      delivery: text(raw.delivery_status || raw.delivery) || "non_consegnato",
      warehouse_status_note: text(raw.warehouse_status_note || raw.warehouse) || (inventorySku ? `SKU ${inventorySku}` : `Da preventivo ${quoteId || ""}`),
      warehouse: text(raw.warehouse_status_note || raw.warehouse) || (inventorySku ? `SKU ${inventorySku}` : `Da preventivo ${quoteId || ""}`),
      preorder_note: text(raw.preorder_note || raw.preorder || raw.note || raw.notes) || `Articolo: ${articleName || "n/d"} - prezzo ${raw.price || "n/d"}`,
      preorder: text(raw.preorder_note || raw.preorder || raw.note || raw.notes) || `Articolo: ${articleName || "n/d"} - prezzo ${raw.price || "n/d"}`,
      notes: text(raw.notes || raw.note),
    };
  }

  if (typeof orderFromQuoteDraftMaterials === "function") {
    orderFromQuoteDraftMaterials = function orderFromQuoteDraftMaterialsWithInventory(quote) {
      const materials = [];
      (quote?.articles || []).forEach((article) => {
        (article.materials || []).forEach((material) => {
          const normalized = normalizeQuoteMaterial(material, quote?.id, article?.name);
          if (normalized) materials.push(normalized);
        });
      });
      return materials.length ? materials : [{ ...EMPTY_MATERIAL_DRAFT }];
    };
  }

  if (typeof getCleanDraftMaterials === "function") {
    getCleanDraftMaterials = function getCleanDraftMaterialsWithInventory() {
      return (Array.isArray(appState.draftMaterials) ? appState.draftMaterials : [])
        .map((material) => normalizeQuoteMaterial(material, appState.orderFromQuoteDraft?.quote?.id, ""))
        .filter(Boolean);
    };
  }

  const baseFetch = window.fetch.bind(window);
  window.fetch = function fetchWithOrderDbId(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/save-materials") && init?.body) {
      try {
        const payload = JSON.parse(init.body);
        if (!payload.order_db_id && payload.order_id) {
          init = { ...init, body: JSON.stringify({ ...payload, order_db_id: payload.order_id }) };
        }
      } catch (error) {
        // Leave non-JSON requests untouched.
      }
    }
    return baseFetch(input, init);
  };
})();