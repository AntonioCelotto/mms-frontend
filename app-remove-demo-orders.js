(function () {
  const DEMO_ORDER_IDS = new Set(["284", "455", "510", "599", "601", "621"]);

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function orderRef(value) {
    return String(value?.id ?? value?.orderId ?? value?.order_id ?? "");
  }

  function isPersistedOrder(order) {
    return !!(
      order?.db_id ||
      order?.internal_id ||
      order?.sourceQuoteNumber ||
      order?.source_quote_number
    );
  }

  function isDemoOrder(order, persistedIds = new Set()) {
    const id = orderRef(order);
    return DEMO_ORDER_IDS.has(id) && !persistedIds.has(id) && !isPersistedOrder(order);
  }

  function emptyMetrics(metrics) {
    return {
      ...(metrics || {}),
      openOrders: 0,
      activeOrders: 0,
      toStart: 0,
      urgent: 0,
      delays: 0,
      openPayments: 0,
      paymentValue: "0k",
      activeTasks: 0,
      completedMonth: 0,
    };
  }

  function scrubOrderMap(map, persistedIds) {
    const next = { ...(map || {}) };
    DEMO_ORDER_IDS.forEach((id) => {
      if (!persistedIds.has(id)) delete next[id];
    });
    return next;
  }

  function scrubCalendar(calendar, persistedIds) {
    return asArray(calendar).map((day) => ({
      ...day,
      slots: asArray(day.slots).filter((slot) => !isDemoOrder(slot, persistedIds)),
    }));
  }

  function scrubClients(clients, persistedIds) {
    return asArray(clients).map((client) => ({
      ...client,
      orders: asArray(client.orders).filter((id) => !DEMO_ORDER_IDS.has(String(id)) || persistedIds.has(String(id))),
    }));
  }

  function scrubData(target) {
    if (!target || typeof target !== "object") return target;
    const persistedIds = new Set(
      asArray(target.orders)
        .filter(isPersistedOrder)
        .map(orderRef)
        .filter(Boolean)
    );
    target.orders = asArray(target.orders).filter((order) => !isDemoOrder(order, persistedIds));
    target.payments = asArray(target.payments).filter((payment) => !isDemoOrder(payment, persistedIds));
    target.alerts = asArray(target.alerts).filter((alert) => !isDemoOrder(alert, persistedIds));
    target.calendar = scrubCalendar(target.calendar, persistedIds);
    target.clients = scrubClients(target.clients, persistedIds);
    target.orderTasks = scrubOrderMap(target.orderTasks, persistedIds);
    target.orderMaterials = scrubOrderMap(target.orderMaterials, persistedIds);
    target.orderTimeline = scrubOrderMap(target.orderTimeline, persistedIds);
    if (!persistedIds.size && !target.orders.length) target.metrics = emptyMetrics(target.metrics);
    return target;
  }

  function applyScrub() {
    try {
      if (typeof fallbackAppData === "object") scrubData(fallbackAppData);
      if (typeof appData === "object") scrubData(appData);
      const selected = String(appState?.selectedOrderId ?? "");
      const selectedExists = asArray(appData?.orders).some((order) => orderRef(order) === selected);
      if (!selectedExists && DEMO_ORDER_IDS.has(selected)) {
        appState.selectedOrderId = appData?.orders?.[0]?.id || null;
      }
    } catch (error) {
      console.warn("Demo orders cleanup skipped", error);
    }
  }

  applyScrub();

  if (typeof refreshBootstrap === "function") {
    const baseRefreshBootstrap = refreshBootstrap;
    refreshBootstrap = async function refreshBootstrapWithoutDemoOrders(...args) {
      const result = await baseRefreshBootstrap.apply(this, args);
      applyScrub();
      return result;
    };
  }

  if (typeof renderOrders === "function") {
    const baseRenderOrders = renderOrders;
    renderOrders = function renderOrdersWithoutDemoFallback() {
      applyScrub();
      return baseRenderOrders();
    };
  }

  window.setTimeout(() => {
    applyScrub();
    if (typeof renderApp === "function") renderApp();
  }, 0);
})();