const SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";

async function supabaseRequest(path, { method = "GET", query, payload, prefer } = {}) {
  const url = new URL(`${SUPABASE_URL}${path}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    });
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = text;
    }
  }

  if (!response.ok) {
    const message = data?.message || data?.error || text || `Errore ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function fetchTable(table, { select = "*", filters = {}, order } = {}) {
  const query = { select, ...filters };
  if (order) query.order = order;
  return (await supabaseRequest(`/rest/v1/${table}`, { query })) || [];
}

async function insertRows(table, payload) {
  return (
    (await supabaseRequest(`/rest/v1/${table}`, {
      method: "POST",
      payload,
      prefer: "return=representation",
    })) || []
  );
}

async function patchRows(table, filters, payload) {
  return (
    (await supabaseRequest(`/rest/v1/${table}`, {
      method: "PATCH",
      query: filters,
      payload,
      prefer: "return=representation",
    })) || []
  );
}

async function deleteRows(table, filters) {
  await supabaseRequest(`/rest/v1/${table}`, {
    method: "DELETE",
    query: filters,
    prefer: "return=minimal",
  });
}

async function resolveOrder(orderRef) {
  let rows = await fetchTable("orders", { filters: { id: `eq.${orderRef}` } });
  if (rows.length) return rows[0];
  rows = await fetchTable("orders", { filters: { order_number: `eq.${orderRef}` } });
  return rows[0] || null;
}

async function ensureClient(name) {
  const rows = await fetchTable("clients", { filters: { name: `eq.${name}` } });
  if (rows.length) return rows[0];
  const created = await insertRows("clients", { name, visibility_enabled: false });
  return created[0];
}

async function getDepartmentByName(name) {
  const rows = await fetchTable("departments", { filters: { name: `eq.${name}` } });
  if (!rows.length) throw new Error(`Reparto non trovato: ${name}`);
  return rows[0];
}

function inferProductionMode(departmentName) {
  const normalized = (departmentName || "").trim().toLowerCase();
  if (normalized.includes("esterna")) return "esterno";
  if (normalized.includes("commercio")) return "commercio";
  if (normalized.includes("misto")) return "misto";
  return "interno";
}

async function nextOrderNumber() {
  const rows = await fetchTable("orders", { select: "order_number", order: "id.desc" });
  const numeric = rows.map((row) => Number(row.order_number)).filter((value) => Number.isFinite(value));
  return String((numeric.length ? Math.max(...numeric) : 0) + 1);
}

async function replaceOrderMaterials(orderId, materials) {
  await deleteRows("order_materials", { order_id: `eq.${orderId}` });
  for (const item of materials) {
    const productName = (item.product_name || item.material || "").trim();
    if (!productName) continue;

    await insertRows("order_materials", {
      order_id: orderId,
      product_name: productName,
      source_type: (item.source_type || item.source || "").toLowerCase() === "mms" ? "mms" : "cliente",
      delivery_status:
        (item.delivery_status || item.delivery || "").toLowerCase() === "consegnato" ? "consegnato" : "non_consegnato",
      warehouse_status_note: item.warehouse_status_note || item.warehouse || null,
      preorder_note: item.preorder_note || item.preorder || null,
      quantity_required: item.quantity_required || 1,
      notes: item.notes || null,
    });
  }
}

function prettifyStatus(value) {
  return (value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function buildBootstrapFromSupabase() {
  const [clients, departments, users, userSkills, inventoryItems, orders, orderTasks, orderMaterials, payments, attachments] =
    await Promise.all([
      fetchTable("clients", { order: "name.asc" }),
      fetchTable("departments", { order: "name.asc" }),
      fetchTable("users", { order: "id.asc" }),
      fetchTable("user_skills", { order: "id.asc" }),
      fetchTable("inventory_items", { order: "name.asc" }),
      fetchTable("orders", { order: "id.desc" }),
      fetchTable("order_tasks", { order: "id.asc" }),
      fetchTable("order_materials", { order: "id.asc" }),
      fetchTable("payments", { order: "id.desc" }),
      fetchTable("attachments", { select: "id,order_id", order: "id.asc" }),
    ]);

  const clientMap = Object.fromEntries(clients.map((row) => [row.id, row]));
  const departmentMap = Object.fromEntries(departments.map((row) => [row.id, row]));
  const userMap = Object.fromEntries(users.map((row) => [row.id, row]));
  const orderById = Object.fromEntries(orders.map((row) => [row.id, row]));
  const displayOrderIds = Object.fromEntries(
    orders.map((row) => [row.id, /^\d+$/.test(String(row.order_number)) ? Number(row.order_number) : row.id])
  );

  const attachmentCount = {};
  attachments.forEach((row) => {
    attachmentCount[row.order_id] = (attachmentCount[row.order_id] || 0) + 1;
  });

  const latestPaymentByOrder = {};
  payments.forEach((row) => {
    if (!latestPaymentByOrder[row.order_id]) latestPaymentByOrder[row.order_id] = row;
  });

  const orderDepartment = {};
  orderTasks.forEach((task) => {
    if (!orderDepartment[task.order_id]) {
      orderDepartment[task.order_id] = departmentMap[task.department_id]?.name || "Da assegnare";
    }
  });

  const shapedOrders = orders.map((row) => {
    const latestPayment = latestPaymentByOrder[row.id] || {};
    const client = clientMap[row.client_id] || {};
    return {
      db_id: row.id,
      id: displayOrderIds[row.id],
      client: client.name || "Cliente",
      category: row.category || "",
      department: orderDepartment[row.id] || "Da assegnare",
      route: prettifyStatus(row.production_mode),
      priority: prettifyStatus(row.priority),
      status: prettifyStatus(row.status),
      payment: prettifyStatus(latestPayment.status || "da_pagare"),
      eta: row.estimated_delivery_date || "Da definire",
      files: attachmentCount[row.id] || 0,
      summary: row.internal_notes || `Ordine ${row.order_number}`,
      notes: row.internal_notes || "Nessuna nota operativa registrata.",
      customerWindow: row.estimated_delivery_date || "Da confermare",
      orderDate: row.order_date || "Da definire",
      estimatedDelivery: row.estimated_delivery_date || "Da definire",
      warehouseLinked: !!row.warehouse_linked,
      clientVisibility: row.client_visibility_note || "",
    };
  });

  const skillMap = {};
  userSkills.forEach((skill) => {
    if (!skillMap[skill.user_id]) skillMap[skill.user_id] = [];
    skillMap[skill.user_id].push(skill.skill_name);
  });

  const orderTasksPayload = {};
  const orderMaterialsPayload = {};
  const calendarMap = {};
  const alerts = [];

  orderTasks.forEach((task) => {
    const displayOrderId = displayOrderIds[task.order_id] || task.order_id;
    const user = userMap[task.assigned_user_id];
    const owner =
      (user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : "") || task.external_supplier_name || "Non assegnato";
    const departmentName = departmentMap[task.department_id]?.name || "Reparto";

    if (!orderTasksPayload[displayOrderId]) orderTasksPayload[displayOrderId] = [];
    orderTasksPayload[displayOrderId].push({
      id: task.id,
      name: task.task_name,
      phase: prettifyStatus(task.task_phase),
      team: `${departmentName} - ${owner}`,
      hours: `${Number(task.estimated_hours || 0).toFixed(1).replace(".", ",")} h`,
      time: task.planned_date || "Da pianificare",
      state: prettifyStatus(task.status),
      calendarDay: task.calendar_day_label || "Da pianificare",
    });

    if (task.calendar_day_label) {
      if (!calendarMap[task.calendar_day_label]) calendarMap[task.calendar_day_label] = [];
      calendarMap[task.calendar_day_label].push({
        orderId: displayOrderId,
        phase: prettifyStatus(task.task_phase),
        title: task.task_name,
        owner,
        time: task.planned_date || "Da pianificare",
      });
    }
  });

  orderMaterials.forEach((material) => {
    const displayOrderId = displayOrderIds[material.order_id] || material.order_id;
    if (!orderMaterialsPayload[displayOrderId]) orderMaterialsPayload[displayOrderId] = [];
    orderMaterialsPayload[displayOrderId].push({
      material: material.product_name,
      source: material.source_type === "mms" ? "MMS" : "Cliente",
      warehouse: material.warehouse_status_note || "Inserimento manuale",
      delivery: material.delivery_status === "consegnato" ? "Consegnato" : "Non consegnato",
      preorder: material.preorder_note || "Nessun preordine",
    });
    if (material.delivery_status === "non_consegnato") {
      alerts.push({
        orderId: displayOrderId,
        title: `Materiale non consegnato per ordine #${displayOrderId}`,
        detail: material.product_name,
      });
    }
  });

  const clientsPayload = clients.map((client) => ({
    id: client.id,
    name: client.name,
    trust: "Affidabilita' da confermare",
    email: client.email || "",
    phone: client.phone || "",
    paymentRule: client.payment_terms || "Da definire",
    workType: "Gestione ordini e lavorazioni collegate",
    note: client.notes || "",
    visibilityEnabled: !!client.visibility_enabled,
    orders: shapedOrders
      .filter((order) => clientMap[orderById[order.db_id]?.client_id]?.name === client.name)
      .slice(0, 6)
      .map((order) => order.id),
    tags: [client.visibility_enabled ? "Portale cliente" : "Uso interno"],
  }));

  const accountsPayload = users.map((row) => ({
    id: row.id,
    role: row.role === "admin" ? "Amministratore" : "Visualizzatore",
    name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
    phone: row.phone || "",
    email: row.email || "",
    skills: (skillMap[row.id] || []).join(", "),
  }));

  return {
    metrics: {
      openOrders: shapedOrders.length,
      activeOrders: shapedOrders.filter((row) => row.status !== "Evaso").length,
      toStart: shapedOrders.filter((row) => row.status === "Da Avviare").length,
      urgent: shapedOrders.filter((row) => row.priority === "Express").length,
      delays: shapedOrders.filter((row) => row.status === "In Attesa").length,
      openPayments: payments.filter((row) => row.status !== "pagato").length,
      paymentValue: `${Math.max(payments.length * 4, 16)}k`,
      activeTasks: orderTasks.length,
      completedMonth: shapedOrders.filter((row) => row.status === "Evaso").length,
    },
    orders: shapedOrders,
    departments: departments.map((department) => ({
      id: department.name.toLowerCase().replaceAll(" ", "-"),
      name: department.name,
      activeOrders: shapedOrders.filter((order) => order.department === department.name).length,
      activeTasks: orderTasks.filter((task) => departmentMap[task.department_id]?.name === department.name).length,
      load: 60,
      note: "Dati caricati da Supabase",
    })),
    alerts: alerts.slice(0, 8),
    payments: payments.slice(0, 20).map((row) => ({
      orderId: displayOrderIds[row.order_id] || row.order_id,
      client: clientMap[orderById[row.order_id]?.client_id]?.name || "Cliente",
      mode: prettifyStatus(row.payment_type),
      detail: row.notes || "Nessuna nota pagamento.",
      due: row.due_date || "Da definire",
      state: prettifyStatus(row.status),
    })),
    orderTasks: orderTasksPayload,
    orderTimeline: {},
    orderMaterials: orderMaterialsPayload,
    clients: clientsPayload,
    calendar: ["Lunedi'", "Martedi'", "Mercoledi'", "Giovedi'", "Venerdi'"].map((day) => ({
      day,
      date: "",
      slots: calendarMap[day] || [],
    })),
    inventory: inventoryItems.map((row) => ({
      sku: row.sku || "",
      product: row.name || "",
      category: row.category || "",
      available: row.available_quantity || 0,
      reserved: row.reserved_quantity || 0,
      status: row.status || "",
      reorder: row.notes || "Senza note",
    })),
    accounts: accountsPayload,
    seamstresses: fallbackAppData.seamstresses,
    aiFeed: fallbackAppData.aiFeed,
  };
}

refreshBootstrap = async function refreshBootstrapOverride() {
  const payload = await buildBootstrapFromSupabase();
  if (payload && payload.orders && payload.orders.length) {
    appData = { ...fallbackAppData, ...payload };
    if (!appData.orders.some((order) => order.id === appState.selectedOrderId)) {
      appState.selectedOrderId = appData.orders[0].id;
    }
  }
};

saveDraftOrder = async function saveDraftOrderOverride() {
  const materials = appState.draftMaterials.filter((item) => item.product_name.trim());
  const departmentMap = {
    "interno + controllo commercio": "Sartoria interna",
    interno: "Sartoria interna",
    esterno: "Sartoria esterna",
    commercio: "Commercio",
  };
  const departmentKey = (appState.draftOrder.department || "").trim().toLowerCase();
  const department = departmentMap[departmentKey] || appState.draftOrder.department || "Sartoria interna";

  setBusy(true);
  try {
    const client = await ensureClient(appState.draftOrder.client.trim());
    const orderNumber = await nextOrderNumber();
    const departmentRow = await getDepartmentByName(department);
    const created = await insertRows("orders", {
      order_number: orderNumber,
      client_id: client.id,
      category: appState.draftOrder.category || "Sartoria",
      production_mode: inferProductionMode(department),
      priority: (appState.draftOrder.priority || "").trim().toLowerCase() === "express" ? "express" : "standard",
      status: "da_avviare",
      order_date: appState.draftOrder.orderDate,
      estimated_delivery_date: appState.draftOrder.estimatedDelivery,
      warehouse_linked: (appState.draftOrder.warehouseLink || "").toLowerCase().includes("magazzino"),
      client_visibility_note: "Cliente vede avanzamento base",
      internal_notes: appState.draftOrder.note,
    });
    const order = created[0];

    const phaseMap = {
      "Sartoria interna": ["cartamodello", "taglio", "confezione"],
      "Sartoria esterna": ["confezione", "controllo_finale"],
      Commercio: ["materiale", "controllo_finale"],
    };

    for (const phase of phaseMap[departmentRow.name] || ["confezione"]) {
      await insertRows("order_tasks", {
        order_id: order.id,
        department_id: departmentRow.id,
        task_name: `${prettifyStatus(phase)} ordine #${orderNumber}`,
        task_phase: phase,
        status: "da_avviare",
        planned_date: appState.draftOrder.estimatedDelivery,
        estimated_hours: phase === "taglio" ? 2 : phase === "materiale" || phase === "controllo_finale" ? 1 : 3,
        calendar_day_label: null,
      });
    }

    if (appState.draftOrder.deposit) {
      await insertRows("payments", {
        order_id: order.id,
        payment_type: "acconto",
        due_date: appState.draftOrder.estimatedDelivery,
        status: appState.draftOrder.deposit.trim().toLowerCase() === "ricevuto" ? "pagato" : "da_pagare",
        notes: `Stato acconto iniziale: ${appState.draftOrder.deposit}`,
      });
    }

    await replaceOrderMaterials(order.id, materials);
    await refreshBootstrap();
    appState.selectedOrderId = Number(orderNumber);
    appState.currentView = "order-detail";
    setFlashMessage(`Ordine #${orderNumber} salvato correttamente`);
  } catch (error) {
    setFlashMessage(error.message || "Errore durante il salvataggio dell'ordine");
  } finally {
    appState.busy = false;
    renderApp();
  }
};

saveClientDraft = async function saveClientDraftOverride() {
  const client = getClientForSelectedOrder();
  if (!client?.id) {
    setFlashMessage("Cliente non disponibile");
    return;
  }
  setBusy(true);
  try {
    await patchRows("clients", { id: `eq.${client.id}` }, {
      email: appState.clientDraft.email,
      phone: appState.clientDraft.phone,
      payment_terms: appState.clientDraft.paymentRule,
      notes: appState.clientDraft.note,
      visibility_enabled: !!appState.clientDraft.visibilityEnabled,
    });
    await refreshBootstrap();
    setFlashMessage("Cliente aggiornato");
  } catch (error) {
    setFlashMessage(error.message || "Errore nel salvataggio cliente");
  } finally {
    appState.busy = false;
    renderApp();
  }
};

registerPaymentForSelectedOrder = async function registerPaymentForSelectedOrderOverride() {
  const order = getSelectedOrder();
  if (!order?.id) return;
  setBusy(true);
  try {
    const resolvedOrder = await resolveOrder(order.id);
    if (!resolvedOrder) throw new Error("Ordine non trovato");
    await insertRows("payments", {
      order_id: resolvedOrder.id,
      payment_type: "saldo",
      status: "pagato",
      due_date: order.estimatedDelivery,
      paid_date: "oggi",
      notes: "Incasso registrato dalla UI",
    });
    await refreshBootstrap();
    setFlashMessage(`Pagamento registrato per ordine #${order.id}`);
  } catch (error) {
    setFlashMessage(error.message || "Errore nella registrazione pagamento");
  } finally {
    appState.busy = false;
    renderApp();
  }
};

saveAccountDraft = async function saveAccountDraftOverride() {
  setBusy(true);
  try {
    const created = await insertRows("users", {
      first_name: appState.accountDraft.first_name,
      last_name: appState.accountDraft.last_name,
      phone: appState.accountDraft.phone,
      email: appState.accountDraft.email,
      role: appState.accountDraft.role,
      is_active: true,
    });
    const user = created[0];
    const skills = appState.accountDraft.skills.split(",").map((item) => item.trim()).filter(Boolean);
    for (const skill of skills) {
      await insertRows("user_skills", { user_id: user.id, skill_name: skill });
    }
    await refreshBootstrap();
    appState.accountDraft = { first_name: "", last_name: "", phone: "", email: "", role: "viewer", skills: "" };
    setFlashMessage("Account creato");
  } catch (error) {
    setFlashMessage(error.message || "Errore nella creazione account");
  } finally {
    appState.busy = false;
    renderApp();
  }
};

saveTaskAssignment = async function saveTaskAssignmentOverride() {
  const taskId = Number(appState.assignmentDraft.taskId);
  const assignedUserId = Number(appState.assignmentDraft.assignedUserId);
  if (!taskId || !assignedUserId) {
    setFlashMessage("Seleziona task e dipendente");
    return;
  }
  setBusy(true);
  try {
    await patchRows("order_tasks", { id: `eq.${taskId}` }, {
      assigned_user_id: assignedUserId,
      planned_date: appState.assignmentDraft.plannedDate || null,
      calendar_day_label: appState.assignmentDraft.calendarDay || null,
      notes: "Assegnazione aggiornata dalla UI",
    });
    await refreshBootstrap();
    setFlashMessage("Assegnazione calendario salvata");
  } catch (error) {
    setFlashMessage(error.message || "Errore nell'assegnazione");
  } finally {
    appState.busy = false;
    renderApp();
  }
};

updateTaskFromUi = async function updateTaskFromUiOverride(taskId, nextStatus) {
  setBusy(true);
  try {
    await patchRows("order_tasks", { id: `eq.${taskId}` }, {
      status: nextStatus,
      notes: `Aggiornato dalla UI in stato ${nextStatus}`,
    });
    await refreshBootstrap();
    setFlashMessage("Task aggiornato");
  } catch (error) {
    setFlashMessage(error.message || "Errore durante l'aggiornamento del task");
  } finally {
    appState.busy = false;
    renderApp();
  }
};

(async () => {
  try {
    await refreshBootstrap();
    renderApp();
  } catch (error) {
    console.warn("Override Supabase non disponibile", error);
  }
})();
