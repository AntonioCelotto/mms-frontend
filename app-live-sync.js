(function () {
  const INTERVAL_MS = 15000;
  let previous = null;
  let running = false;
  let pendingRender = false;

  async function read(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Sincronizzazione ${path}: HTTP ${response.status}`);
    return response.json();
  }

  function changed(next, key) {
    return JSON.stringify(previous?.[key] || null) !== JSON.stringify(next?.[key] || null);
  }

  function canRender() {
    if (appState.busy || document.hidden) return false;
    if (["new-order", "order-create", "order-detail"].includes(appState.currentView)) return false;
    const active = document.activeElement;
    return !active?.matches?.("input, textarea, select, [contenteditable]");
  }

  function renderWhenSafe() {
    if (canRender()) {
      pendingRender = false;
      renderApp();
    } else {
      pendingRender = true;
    }
  }

  function refreshMaterialChoices() {
    // Update existing selectors in place; text fields and the draft stay intact.
    const items = Array.isArray(appData.inventory) ? appData.inventory : [];
    const quoteSelects = document.querySelectorAll("[data-quote-inventory-pick]");
    quoteSelects.forEach((select) => {
      const known = new Set(Array.from(select.options).map((option) => option.value));
      const fragment = document.createDocumentFragment();
      items.forEach((item) => {
        const value = String(item.id || item.sku || item.name || "");
        if (!value || known.has(value)) return;
        const option = new Option(`${item.item_type === "articolo" ? "Articolo" : "Materiale"}: ${item.name || item.product || "Elemento"} (${item.mms_code || item.sku || ""}) - prezzo ${item.retail_price ?? ""}`, value);
        fragment.appendChild(option);
      });
      select.appendChild(fragment);
    });
    document.querySelectorAll('[data-order-detail-material-field="inventory_item_id"]').forEach((select) => {
      const known = new Set(Array.from(select.options).map((option) => option.value));
      items.forEach((item) => {
        const value = String(item.id || "");
        if (value && !known.has(value)) select.add(new Option(`${item.name || item.product || "Elemento"} - ${item.sku || item.mms_code || ""}`, value));
      });
    });
  }

  async function tick() {
    if (running || document.hidden || !window.mmsAuthProfile) return;
    running = true;
    try {
      const next = await read("/api/sync-state");
      if (previous) {
        const inventoryChanged = changed(next, "inventory") && next.inventory;
        const ordersChanged = changed(next, "orders") || changed(next, "tasks");
        const quotesChanged = changed(next, "quotes") && next.quotes;
        const jobs = [];
        if (ordersChanged) jobs.push(read("/api/bootstrap").then((payload) => {
          if (!Array.isArray(payload.orders)) throw new Error("Archivio ordini non valido");
          // Preserve inventory and open drafts. A failed/empty request must not
          // replace the visible archive with a blank fallback.
          appData = { ...appData, ...payload, inventory: appData.inventory };
          if (appState.currentView === "calendar" || appState.currentView === "orders") renderWhenSafe();
        }));
        if (inventoryChanged) jobs.push(read("/api/inventory").then((payload) => {
          if (!Array.isArray(payload.items)) throw new Error("Magazzino non valido");
          if (!payload.items.length && appData.inventory?.length) throw new Error("Magazzino vuoto inatteso: dati precedenti conservati");
          appData.inventory = payload.items;
          refreshMaterialChoices();
          if (appState.currentView === "inventory") renderWhenSafe();
        }));
        if (quotesChanged && typeof window.quoteDatabaseRefresh === "function") jobs.push(window.quoteDatabaseRefresh());
        const results = await Promise.allSettled(jobs);
        if (results.some((result) => result.status === "rejected")) {
          console.warn("Aggiornamento tra operatori incompleto", results.filter((result) => result.status === "rejected"));
          return; // Retry the same version on the next poll.
        }
      }
      previous = next;
      if (pendingRender && canRender()) renderWhenSafe();
    } catch (error) {
      console.warn("Aggiornamento tra operatori non disponibile", error);
    } finally {
      running = false;
    }
  }

  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  document.addEventListener("focusout", () => { if (pendingRender) setTimeout(() => { if (canRender()) renderWhenSafe(); }, 0); });
  window.addEventListener("mms-auth-profile", () => { previous = null; tick(); });
  setInterval(tick, INTERVAL_MS);
  tick();
})();
