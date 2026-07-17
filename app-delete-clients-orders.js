(function () {
  function text(value) {
    return String(value ?? "").trim();
  }

  function isAdminProfile() {
    const profile = window.mmsAuthProfile || {};
    const raw = text(profile.access_profile || profile.profile || profile.role).toLowerCase();
    return raw === "admin" || raw === "amministratore";
  }

  function ensureStyle() {
    if (document.getElementById("mms-delete-actions-style")) return;
    const style = document.createElement("style");
    style.id = "mms-delete-actions-style";
    style.textContent = `
      .mini-btn.danger,
      .action-pill.danger {
        border-color: rgba(185, 28, 28, 0.28) !important;
        color: #991b1b !important;
        background: #fff5f5 !important;
      }
      .mini-btn.danger:hover,
      .action-pill.danger:hover {
        background: #fee2e2 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function mountOrderDeleteButtons() {
    if (appState.currentView !== "orders" || !isAdminProfile()) return;
    document.querySelectorAll("section.view.active tbody tr").forEach((row) => {
      const detailButton = row.querySelector("[data-detail]");
      const orderId = detailButton?.dataset.detail;
      if (!orderId || row.querySelector("[data-delete-order]")) return;
      const pillRow = detailButton.closest(".pill-row") || detailButton.parentElement;
      if (!pillRow) return;
      pillRow.insertAdjacentHTML("beforeend", `<button class="mini-btn danger" data-delete-order="${orderId}" type="button">Elimina</button>`);
    });
  }

  function mountClientDeleteButtons() {
    if (appState.currentView !== "clients" || !isAdminProfile()) return;
    document.querySelectorAll("section.view.active [data-select-client]").forEach((button) => {
      const clientId = button.dataset.selectClient;
      if (!clientId || button.parentElement?.querySelector("[data-delete-client]")) return;
      button.insertAdjacentHTML("afterend", `<button class="mini-btn danger" data-delete-client="${clientId}" type="button" style="margin-left:6px;">Elimina</button>`);
    });
  }

  function mountDeleteActions() {
    ensureStyle();
    mountOrderDeleteButtons();
    mountClientDeleteButtons();
  }

  function orderLabel(orderId) {
    const order = (appData.orders || []).find((item) => String(item.id) === String(orderId) || String(item.db_id) === String(orderId));
    return order ? `#${order.id} - ${order.client}` : `#${orderId}`;
  }

  function deletedOrderRefs(orderId, result) {
    const deleted = result?.deleted || result?.[0]?.deleted || {};
    return new Set([orderId, deleted.id, deleted.order_number].filter((value) => value !== undefined && value !== null).map(String));
  }

  function removeOrderLocally(orderId, result) {
    const refs = deletedOrderRefs(orderId, result);
    appData.orders = (appData.orders || []).filter((order) => !refs.has(String(order.id)) && !refs.has(String(order.db_id)) && !refs.has(String(order.order_number)));
    Object.keys(appData.orderTasks || {}).forEach((key) => {
      if (refs.has(String(key))) delete appData.orderTasks[key];
    });
    Object.keys(appData.orderMaterials || {}).forEach((key) => {
      if (refs.has(String(key))) delete appData.orderMaterials[key];
    });
    Object.keys(appData.orderTimeline || {}).forEach((key) => {
      if (refs.has(String(key))) delete appData.orderTimeline[key];
    });
    if (Array.isArray(appState.realClientOrders)) {
      appState.realClientOrders = appState.realClientOrders.filter((order) => !refs.has(String(order.id)) && !refs.has(String(order.order_number)));
    }
    if (String(appState.selectedOrderId || "") && refs.has(String(appState.selectedOrderId))) {
      appState.selectedOrderId = appData.orders?.[0]?.id || null;
    }
    appState.clientsLoaded = false;
  }

  function clientRecord(clientId) {
    const clients = appState.realClients || appData.clients || [];
    return clients.find((item) => String(item.id) === String(clientId));
  }

  function clientLabel(clientId) {
    return clientRecord(clientId)?.name || `cliente ${clientId}`;
  }

  function linkedOrdersForClient(clientId) {
    const realOrders = Array.isArray(appState.realClientOrders) ? appState.realClientOrders : [];
    const realMatches = realOrders.filter((order) => String(order.client_id) === String(clientId));
    if (realMatches.length) return realMatches.map((order) => order.order_number || order.id).filter(Boolean);
    const client = clientRecord(clientId);
    return Array.isArray(client?.orders) ? client.orders.filter(Boolean) : [];
  }

  async function authHeaders() {
    const headers = { "Content-Type": "application/json" };
    try {
      const session = await window.mmsSupabaseAuth?.auth?.getSession?.();
      const token = session?.data?.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch (error) {
      // The backend currently accepts the same app session model used by the rest of the app.
    }
    return headers;
  }

  async function deleteRecord(payload) {
    const response = await fetch("/api/delete-record", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.detail || body.error || "Eliminazione non riuscita");
    }
    return body;
  }

  async function handleDeleteOrder(orderId) {
    const label = orderLabel(orderId);
    if (!window.confirm(`Eliminare definitivamente l'ordine ${label}? Verranno rimossi anche task, materiali, pagamenti e allegati collegati.`)) return;
    setBusy(true);
    try {
      const result = await deleteRecord({ entity: "order", order_id: orderId });
      removeOrderLocally(orderId, result);
      appState.currentView = "orders";
      setFlashMessage(`Ordine ${label} eliminato`);
      appState.busy = false;
      renderApp();
      try {
        await refreshBootstrap();
        renderApp();
      } catch (refreshError) {
        console.warn("Refresh dopo eliminazione ordine non riuscito", refreshError);
      }
    } catch (error) {
      setFlashMessage(error.message || "Ordine non eliminato");
      appState.busy = false;
      renderApp();
    }
  }

  async function handleDeleteClient(clientId) {
    const label = clientLabel(clientId);
    const linkedOrders = linkedOrdersForClient(clientId);
    if (linkedOrders.length) {
      const preview = linkedOrders.slice(0, 5).map((id) => `#${id}`).join(", ");
      const suffix = linkedOrders.length > 5 ? ` e altri ${linkedOrders.length - 5}` : "";
      setFlashMessage(`Cliente ${label} non eliminato: ha ${linkedOrders.length} ordini collegati (${preview}${suffix}). Elimina prima gli ordini collegati.`);
      return;
    }
    if (!window.confirm(`Eliminare definitivamente ${label}?`)) return;
    setBusy(true);
    try {
      await deleteRecord({ entity: "client", client_id: clientId });
      if (Array.isArray(appState.realClients)) {
        appState.realClients = appState.realClients.filter((client) => String(client.id) !== String(clientId));
      }
      appData.clients = (appData.clients || []).filter((client) => String(client.id) !== String(clientId));
      if (String(appState.selectedClientId) === String(clientId)) appState.selectedClientId = null;
      appState.currentView = "clients";
      setFlashMessage(`Cliente ${label} eliminato`);
      appState.busy = false;
      renderApp();
      try {
        await refreshBootstrap();
        appState.clientsLoaded = false;
        renderApp();
      } catch (refreshError) {
        console.warn("Refresh dopo eliminazione cliente non riuscito", refreshError);
      }
    } catch (error) {
      setFlashMessage(error.message || "Cliente non eliminato");
      appState.busy = false;
      renderApp();
    }
  }

  const baseRenderAppDeleteActions = renderApp;
  renderApp = function renderAppDeleteActions() {
    baseRenderAppDeleteActions();
    mountDeleteActions();
  };

  document.addEventListener(
    "click",
    (event) => {
      const orderButton = event.target.closest("[data-delete-order]");
      if (orderButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        handleDeleteOrder(orderButton.dataset.deleteOrder);
        return;
      }

      const clientButton = event.target.closest("[data-delete-client]");
      if (clientButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        handleDeleteClient(clientButton.dataset.deleteClient);
      }
    },
    true
  );

  let mountAttempts = 0;
  const mountTimer = window.setInterval(() => {
    mountAttempts += 1;
    mountDeleteActions();
    if (isAdminProfile() || mountAttempts >= 30) {
      window.clearInterval(mountTimer);
    }
  }, 500);

  if (document.getElementById("app")?.innerHTML) mountDeleteActions();
})();

(function () {
  let selectInteractionUntil = 0;
  let renderQueued = false;

  function markSelectInteraction(duration = 900) {
    selectInteractionUntil = Date.now() + duration;
  }

  function isSelectInteractionActive() {
    const active = document.activeElement;
    return Date.now() < selectInteractionUntil || active instanceof HTMLSelectElement;
  }

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target instanceof HTMLSelectElement || event.target?.closest?.("select")) {
        markSelectInteraction(1400);
      }
    },
    true
  );

  document.addEventListener(
    "focusin",
    (event) => {
      if (event.target instanceof HTMLSelectElement) {
        markSelectInteraction(1400);
      }
    },
    true
  );

  document.addEventListener(
    "change",
    (event) => {
      if (event.target instanceof HTMLSelectElement) {
        markSelectInteraction(180);
      }
    },
    true
  );

  if (typeof renderApp === "function") {
    const baseRenderApp = renderApp;
    renderApp = function renderAppSelectStabilityGuard() {
      if (isSelectInteractionActive()) {
        if (!renderQueued) {
          renderQueued = true;
          window.setTimeout(() => {
            renderQueued = false;
            if (!isSelectInteractionActive()) baseRenderApp();
          }, 220);
        }
        return;
      }
      baseRenderApp();
    };
  }
})();