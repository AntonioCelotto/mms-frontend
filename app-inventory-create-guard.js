(function () {
  const API_URL = "/api/inventory";
  const DEFAULT_DRAFT = {
    id: "",
    item_type: "materiale",
    name: "",
    category: "",
    material_origin: "mms",
    supplier_name: "",
    supplier_material_code: "",
    mms_code: "",
    unit: "",
    available_quantity: "0",
    reserved_quantity: "0",
    reorder_threshold: "0",
    color: "",
    description: "",
    unit_cost: "",
    retail_price: "",
    status: "Disponibile",
    notes: "",
    mms_code_prefix: "TEX",
  };

  function text(value) {
    return String(value ?? "").trim();
  }

  function normalizeItem(item) {
    const raw = item && typeof item === "object" ? item : {};
    return {
      ...raw,
      id: raw.id || "",
      item_type: raw.item_type === "articolo" ? "articolo" : "materiale",
      name: raw.name || raw.product || "",
      sku: raw.sku || raw.mms_code || raw.supplier_material_code || "",
      material_origin: raw.material_origin || "mms",
      supplier_name: raw.supplier_name || "",
      supplier_material_code: raw.supplier_material_code || "",
      mms_code: raw.mms_code || "",
      category: raw.category || "",
      color: raw.color || "",
      unit: raw.unit || "",
      available_quantity: raw.available_quantity ?? raw.available ?? 0,
      reserved_quantity: raw.reserved_quantity ?? raw.reserved ?? 0,
      reorder_threshold: raw.reorder_threshold ?? 0,
      unit_cost: raw.unit_cost ?? raw.cost ?? "",
      retail_price: raw.retail_price ?? raw.public_price ?? "",
      status: raw.status || "Disponibile",
      description: raw.description || "",
      notes: raw.notes || raw.reorder || "",
    };
  }

  function codeParts(value) {
    const match = text(value).toUpperCase().match(/^MMS-([A-Z0-9]+)-(\d+)$/);
    if (!match) return null;
    return { prefix: match[1], number: Number(match[2]) || 0 };
  }

  function currentPrefix() {
    const draft = appState.inventoryDraft || {};
    const parts = codeParts(draft.mms_code);
    return parts?.prefix || draft.mms_code_prefix || "TEX";
  }

  function nextMmsCode(prefix) {
    const normalizedPrefix = text(prefix || "TEX").toUpperCase();
    const max = (appData.inventory || [])
      .map(normalizeItem)
      .map((item) => codeParts(item.mms_code || item.sku))
      .filter((parts) => parts?.prefix === normalizedPrefix)
      .reduce((highest, parts) => Math.max(highest, parts.number), 0);
    return `MMS-${normalizedPrefix}-${String(max + 1).padStart(3, "0")}`;
  }

  function freshDraft(type, prefix) {
    const nextPrefix = text(prefix || currentPrefix() || "TEX").toUpperCase();
    return {
      ...DEFAULT_DRAFT,
      item_type: type === "articolo" ? "articolo" : "materiale",
      mms_code_prefix: nextPrefix,
      mms_code: nextMmsCode(nextPrefix),
    };
  }

  async function request(method, body, query = "") {
    const response = await fetch(`${API_URL}${query}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || payload.error || "Operazione magazzino non riuscita");
    return payload;
  }

  async function reloadInventory() {
    const payload = await request("GET");
    appData.inventory = (payload.items || []).map(normalizeItem);
  }

  function ensureDraftCode(draft) {
    if ((draft.material_origin || "mms") !== "mms") return;
    const prefix = text(draft.mms_code_prefix || currentPrefix() || "TEX").toUpperCase();
    draft.mms_code_prefix = prefix;
    if (!text(draft.mms_code)) draft.mms_code = nextMmsCode(prefix);
  }

  function draftPayload(mode) {
    const draft = { ...DEFAULT_DRAFT, ...(appState.inventoryDraft || {}) };
    ensureDraftCode(draft);
    const isMms = (draft.material_origin || "mms") !== "fornitore";
    const payload = {
      item_type: draft.item_type === "articolo" ? "articolo" : "materiale",
      sku: isMms ? draft.mms_code : undefined,
      name: draft.name,
      category: draft.category,
      material_origin: draft.material_origin || "mms",
      supplier_name: draft.supplier_name,
      supplier_material_code: draft.supplier_material_code,
      mms_code: draft.mms_code,
      unit: draft.unit,
      available_quantity: draft.available_quantity,
      reserved_quantity: draft.reserved_quantity,
      reorder_threshold: draft.reorder_threshold,
      color: draft.color,
      description: draft.description,
      unit_cost: draft.unit_cost,
      retail_price: draft.retail_price,
      status: draft.status,
      notes: draft.notes,
      import_source: "manuale",
    };
    if (mode === "edit") payload.id = draft.id;
    return payload;
  }

  async function guardedSave() {
    const draft = appState.inventoryDraft || {};
    const mode = appState.inventorySaveMode === "edit" && text(draft.id) ? "edit" : "create";
    if (!text(draft.name)) {
      setFlashMessage("Inserisci il nome del materiale o articolo");
      renderApp();
      return;
    }
    setBusy(true);
    try {
      await request(mode === "edit" ? "PATCH" : "POST", draftPayload(mode));
      await reloadInventory();
      const nextType = draft.item_type === "articolo" ? "articolo" : "materiale";
      appState.inventorySaveMode = "create";
      appState.inventoryDraft = freshDraft(nextType, draft.mms_code_prefix);
      setFlashMessage(mode === "edit" ? "Elemento magazzino aggiornato" : "Elemento magazzino salvato");
    } catch (error) {
      setFlashMessage(error.message || "Elemento magazzino non salvato");
    } finally {
      appState.busy = false;
      renderApp();
    }
  }

  function itemById(id) {
    return (appData.inventory || []).map(normalizeItem).find((item) => String(item.id) === String(id));
  }

  function draftFromItem(item) {
    const normalized = normalizeItem(item);
    const parts = codeParts(normalized.mms_code || normalized.sku);
    return {
      ...DEFAULT_DRAFT,
      ...normalized,
      id: normalized.id || "",
      item_type: normalized.item_type || "materiale",
      available_quantity: String(normalized.available_quantity ?? 0),
      reserved_quantity: String(normalized.reserved_quantity ?? 0),
      reorder_threshold: String(normalized.reorder_threshold ?? 0),
      unit_cost: String(normalized.unit_cost ?? ""),
      retail_price: String(normalized.retail_price ?? ""),
      mms_code_prefix: parts?.prefix || "TEX",
    };
  }

  document.addEventListener(
    "click",
    (event) => {
      const newButton = event.target.closest?.("[data-inventory-ma-new]");
      if (newButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const type = appState.inventoryDraft?.item_type || "materiale";
        appState.inventorySaveMode = "create";
        appState.inventoryDraft = freshDraft(type);
        renderApp();
        return;
      }

      const editButton = event.target.closest?.("[data-inventory-ma-edit]");
      if (editButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const item = itemById(editButton.dataset.inventoryMaEdit);
        if (!item) return;
        appState.inventorySaveMode = "edit";
        appState.inventoryDraft = draftFromItem(item);
        renderApp();
        return;
      }

      const saveButton = event.target.closest?.("[data-inventory-ma-save]");
      if (saveButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!appState.busy) guardedSave();
      }
    },
    true
  );
})();
