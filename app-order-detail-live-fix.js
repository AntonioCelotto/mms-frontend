let orderDetailLiveLoadingKey = "";
let orderDetailLiveLoadedKeys = new Set();

function orderDetailLiveDisplayId(order) {
  return Number(order?.id || appState.selectedOrderId || 0);
}

function orderDetailLiveDbId(order) {
  return Number(order?.db_id || order?.internal_id || order?.id || appState.selectedOrderId || 0);
}

function orderDetailLiveKey(order) {
  const displayId = orderDetailLiveDisplayId(order);
  const dbId = orderDetailLiveDbId(order);
  return displayId && dbId ? `${displayId}:${dbId}` : "";
}

function orderDetailLiveHasRows(collection, displayId) {
  const rows = collection?.[displayId];
  return Array.isArray(rows) && rows.length > 0;
}

function orderDetailLiveNeedsLoad(order) {
  const displayId = orderDetailLiveDisplayId(order);
  const dbId = orderDetailLiveDbId(order);
  const key = orderDetailLiveKey(order);
  if (!displayId || !dbId) return false;
  if (key && orderDetailLiveLoadedKeys.has(key)) return false;
  const hasTasks = orderDetailLiveHasRows(appData.orderTasks, displayId);
  const hasMaterials = orderDetailLiveHasRows(appData.orderMaterials, displayId);
  return !hasTasks || !hasMaterials;
}

async function orderDetailLiveLoad(order, force = false) {
  const displayId = orderDetailLiveDisplayId(order);
  const dbId = orderDetailLiveDbId(order);
  const key = orderDetailLiveKey(order);
  if (!displayId || !dbId || !key) return;
  if (!force && orderDetailLiveLoadedKeys.has(key)) return;
  if (!force && !orderDetailLiveNeedsLoad(order)) return;
  if (orderDetailLiveLoadingKey === key) return;

  orderDetailLiveLoadingKey = key;
  try {
    await Promise.all([
      typeof orderFlowLoadTasks === "function" ? orderFlowLoadTasks(order).catch(() => []) : Promise.resolve([]),
      typeof orderFlowLoadMaterials === "function" ? orderFlowLoadMaterials(order).catch(() => []) : Promise.resolve([]),
      typeof orderFlowLoadAttachments === "function" ? orderFlowLoadAttachments(order).catch(() => {}) : Promise.resolve(),
    ]);
  } finally {
    orderDetailLiveLoadedKeys.add(key);
    orderDetailLiveLoadingKey = "";
  }
}

function orderDetailLiveEnhanceEmptyStates() {
  if (appState.currentView !== "order-detail") return;
  const section = document.querySelector("section.view.active");
  if (!section) return;
  const order = getSelectedOrder?.();
  if (!orderDetailLiveNeedsLoad(order)) return;
  section.querySelectorAll(".empty-state").forEach((node) => {
    if (node.textContent.includes("task non sono ancora stati strutturati")) {
      node.textContent = "Caricamento task dell'ordine...";
    }
    if (node.textContent.includes("Nessun materiale collegato")) {
      node.textContent = "Caricamento materiali dell'ordine...";
    }
  });
}

const baseNavigateOrderDetailLive = navigate;
navigate = function navigateWithOrderDetailLive(view, orderId) {
  baseNavigateOrderDetailLive(view, orderId);
  if (view === "order-detail") {
    const order = getSelectedOrder?.();
    orderDetailLiveLoad(order, true).then(() => {
      if (appState.currentView === "order-detail") renderApp();
    }).catch(() => {});
  }
};

const baseRenderAppOrderDetailLive = renderApp;
renderApp = function renderAppWithOrderDetailLive() {
  baseRenderAppOrderDetailLive();
  if (appState.currentView !== "order-detail") return;
  orderDetailLiveEnhanceEmptyStates();
  const order = getSelectedOrder?.();
  if (!orderDetailLiveNeedsLoad(order)) return;
  orderDetailLiveLoad(order).then(() => {
    if (appState.currentView === "order-detail") renderApp();
  }).catch(() => {});
};

if (appState.currentView === "order-detail") {
  orderDetailLiveLoad(getSelectedOrder?.(), true).then(() => renderApp()).catch(() => {});
}
