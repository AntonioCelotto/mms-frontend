(function () {
  const VERSION = "empty-orders-stability-1";

  function data() {
    return typeof appData === "object" && appData ? appData : null;
  }

  function state() {
    return typeof appState === "object" && appState ? appState : null;
  }

  function fallback() {
    return typeof fallbackAppData === "object" && fallbackAppData ? fallbackAppData : {};
  }

  function ensureCollections(target) {
    target.orders = Array.isArray(target.orders) ? target.orders : [];
    target.clients = Array.isArray(target.clients) ? target.clients : [];
    target.calendar = Array.isArray(target.calendar) ? target.calendar : [];
    target.inventory = Array.isArray(target.inventory) ? target.inventory : [];
    target.accounts = Array.isArray(target.accounts) ? target.accounts : [];
    target.payments = Array.isArray(target.payments) ? target.payments : [];
    target.alerts = Array.isArray(target.alerts) ? target.alerts : [];
    target.seamstresses = Array.isArray(target.seamstresses) ? target.seamstresses : [];
    target.departments = Array.isArray(target.departments) ? target.departments : [];
    target.aiFeed = Array.isArray(target.aiFeed) ? target.aiFeed : [];
    target.orderTasks = target.orderTasks && typeof target.orderTasks === "object" ? target.orderTasks : {};
    target.orderMaterials = target.orderMaterials && typeof target.orderMaterials === "object" ? target.orderMaterials : {};
    target.orderTimeline = target.orderTimeline && typeof target.orderTimeline === "object" ? target.orderTimeline : {};
    target.metrics = target.metrics && typeof target.metrics === "object" ? target.metrics : {};
    return target;
  }

  function applyBootstrapPayload(payload) {
    if (!payload || !Array.isArray(payload.orders)) return false;
    const nextData = ensureCollections({ ...fallback(), ...payload });
    appData = nextData;

    const currentState = state();
    if (!currentState) return true;

    if (nextData.orders.length) {
      const selectedExists = nextData.orders.some((order) => String(order.id) === String(currentState.selectedOrderId));
      if (!selectedExists) currentState.selectedOrderId = nextData.orders[0].id;
    } else {
      currentState.selectedOrderId = null;
      currentState.filters = { department: "all", status: "all", payment: "all", priority: "all", ...(currentState.filters || {}) };
      currentState.search = "";
    }
    return true;
  }

  async function refreshBootstrapEmptyAware() {
    const response = await fetch("/api/bootstrap", { cache: "no-store" });
    if (!response.ok) throw new Error("Bootstrap non disponibile");
    const payload = await response.json();
    if (!applyBootstrapPayload(payload)) throw new Error("Bootstrap non valido");
    return appData;
  }

  if (typeof refreshBootstrap === "function") {
    refreshBootstrap = refreshBootstrapEmptyAware;
  }

  if (typeof getSelectedOrder === "function") {
    getSelectedOrder = function getSelectedOrderEmptyAware() {
      const currentData = data();
      const currentState = state();
      const orders = currentData?.orders || [];
      if (!orders.length) return null;
      return orders.find((order) => String(order.id) === String(currentState?.selectedOrderId)) || orders[0];
    };
  }

  if (typeof getSelectedOrderMaterials === "function") {
    getSelectedOrderMaterials = function getSelectedOrderMaterialsEmptyAware() {
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      if (!order) return [];
      return data()?.orderMaterials?.[order.id] || [];
    };
  }

  if (typeof getClientForSelectedOrder === "function") {
    getClientForSelectedOrder = function getClientForSelectedOrderEmptyAware() {
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const clients = data()?.clients || [];
      if (!order) return clients[0] || null;
      return clients.find((client) => client.name === order.client || String(client.id) === String(order.client_id)) || clients[0] || null;
    };
  }

  function emptyOrdersSection(viewId, title, body, actionLabel) {
    return `
      <section class="view ${state()?.currentView === viewId ? "active" : ""}">
        <div class="screen-header">
          <div>
            <h2>${title}</h2>
            <p>${body}</p>
          </div>
          <div class="screen-actions">
            <button class="action-pill" data-open="new-order">${actionLabel || "Nuovo ordine"}</button>
            <button class="action-pill" data-open="orders">Archivio ordini</button>
          </div>
        </div>
        <div class="surface"><div class="surface-inner"><div class="empty-state">Non ci sono ordini reali da mostrare in questo momento.</div></div></div>
      </section>
    `;
  }

  if (typeof renderOrderDetail === "function") {
    const baseRenderOrderDetail = renderOrderDetail;
    renderOrderDetail = function renderOrderDetailEmptyAware() {
      if (!(data()?.orders || []).length) {
        return emptyOrdersSection("order-detail", "Scheda ordine", "La scheda si abilita appena viene creato o caricato un ordine reale.");
      }
      return baseRenderOrderDetail();
    };
  }

  if (typeof renderClient === "function") {
    const baseRenderClient = renderClient;
    renderClient = function renderClientEmptyAware() {
      if (!(data()?.orders || []).length && !(data()?.clients || []).length) {
        return emptyOrdersSection("client", "Scheda cliente", "La scheda cliente si abilita appena ci sono anagrafiche o ordini reali.", "Nuovo cliente / ordine");
      }
      return baseRenderClient();
    };
  }

  async function refreshAfterLoad() {
    try {
      await refreshBootstrapEmptyAware();
      if (typeof renderApp === "function") renderApp();
    } catch (error) {
      console.warn(`${VERSION}: refresh iniziale saltato`, error);
    }
  }

  window.mmsApplyBootstrapPayload = applyBootstrapPayload;
  window.setTimeout(refreshAfterLoad, 0);
  window.setTimeout(refreshAfterLoad, 1600);
})();
