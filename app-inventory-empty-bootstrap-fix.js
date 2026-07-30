(function () {
  const VERSION = "inventory-empty-bootstrap-1";
  const PREFIXES = ["TEX", "HRD", "PCK", "PM", "RIC", "STM", "CRT", "SRT", "STK", "CNZ", "TRT"];

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
    const draft = window.appState?.inventoryDraft || {};
    const parts = codeParts(draft.mms_code);
    const prefix = text(draft.mms_code_prefix || parts?.prefix || "TEX").toUpperCase();
    return PREFIXES.includes(prefix) ? prefix : "TEX";
  }

  function nextNumber(prefix) {
    const normalizedPrefix = PREFIXES.includes(text(prefix).toUpperCase()) ? text(prefix).toUpperCase() : "TEX";
    const highest = (window.appData?.inventory || [])
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
    if (typeof window.appState !== "object") return;
    if (window.appState.currentView !== "inventory") return;

    const draft = window.appState.inventoryDraft || {};
    const isEdit = window.appState.inventorySaveMode === "edit" && text(draft.id);
    if (isEdit) return;

    const hasUserContent = [draft.name, draft.category, draft.supplier_name, draft.supplier_material_code].some(text);
    if (hasUserContent) return;

    const prefix = selectedPrefix();
    const number = nextNumber(prefix);
    window.appState.inventorySaveMode = "create";
    window.appState.inventoryDraft = {
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
    try {
      const payload = await fetchJson("/api/bootstrap");
      if (payload && Array.isArray(payload.orders) && typeof window.fallbackAppData === "object") {
        window.appData = { ...window.fallbackAppData, ...payload };
        if (window.appData.orders.length) {
          const selectedExists = window.appData.orders.some((order) => order.id === window.appState.selectedOrderId);
          if (!selectedExists) window.appState.selectedOrderId = window.appData.orders[0].id;
        } else {
          window.appState.selectedOrderId = null;
        }
      }
    } catch (error) {
      console.warn(`${VERSION}: bootstrap refresh skipped`, error);
    }

    try {
      const inventoryPayload = await fetchJson("/api/inventory");
      if (inventoryPayload && Array.isArray(inventoryPayload.items) && typeof window.appData === "object") {
        window.appData.inventory = inventoryPayload.items;
      }
    } catch (error) {
      console.warn(`${VERSION}: inventory refresh skipped`, error);
    }

    resetEmptyInventoryDraftCode();
    if (typeof window.renderApp === "function") window.renderApp();
  }

  window.mmsRefreshDatabaseBackedState = refreshDatabaseBackedState;
  window.setTimeout(refreshDatabaseBackedState, 0);
  window.setTimeout(refreshDatabaseBackedState, 1200);
})();
