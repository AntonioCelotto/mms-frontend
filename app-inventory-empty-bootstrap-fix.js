(function () {
  const VERSION = "inventory-empty-bootstrap-1";
  const PREFIXES = ["TEX", "HRD", "PCK", "PM", "RIC", "STM", "CRT", "SRT", "STK", "CNZ", "TRT"];

  function getState() {
    try {
      return typeof appState === "object" ? appState : null;
    } catch (error) {
      return null;
    }
  }

  function getData() {
    try {
      return typeof appData === "object" ? appData : null;
    } catch (error) {
      return null;
    }
  }

  function hasFallbackData() {
    try {
      return typeof fallbackAppData === "object" && !!fallbackAppData;
    } catch (error) {
      return false;
    }
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function padNumber(value) {
    const digits = text(value).replace(/\D/g, "");
    const parsed = Number.parseInt(digits || "0", 10);
    return String(Number.isFinite(parsed) && parsed > 0 ? parsed : 1).padStart(3, "0");
  }

  function codeParts(value) {
    const match = text(value).toUpperCase().match(/^MMS-([A-Z0-9]+)-(\d+)$/);
    if (!match) return null;
    return { prefix: match[1], number: Number.parseInt(match[2], 10) || 0 };
  }

  function normalizeItem(item) {
    const raw = item && typeof item === "object" ? item : {};
    return {
      mms_code: raw.mms_code || "",
      sku: raw.sku || "",
    };
  }

  function selectedPrefix() {
    const draft = getState()?.inventoryDraft || {};
    const parts = codeParts(draft.mms_code);
    const prefix = text(draft.mms_code_prefix || parts?.prefix || "TEX").toUpperCase();
    return PREFIXES.includes(prefix) ? prefix : "TEX";
  }

  function nextNumber(prefix) {
    const data = getData();
    const normalizedPrefix = PREFIXES.includes(text(prefix).toUpperCase()) ? text(prefix).toUpperCase() : "TEX";
    const highest = (data?.inventory || [])
      .map(normalizeItem)
      .map((item) => codeParts(item.mms_code || item.sku))
      .filter((parts) => parts?.prefix === normalizedPrefix)
      .reduce((max, parts) => Math.max(max, parts.number || 0), 0);
    return padNumber(highest + 1);
  }

  function composeCode(prefix, number) {
    return `MMS-${prefix}-${padNumber(number)}`;
  }

  function resetEmptyInventoryDraftCode() {
    const state = getState();
    if (!state || state.currentView !== "inventory") return;

    const draft = state.inventoryDraft || {};
    const isEdit = state.inventorySaveMode === "edit" && text(draft.id);
    if (isEdit) return;

    const hasUserContent = [draft.name, draft.category, draft.supplier_name, draft.supplier_material_code].some(text);
    if (hasUserContent) return;

    const prefix = selectedPrefix();
    const number = nextNumber(prefix);
    state.inventorySaveMode = "create";
    state.inventoryDraft = {
      ...draft,
      mms_code_prefix: prefix,
      mms_code_number: number,
      mms_code: composeCode(prefix, number),
      sku: composeCode(prefix, number),
    };
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Request failed: ${path}`);
    return response.json();
  }

  async function refreshDatabaseBackedState() {
    const state = getState();
    if (!state) return;

    try {
      const payload = await fetchJson("/api/bootstrap");
      if (payload && Array.isArray(payload.orders) && hasFallbackData()) {
        appData = { ...fallbackAppData, ...payload };
        if (appData.orders.length) {
          const selectedExists = appData.orders.some((order) => order.id === state.selectedOrderId);
          if (!selectedExists) state.selectedOrderId = appData.orders[0].id;
        } else {
          state.selectedOrderId = null;
        }
      }
    } catch (error) {
      console.warn(`${VERSION}: bootstrap refresh skipped`, error);
    }

    try {
      const inventoryPayload = await fetchJson("/api/inventory");
      if (inventoryPayload && Array.isArray(inventoryPayload.items) && getData()) {
        appData.inventory = inventoryPayload.items;
      }
    } catch (error) {
      console.warn(`${VERSION}: inventory refresh skipped`, error);
    }

    resetEmptyInventoryDraftCode();
    try {
      if (typeof renderApp === "function") renderApp();
    } catch (error) {
      console.warn(`${VERSION}: render skipped`, error);
    }
  }

  window.mmsRefreshDatabaseBackedState = refreshDatabaseBackedState;
  window.setTimeout(refreshDatabaseBackedState, 0);
  window.setTimeout(refreshDatabaseBackedState, 1200);
})();
