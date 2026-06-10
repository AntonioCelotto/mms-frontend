const DIRECT_SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
const DIRECT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";

function resetOrderFiltersForNewOrder() {
  appState.search = "";
  appState.filters = {
    department: "all",
    status: "all",
    payment: "all",
    priority: "all",
  };
}

function getCleanDraftMaterials() {
  return appState.draftMaterials.filter((item) => item.product_name && item.product_name.trim());
}

function resolveDraftDepartment() {
  const departmentMap = {
    "interno + controllo commercio": "Sartoria interna",
    interno: "Sartoria interna",
    esterno: "Sartoria esterna",
    commercio: "Commercio",
  };
  const raw = (appState.draftOrder.department || "").trim();
  const key = raw.toLowerCase();
  return departmentMap[key] || raw || "Sartoria interna";
}

function resolveCreatedOrderNumber(created) {
  return Number(created.order_number || created.id || created.db_id);
}

function resolveCreatedOrderDbId(created) {
  return Number(created.db_id || created.internal_id || created.id);
}

function upsertCreatedOrderPreview(created, uploadedCount = 0) {
  const displayId = resolveCreatedOrderNumber(created);
  const dbId = resolveCreatedOrderDbId(created);
  const client = (appState.draftOrder.client || "").trim() || "Cliente";
  const category = (created.category || appState.draftOrder.category || "Da definire").trim() || "Da definire";
  const department = resolveDraftDepartment();
  const orderDate = appState.draftOrder.orderDate || "Da definire";
  const estimatedDelivery = appState.draftOrder.estimatedDelivery || "Da definire";

  if (!appData || !Array.isArray(appData.orders)) return;

  const preview = {
    db_id: dbId,
    id: displayId,
    client,
    category,
    department,
    route: department.toLowerCase().includes("esterna") ? "Esterno" : department.toLowerCase().includes("commercio") ? "Commercio" : "Interno",
    priority: appState.draftOrder.priority || "Standard",
    status: "Da Avviare",
    payment: appState.draftOrder.deposit || "Da Pagare",
    eta: estimatedDelivery,
    files: uploadedCount,
    summary: appState.draftOrder.note || `Ordine ${displayId} per ${client}`,
    notes: appState.draftOrder.note || "Nessuna nota operativa registrata.",
    customerWindow: estimatedDelivery,
    orderDate,
    estimatedDelivery,
    warehouseLinked: (appState.draftOrder.warehouseLink || "").toLowerCase().includes("magazzino"),
    clientVisibility: "Cliente vede avanzamento base",
  };

  const existingIndex = appData.orders.findIndex(
    (order) => Number(order.id) === displayId || Number(order.db_id) === dbId
  );
  if (existingIndex >= 0) {
    appData.orders[existingIndex] = { ...appData.orders[existingIndex], ...preview };
  } else {
    appData.orders.unshift(preview);
  }
}

async function readJsonResponse(response, fallbackMessage) {
  const raw = await response.text().catch(() => "");
  let payload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      payload = { detail: raw.slice(0, 240) };
    }
  }

  if (!response.ok) {
    const detail = payload.detail || payload.message || "";
    const message = payload.error || fallbackMessage;
    throw new Error(detail ? `${message}: ${detail}` : `${message} (HTTP ${response.status})`);
  }
  return payload;
}

async function createOrderDirectly(payload) {
  const response = await fetch(`${DIRECT_SUPABASE_URL}/rest/v1/rpc/create_order_atomic`, {
    method: "POST",
    headers: {
      apikey: DIRECT_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${DIRECT_SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "Creazione ordine non riuscita");
}

async function fetchSupabaseRows(table, params = {}) {
  const query = new URLSearchParams(params);
  const response = await fetch(`${DIRECT_SUPABASE_URL}/rest/v1/${table}?${query.toString()}`, {
    headers: {
      apikey: DIRECT_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${DIRECT_SUPABASE_ANON_KEY}`,
    },
  });
  return readJsonResponse(response, `Lettura ${table} non riuscita`);
}

function titleFromDb(value, fallback = "") {
  const raw = (value || fallback || "").toString().replace(/_/g, " ").trim();
  if (!raw) return "";
  return raw
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function firstDepartmentForOrder(tasks, departmentsById, orderId) {
  const task = tasks.find((item) => Number(item.order_id) === Number(orderId));
  return departmentsById.get(Number(task?.department_id))?.name || "Da assegnare";
}

function latestPaymentForOrder(payments, orderId) {
  return payments.find((payment) => Number(payment.order_id) === Number(orderId)) || null;
}

function countFilesForOrder(attachments, orderId) {
  return attachments.filter((attachment) => Number(attachment.order_id) === Number(orderId)).length;
}

function shapeDirectOrders({ orders, clients, departments, tasks, payments, attachments }) {
  const clientsById = new Map(clients.map((client) => [Number(client.id), client]));
  const departmentsById = new Map(departments.map((department) => [Number(department.id), department]));

  return orders.map((order) => {
    const displayId = Number(order.order_number || order.id);
    const client = clientsById.get(Number(order.client_id));
    const department = firstDepartmentForOrder(tasks, departmentsById, order.id);
    const payment = latestPaymentForOrder(payments, order.id);
    const eta = order.estimated_delivery_date || "Da definire";
    const status = titleFromDb(order.status, "Da avviare");
    const priority = titleFromDb(order.priority, "Standard") || "Standard";

    return {
      db_id: Number(order.id),
      id: displayId,
      client: client?.name || "Cliente",
      category: order.category || "Da definire",
      department,
      route: titleFromDb(order.production_mode, "Interno"),
      priority,
      status,
      payment: titleFromDb(payment?.status, "Da pagare") || "Da Pagare",
      eta,
      files: countFilesForOrder(attachments, order.id),
      summary: order.internal_notes || `Ordine ${displayId} per ${client?.name || "Cliente"}`,
      notes: order.internal_notes || "Nessuna nota operativa registrata.",
      customerWindow: eta,
      orderDate: order.order_date || "Da definire",
      estimatedDelivery: eta,
      warehouseLinked: !!order.warehouse_linked,
      clientVisibility: order.client_visibility_note || "",
    };
  });
}

function refreshMetricsFromOrders(orders) {
  appData.metrics = {
    ...appData.metrics,
    openOrders: orders.length,
    activeOrders: orders.filter((order) => order.status !== "Evaso").length,
    toStart: orders.filter((order) => order.status === "Da Avviare").length,
    urgent: orders.filter((order) => order.priority === "Express").length,
    completedMonth: orders.filter((order) => order.status === "Evaso").length,
  };
}

async function refreshOrdersDirectly() {
  const [orders, clients, departments, tasks, payments, attachments] = await Promise.all([
    fetchSupabaseRows("orders", { select: "*", order: "id.desc" }),
    fetchSupabaseRows("clients", { select: "id,name" }),
    fetchSupabaseRows("departments", { select: "id,name" }),
    fetchSupabaseRows("order_tasks", { select: "order_id,department_id", order: "id.asc" }),
    fetchSupabaseRows("payments", { select: "order_id,status", order: "id.desc" }),
    fetchSupabaseRows("attachments", { select: "order_id" }),
  ]);

  if (!orders.length) return;

  const shapedOrders = shapeDirectOrders({ orders, clients, departments, tasks, payments, attachments });
  appData = {
    ...appData,
    orders: shapedOrders,
  };
  refreshMetricsFromOrders(shapedOrders);

  if (!appData.orders.some((order) => Number(order.id) === Number(appState.selectedOrderId))) {
    appState.selectedOrderId = appData.orders[0].id;
  }
}

const baseRefreshBootstrapForOrders = refreshBootstrap;
refreshBootstrap = async function refreshBootstrapWithDirectOrders() {
  let bootstrapError = null;
  try {
    await baseRefreshBootstrapForOrders();
  } catch (error) {
    bootstrapError = error;
  }

  const looksLikeFallback = !Array.isArray(appData.orders) || appData.orders.length <= 6;
  if (bootstrapError || looksLikeFallback) {
    await refreshOrdersDirectly();
  }
};

async function uploadPendingOrderAttachments(orderId, pendingAttachments) {
  if (!pendingAttachments.length) return [];
  if (typeof uploadAttachmentFile !== "function") {
    throw new Error("Upload allegati non disponibile");
  }

  const uploaded = [];
  for (const attachment of pendingAttachments) {
    const saved = await uploadAttachmentFile(orderId, attachment);
    if (saved) uploaded.push(saved);
  }
  return uploaded;
}

function clearPendingAttachmentUrls(pendingAttachments) {
  pendingAttachments.forEach((attachment) => {
    if (attachment.localUrl) URL.revokeObjectURL(attachment.localUrl);
  });
}

saveDraftOrder = async function saveDraftOrderConfirmed() {
  if (appState.busy) return;

  const client = (appState.draftOrder.client || "").trim();
  const category = (appState.draftOrder.category || "").trim();
  if (!client) {
    setFlashMessage("Inserisci almeno il cliente prima di salvare l'ordine");
    return;
  }

  const materials = getCleanDraftMaterials();
  const pendingAttachments = Array.isArray(appState.draftOrderAttachments) ? [...appState.draftOrderAttachments] : [];
  const department = resolveDraftDepartment();
  let createdOrderId = null;
  let createdOrderNumber = null;
  let createdOrder = null;

  setBusy(true);
  try {
    const created = await createOrderDirectly({
      p_client_name: client,
      p_category: category || null,
      p_department_name: department,
      p_priority: appState.draftOrder.priority || "Standard",
      p_order_date: appState.draftOrder.orderDate || null,
      p_estimated_delivery_date: appState.draftOrder.estimatedDelivery || null,
      p_warehouse_linked: (appState.draftOrder.warehouseLink || "").toLowerCase().includes("magazzino"),
      p_client_visibility_note: "Cliente vede avanzamento base",
      p_internal_notes: appState.draftOrder.note || null,
      p_deposit_status: appState.draftOrder.deposit || null,
    });
    if (!created || !created.id) {
      throw new Error("Creazione ordine senza ID di conferma");
    }
    createdOrder = created;
    createdOrderId = resolveCreatedOrderDbId(created);
    createdOrderNumber = resolveCreatedOrderNumber(created);

    if (materials.length) {
      const materialResponse = await fetch("/api/save-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: createdOrderId, materials }),
      });
      await readJsonResponse(materialResponse, "Salvataggio materiali non riuscito");
    }

    const uploaded = await uploadPendingOrderAttachments(createdOrderId, pendingAttachments);
    clearPendingAttachmentUrls(pendingAttachments);
    appState.draftOrderAttachments = [];

    let refreshError = null;
    try {
      await refreshBootstrap();
    } catch (error) {
      refreshError = error;
    }

    upsertCreatedOrderPreview(createdOrder, uploaded.length);
    resetOrderFiltersForNewOrder();
    appState.selectedOrderId = createdOrderNumber;
    appState.currentView = "orders";

    const orderVisible = appData.orders.some((order) => Number(order.id) === Number(createdOrderNumber));
    const suffix = uploaded.length ? ` con ${uploaded.length} allegati` : "";
    const refreshSuffix = refreshError ? " L'archivio e' stato aggiornato localmente; ricarica se vuoi riallineare tutti i dati." : "";
    setFlashMessage(
      orderVisible
        ? `Ordine #${createdOrderNumber} salvato e visibile in Archivio Ordini${suffix}.${refreshSuffix}`
        : `Ordine #${createdOrderNumber} salvato, ma l'archivio non si e' aggiornato: ricarica la pagina`
    );
  } catch (error) {
    if (createdOrder) {
      upsertCreatedOrderPreview(createdOrder, 0);
      appState.currentView = "orders";
      appState.selectedOrderId = createdOrderNumber;
      resetOrderFiltersForNewOrder();
      setFlashMessage(`Ordine #${createdOrderNumber} creato, ma completamento non riuscito: ${error.message}`);
    } else {
      setFlashMessage(error.message || "Errore durante il salvataggio dell'ordine");
    }
  } finally {
    appState.busy = false;
    renderApp();
  }
};

refreshBootstrap()
  .then(() => renderApp())
  .catch((error) => console.warn("Archivio ordini reale non disponibile", error));
