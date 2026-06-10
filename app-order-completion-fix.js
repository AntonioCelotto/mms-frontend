const ORDER_COMPLETE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
const ORDER_COMPLETE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";
const ORDER_COMPLETE_PHASES = [
  ["cartamodello", "Cartamodello"],
  ["taglio", "Taglio"],
  ["confezione", "Confezione"],
];

function orderCompleteEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function orderCompleteCache() {
  if (!appState.orderCompletionCache) {
    appState.orderCompletionCache = {
      attachments: {},
      materials: {},
      tasks: {},
      loadingAttachments: {},
      loadingMaterials: {},
      loadingTasks: {},
    };
  }
  return appState.orderCompletionCache;
}

function orderCompleteState() {
  if (!appState.newOrderTaskPlan) {
    appState.newOrderTaskPlan = ORDER_COMPLETE_PHASES.map(([phase, label]) => ({
      phase,
      label,
      enabled: true,
      assignedUserId: "",
      plannedDate: "",
      plannedTime: "",
    }));
  }
  return appState.newOrderTaskPlan;
}

function orderCompleteHeaders(extra = {}) {
  return { apikey: ORDER_COMPLETE_KEY, Authorization: `Bearer ${ORDER_COMPLETE_KEY}`, ...extra };
}

async function orderCompleteRequest(path, options = {}) {
  const response = await fetch(`${ORDER_COMPLETE_URL}${path}`, {
    ...options,
    headers: orderCompleteHeaders(options.headers || {}),
  });
  const raw = await response.text().catch(() => "");
  let payload = null;
  if (raw) {
    try { payload = JSON.parse(raw); } catch (error) { payload = { detail: raw.slice(0, 240) }; }
  }
  if (!response.ok) throw new Error(payload?.message || payload?.detail || payload?.error || `Richiesta non riuscita (${response.status})`);
  return payload;
}

function orderCompleteDisplayId(order) {
  return Number(order?.id || appState.selectedOrderId || 0);
}

function orderCompleteDbId(order) {
  return Number(order?.db_id || order?.internal_id || order?.id || appState.selectedOrderId || 0);
}

function orderCompleteEmployeeOptions() {
  const fallback = typeof getFallbackAssignableAccounts === "function" ? getFallbackAssignableAccounts() : [];
  const accounts = Array.isArray(appData.accounts) && appData.accounts.length ? appData.accounts : fallback;
  return accounts.map((account) => ({
    value: account.id ? String(account.id).startsWith("external:") ? String(account.id) : String(account.id) : `external:${encodeURIComponent(account.name || "Operatore")}`,
    label: account.name || account.email || "Operatore",
  }));
}

function orderCompleteFormatDateTime(date, time) {
  const cleanDate = String(date || "").trim();
  const cleanTime = String(time || "").trim();
  if (!cleanDate) return null;
  return cleanTime ? `${cleanDate} ${cleanTime}` : cleanDate;
}

function orderCompleteParseAssignee(value) {
  const raw = String(value || "");
  if (!raw) return { assigned_user_id: null, external_supplier_name: null };
  if (raw.startsWith("external:")) return { assigned_user_id: null, external_supplier_name: decodeURIComponent(raw.slice(9)) };
  const parsed = Number(raw.replace(/^user:/, ""));
  if (Number.isFinite(parsed) && parsed > 0) return { assigned_user_id: parsed, external_supplier_name: null };
  return { assigned_user_id: null, external_supplier_name: raw };
}

function orderCompleteNormalizeAttachment(attachment) {
  return {
    id: attachment.id,
    name: attachment.name || attachment.file_name || "Allegato",
    url: attachment.url || attachment.file_url || attachment.publicUrl || attachment.localUrl || "",
    type: attachment.mime_type || attachment.type || "",
    size: attachment.size || attachment.file_size || 0,
    sizeLabel: typeof formatAttachmentSize === "function" ? formatAttachmentSize(attachment.size || attachment.file_size || 0) : "",
    persisted: !!(attachment.url || attachment.file_url || attachment.id),
  };
}

if (typeof normalizePersistedAttachment === "function") {
  normalizePersistedAttachment = orderCompleteNormalizeAttachment;
}

async function orderCompleteLoadAttachments(order, force = false) {
  if (typeof loadPersistedOrderAttachments !== "function") return;
  const displayId = orderCompleteDisplayId(order);
  const dbId = orderCompleteDbId(order);
  const cache = orderCompleteCache();
  if (!displayId || !dbId || cache.loadingAttachments[displayId]) return;
  if (!force && cache.attachments[displayId]) return;
  cache.loadingAttachments[displayId] = true;
  try {
    await loadPersistedOrderAttachments(dbId, force, displayId).catch(() => {});
    cache.attachments[displayId] = true;
  } finally {
    cache.loadingAttachments[displayId] = false;
  }
}

function orderCompleteNormalizeMaterial(material, inventoryById = new Map()) {
  const inventory = inventoryById.get(Number(material.inventory_item_id));
  const skuText = inventory?.sku ? `SKU ${inventory.sku}` : "Inserimento manuale";
  return {
    material: material.product_name || material.material || "Materiale",
    source: material.source_type === "mms" ? "MMS" : "Cliente",
    warehouse: material.warehouse_status_note || skuText,
    delivery: material.delivery_status === "consegnato" ? "Consegnato" : "Non consegnato",
    preorder: material.preorder_note || "Nessun preordine",
  };
}

async function orderCompleteLoadMaterials(order, force = false) {
  const displayId = orderCompleteDisplayId(order);
  const dbId = orderCompleteDbId(order);
  const cache = orderCompleteCache();
  if (!displayId || !dbId || cache.loadingMaterials[displayId]) return appData.orderMaterials?.[displayId] || [];
  if (!force && cache.materials[displayId]) return appData.orderMaterials?.[displayId] || [];
  cache.loadingMaterials[displayId] = true;
  try {
    const [materials, inventory] = await Promise.all([
      orderCompleteRequest(`/rest/v1/order_materials?select=*&order_id=eq.${dbId}&order=id.asc`),
      orderCompleteRequest("/rest/v1/inventory_items?select=id,sku,name"),
    ]);
    const inventoryById = new Map((Array.isArray(inventory) ? inventory : []).map((item) => [Number(item.id), item]));
    const shaped = (Array.isArray(materials) ? materials : []).map((material) => orderCompleteNormalizeMaterial(material, inventoryById));
    if (!appData.orderMaterials || typeof appData.orderMaterials !== "object") appData.orderMaterials = {};
    appData.orderMaterials[displayId] = shaped;
    cache.materials[displayId] = true;
    return shaped;
  } finally {
    cache.loadingMaterials[displayId] = false;
  }
}

async function orderCompleteInventoryIdForSku(sku) {
  const cleanSku = String(sku || "").trim();
  if (!cleanSku) return null;
  const rows = await orderCompleteRequest(`/rest/v1/inventory_items?select=id&sku=eq.${encodeURIComponent(cleanSku)}&limit=1`);
  return Array.isArray(rows) && rows[0]?.id ? Number(rows[0].id) : null;
}

async function orderCompleteSaveMaterialsDirect(order, materials) {
  const dbId = orderCompleteDbId(order);
  if (!dbId || !Array.isArray(materials) || !materials.length) return 0;
  await orderCompleteRequest(`/rest/v1/order_materials?order_id=eq.${dbId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  const payload = [];
  for (const item of materials) {
    const productName = String(item.product_name || item.material || "").trim();
    if (!productName) continue;
    const sourceType = item.source_type === "mms" ? "mms" : "cliente";
    const inventoryItemId = sourceType === "mms" ? await orderCompleteInventoryIdForSku(item.inventory_sku) : null;
    payload.push({
      order_id: dbId,
      inventory_item_id: inventoryItemId,
      product_name: productName,
      source_type: sourceType,
      delivery_status: item.delivery_status === "consegnato" ? "consegnato" : "non_consegnato",
      warehouse_status_note: item.warehouse_status_note || null,
      preorder_note: item.preorder_note || null,
      quantity_required: Number(String(item.quantity_required || 1).replace(",", ".")) || 1,
      notes: item.notes || null,
    });
  }
  if (!payload.length) return 0;
  await orderCompleteRequest("/rest/v1/order_materials", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  await orderCompleteLoadMaterials(order, true);
  return payload.length;
}

async function orderCompleteLoadTasks(order, force = false) {
  const displayId = orderCompleteDisplayId(order);
  const dbId = orderCompleteDbId(order);
  const cache = orderCompleteCache();
  if (!displayId || !dbId || cache.loadingTasks[displayId]) return appData.orderTasks?.[displayId] || [];
  if (!force && cache.tasks[displayId]) return appData.orderTasks?.[displayId] || [];
  cache.loadingTasks[displayId] = true;
  try {
    const rows = await orderCompleteRequest(`/rest/v1/order_tasks?select=*,departments(name),users(first_name,last_name)&order_id=eq.${dbId}&order=id.asc`);
    const tasks = (Array.isArray(rows) ? rows : []).map((task) => {
      const userName = [task.users?.first_name, task.users?.last_name].filter(Boolean).join(" ").trim();
      const owner = userName || task.external_supplier_name || "Non assegnato";
      const dept = task.departments?.name || "Reparto";
      return {
        id: task.id,
        name: task.task_name,
        phase: task.task_phase,
        team: `${dept} - ${owner}`,
        hours: `${Number(task.estimated_hours || 0).toFixed(1).replace(".", ",")} h`,
        time: task.planned_date || "Da pianificare",
        state: String(task.status || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
        calendarDay: task.calendar_day_label || "Da pianificare",
      };
    });
    if (!appData.orderTasks || typeof appData.orderTasks !== "object") appData.orderTasks = {};
    appData.orderTasks[displayId] = tasks;
    cache.tasks[displayId] = true;
    return tasks;
  } finally {
    cache.loadingTasks[displayId] = false;
  }
}

async function orderCompleteApplyTaskPlan(order) {
  const plan = orderCompleteState().filter((item) => item.enabled && item.assignedUserId);
  if (!plan.length) return 0;
  const tasks = await orderCompleteLoadTasks(order, true);
  let count = 0;
  for (const planItem of plan) {
    const task = tasks.find((item) => String(item.phase || "").toLowerCase() === planItem.phase);
    if (!task?.id) continue;
    const assignee = orderCompleteParseAssignee(planItem.assignedUserId);
    const response = await fetch("/api/assign-task", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: task.id,
        assigned_user_id: assignee.assigned_user_id,
        external_supplier_name: assignee.external_supplier_name,
        planned_date: orderCompleteFormatDateTime(planItem.plannedDate, planItem.plannedTime),
        calendar_day_label: typeof getCalendarDayFromDate === "function" ? getCalendarDayFromDate(planItem.plannedDate) : null,
        notes: "Assegnazione impostata durante la creazione ordine",
      }),
    });
    if (response.ok) count += 1;
  }
  if (count) await orderCompleteLoadTasks(order, true);
  return count;
}

function orderCompleteTaskPlanMarkup() {
  const plan = orderCompleteState();
  const employees = orderCompleteEmployeeOptions();
  return `
    <div class="surface order-task-plan-panel" style="margin-top:16px;">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Task e assegnazioni iniziali</h3>
            <p>Imposta gia' ora chi deve seguire cartamodello, taglio e confezione. I task vengono creati con l'ordine e poi assegnati automaticamente.</p>
          </div>
        </div>
        <div class="task-list">
          ${plan.map((item, index) => `
            <div class="task-item" style="grid-template-columns: 1fr 1fr 1fr 1fr; align-items:end;">
              <div>
                <label class="muted" style="display:block; margin-bottom:6px;"><input type="checkbox" data-order-task-plan-index="${index}" data-order-task-plan-field="enabled" ${item.enabled ? "checked" : ""} /> ${orderCompleteEscape(item.label)}</label>
                <strong>${orderCompleteEscape(item.label)} ordine</strong>
              </div>
              <div>
                <label class="muted" style="display:block; margin-bottom:6px;">Assegna a</label>
                <select class="filter-chip" data-order-task-plan-index="${index}" data-order-task-plan-field="assignedUserId">
                  <option value="">Da assegnare dopo</option>
                  ${employees.map((employee) => `<option value="${orderCompleteEscape(employee.value)}" ${item.assignedUserId === employee.value ? "selected" : ""}>${orderCompleteEscape(employee.label)}</option>`).join("")}
                </select>
              </div>
              <div>
                <label class="muted" style="display:block; margin-bottom:6px;">Data</label>
                <input class="field-value" type="date" data-order-task-plan-index="${index}" data-order-task-plan-field="plannedDate" value="${orderCompleteEscape(item.plannedDate)}" />
              </div>
              <div>
                <label class="muted" style="display:block; margin-bottom:6px;">Ora</label>
                <input class="field-value" type="time" data-order-task-plan-index="${index}" data-order-task-plan-field="plannedTime" value="${orderCompleteEscape(item.plannedTime)}" />
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function orderCompleteMountTaskPlan() {
  if (appState.currentView !== "new-order") return;
  const section = document.querySelector("section.view.active");
  if (!section || section.querySelector(".order-task-plan-panel")) return;
  const title = Array.from(section.querySelectorAll(".section-title h3")).find((node) => node.textContent.trim().toLowerCase().includes("task generati"));
  const surface = title?.closest(".surface");
  if (surface) surface.insertAdjacentHTML("beforebegin", orderCompleteTaskPlanMarkup());
}

function orderCompleteAttachEvents() {
  document.querySelectorAll("[data-order-task-plan-field]").forEach((input) => {
    const handler = (event) => {
      const index = Number(event.target.dataset.orderTaskPlanIndex);
      const field = event.target.dataset.orderTaskPlanField;
      const plan = orderCompleteState();
      if (!plan[index]) return;
      plan[index][field] = field === "enabled" ? event.target.checked : event.target.value;
    };
    input.oninput = handler;
    input.onchange = handler;
  });
}

async function orderCompleteFinalize(order, materialsSnapshot) {
  if (!order?.id && !order?.db_id) return;
  const savedMaterials = await orderCompleteSaveMaterialsDirect(order, materialsSnapshot).catch((error) => {
    console.warn("Materiali non riallineati", error);
    return 0;
  });
  const assignedTasks = await orderCompleteApplyTaskPlan(order).catch((error) => {
    console.warn("Task non assegnati", error);
    return 0;
  });
  await Promise.all([
    orderCompleteLoadAttachments(order, true),
    orderCompleteLoadMaterials(order, true),
    orderCompleteLoadTasks(order, true),
  ]);
  if (savedMaterials || assignedTasks) {
    setFlashMessage(`Ordine completato: ${savedMaterials} materiali collegati, ${assignedTasks} task assegnati`);
  }
}

const baseSaveDraftOrderCompleteFix = saveDraftOrder;
saveDraftOrder = async function saveDraftOrderWithCompletionFix() {
  const materialsSnapshot = Array.isArray(appState.draftMaterials) ? appState.draftMaterials.map((item) => ({ ...item })) : [];
  await baseSaveDraftOrderCompleteFix();
  const order = getSelectedOrder?.();
  await orderCompleteFinalize(order, materialsSnapshot);
  renderApp();
};

const baseRefreshBootstrapOrderCompleteFix = refreshBootstrap;
refreshBootstrap = async function refreshBootstrapWithOrderCompletion() {
  await baseRefreshBootstrapOrderCompleteFix();
  const order = getSelectedOrder?.();
  if (order?.id || order?.db_id) {
    await Promise.all([
      orderCompleteLoadMaterials(order, true).catch(() => []),
      orderCompleteLoadTasks(order, true).catch(() => []),
    ]);
  }
};

const baseRenderAppOrderCompleteFix = renderApp;
renderApp = function renderAppWithOrderCompletionFix() {
  baseRenderAppOrderCompleteFix();
  orderCompleteMountTaskPlan();
  orderCompleteAttachEvents();
  const order = getSelectedOrder?.();
  if (appState.currentView === "order-detail" && order) {
    orderCompleteLoadAttachments(order).catch(() => {});
    orderCompleteLoadMaterials(order).then((materials) => {
      if (materials.length && !document.querySelector(".order-completion-material-rendered")) renderApp();
    }).catch(() => {});
    orderCompleteLoadTasks(order).then((tasks) => {
      if (tasks.length && !document.querySelector(".order-completion-task-rendered")) renderApp();
    }).catch(() => {});
  }
};
