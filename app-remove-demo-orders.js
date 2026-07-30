(function () {
  const DEMO_ORDER_IDS = new Set(["284", "455", "510", "599", "601", "621"]);

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function isDemoOrder(order) {
    return DEMO_ORDER_IDS.has(String(order?.id)) || DEMO_ORDER_IDS.has(String(order?.orderId)) || DEMO_ORDER_IDS.has(String(order?.order_id));
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

  function scrubOrderMap(map) {
    const next = { ...(map || {}) };
    DEMO_ORDER_IDS.forEach((id) => delete next[id]);
    return next;
  }

  function scrubCalendar(calendar) {
    return asArray(calendar).map((day) => ({
      ...day,
      slots: asArray(day.slots).filter((slot) => !DEMO_ORDER_IDS.has(String(slot.orderId))),
    }));
  }

  function scrubClients(clients) {
    return asArray(clients).map((client) => ({
      ...client,
      orders: asArray(client.orders).filter((id) => !DEMO_ORDER_IDS.has(String(id))),
    }));
  }

  function scrubData(target) {
    if (!target || typeof target !== "object") return target;
    target.orders = asArray(target.orders).filter((order) => !isDemoOrder(order));
    target.payments = asArray(target.payments).filter((payment) => !isDemoOrder(payment));
    target.alerts = asArray(target.alerts).filter((alert) => !isDemoOrder(alert));
    target.calendar = scrubCalendar(target.calendar);
    target.clients = scrubClients(target.clients);
    target.orderTasks = scrubOrderMap(target.orderTasks);
    target.orderMaterials = scrubOrderMap(target.orderMaterials);
    target.orderTimeline = scrubOrderMap(target.orderTimeline);
    target.metrics = emptyMetrics(target.metrics);
    return target;
  }

  function applyScrub() {
    try {
      if (typeof fallbackAppData === "object") scrubData(fallbackAppData);
      if (typeof appData === "object") scrubData(appData);
      if (typeof appState === "object" && DEMO_ORDER_IDS.has(String(appState.selectedOrderId))) {
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
