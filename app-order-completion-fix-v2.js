const ORDER_FLOW_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
const ORDER_FLOW_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";
const ORDER_FLOW_PHASES = [["cartamodello", "Cartamodello"], ["taglio", "Taglio"], ["confezione", "Confezione"]];

function orderFlowEscape(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function orderFlowPlan() {
  if (!appState.newOrderTaskPlan) {
    appState.newOrderTaskPlan = ORDER_FLOW_PHASES.map(([phase, label]) => ({ phase, label, enabled: true, assignedUserId: "", plannedDate: "", plannedTime: "" }));
  }
  return appState.newOrderTaskPlan;
}

function orderFlowHeaders(extra = {}) {
  return { apikey: ORDER_FLOW_KEY, Authorization: `Bearer ${ORDER_FLOW_KEY}`, ...extra };
}

async function orderFlowRequest(path, options = {}) {
  const response = await fetch(`${ORDER_FLOW_URL}${path}`, { ...options, headers: orderFlowHeaders(options.headers || {}) });
  const raw = await response.text().catch(() => "");
  let payload = null;
  if (raw) {
    try { payload = JSON.parse(raw); } catch (error) { payload = { detail: raw.slice(0, 240) }; }
  }
  if (!response.ok) throw new Error(payload?.message || payload?.detail || payload?.error || `Richiesta non riuscita (${response.status})`);
  return payload;
}

function orderFlowDisplayId(order) {
  return Number(order?.id || appState.selectedOrderId || 0);
}

function orderFlowDbId(order) {
  return Number(order?.db_id || order?.internal_id || order?.id || appState.selectedOrderId || 0);
}

function orderFlowEmployeeOptions() {
  const fallback = typeof getFallbackAssignableAccounts === "function" ? getFallbackAssignableAccounts() : [];
  const accounts = Array.isArray(appData.accounts) && appData.accounts.length ? appData.accounts : fallback;
  return accounts.map((account) => ({
    value: account.id ? String(account.id).startsWith("external:") ? String(account.id) : String(account.id) : `external:${encodeURIComponent(account.name || "Operatore")}`,
    label: account.name || account.email || "Operatore",
  }));
}

function orderFlowNormalizeAttachment(attachment) {
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

if (typeof normalizePersistedAttachment === "function") normalizePersistedAttachment = orderFlowNormalizeAttachment;

async function orderFlowInventoryIdForSku(sku) {
  const cleanSku = String(sku || "").trim();
  if (!cleanSku) return null;
  const rows = await orderFlowRequest(`/rest/v1/inventory_items?select=id&sku=eq.${encodeURIComponent(cleanSku)}&limit=1`);
  return Array.isArray(rows) && rows[0]?.id ? Number(rows[0].id) : null;
}

async function orderFlowSaveMaterials(order, materials) {
  const dbId = orderFlowDbId(order);
  if (!dbId || !Array.isArray(materials) || !materials.length) return 0;
  await orderFlowRequest(`/rest/v1/order_materials?order_id=eq.${dbId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  const payload = [];
  for (const item of materials) {
    const productName = String(item.product_name || item.material || "").trim();
    if (!productName) continue;
    const sourceType = item.source_type === "mms" ? "mms" : "cliente";
    payload.push({
      order_id: dbId,
      inventory_item_id: sourceType === "mms" ? await orderFlowInventoryIdForSku(item.inventory_sku) : null,
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
  await orderFlowRequest("/rest/v1/order_materials", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(payload) });
  await orderFlowLoadMaterials(order);
  return payload.length;
}

function orderFlowMaterialShape(material, inventoryById) {
  const inventory = inventoryById.get(Number(material.inventory_item_id));
  return {
    material: material.product_name || "Materiale",
    source: material.source_type === "mms" ? "MMS" : "Cliente",
    warehouse: material.warehouse_status_note || (inventory?.sku ? `SKU ${inventory.sku}` : "Inserimento manuale"),
    delivery: material.delivery_status === "consegnato" ? "Consegnato" : "Non consegnato",
    preorder: material.preorder_note || "Nessun preordine",
  };
}

async function orderFlowLoadMaterials(order) {
  const displayId = orderFlowDisplayId(order);
  const dbId = orderFlowDbId(order);
  if (!displayId || !dbId) return [];
  const [materials, inventory] = await Promise.all([
    orderFlowRequest(`/rest/v1/order_materials?select=*&order_id=eq.${dbId}&order=id.asc`),
    orderFlowRequest("/rest/v1/inventory_items?select=id,sku,name"),
  ]);
  const inventoryById = new Map((Array.isArray(inventory) ? inventory : []).map((item) => [Number(item.id), item]));
  const shaped = (Array.isArray(materials) ? materials : []).map((material) => orderFlowMaterialShape(material, inventoryById));
  if (!appData.orderMaterials || typeof appData.orderMaterials !== "object") appData.orderMaterials = {};
  appData.orderMaterials[displayId] = shaped;
  return shaped;
}

function orderFlowTaskShape(task) {
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
}

async function orderFlowLoadTasks(order) {
  const displayId = orderFlowDisplayId(order);
  const dbId = orderFlowDbId(order);
  if (!displayId || !dbId) return [];
  const rows = await orderFlowRequest(`/rest/v1/order_tasks?select=*,departments(name),users(first_name,last_name)&order_id=eq.${dbId}&order=id.asc`);
  const tasks = (Array.isArray(rows) ? rows : []).map(orderFlowTaskShape);
  if (!appData.orderTasks || typeof appData.orderTasks !== "object") appData.orderTasks = {};
  appData.orderTasks[displayId] = tasks;
  return tasks;
}

function orderFlowParseAssignee(value) {
  const raw = String(value || "");
  if (!raw) return { assigned_user_id: null, external_supplier_name: null };
  if (raw.startsWith("external:")) return { assigned_user_id: null, external_supplier_name: decodeURIComponent(raw.slice(9)) };
  const parsed = Number(raw.replace(/^user:/, ""));
  if (Number.isFinite(parsed) && parsed > 0) return { assigned_user_id: parsed, external_supplier_name: null };
  return { assigned_user_id: null, external_supplier_name: raw };
}

function orderFlowDateTime(date, time) {
  const d = String(date || "").trim();
  const t = String(time || "").trim();
  if (!d) return null;
  return t ? `${d} ${t}` : d;
}

async function orderFlowApplyTaskPlan(order) {
  const selected = orderFlowPlan().filter((item) => item.enabled && item.assignedUserId);
  if (!selected.length) return 0;
  const tasks = await orderFlowLoadTasks(order);
  let count = 0;
  for (const plan of selected) {
    const task = tasks.find((item) => String(item.phase || "").toLowerCase() === plan.phase);
    if (!task?.id) continue;
    const assignee = orderFlowParseAssignee(plan.assignedUserId);
    const response = await fetch("/api/assign-task", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: task.id,
        assigned_user_id: assignee.assigned_user_id,
        external_supplier_name: assignee.external_supplier_name,
        planned_date: orderFlowDateTime(plan.plannedDate, plan.plannedTime),
        calendar_day_label: typeof getCalendarDayFromDate === "function" ? getCalendarDayFromDate(plan.plannedDate) : null,
        notes: "Assegnazione impostata durante la creazione ordine",
      }),
    });
    if (response.ok) count += 1;
  }
  if (count) await orderFlowLoadTasks(order);
  return count;
}

async function orderFlowLoadAttachments(order) {
  if (typeof loadPersistedOrderAttachments !== "function") return;
  const displayId = orderFlowDisplayId(order);
  const dbId = orderFlowDbId(order);
  if (!displayId || !dbId) return;
  await loadPersistedOrderAttachments(dbId, true, displayId).catch(() => {});
}

function orderFlowTaskPanelMarkup() {
  const plan = orderFlowPlan();
  const employees = orderFlowEmployeeOptions();
  return `
    <div class="surface order-task-plan-panel" style="margin-top:16px;">
      <div class="surface-inner">
        <div class="section-title"><div><h3>Task e assegnazioni iniziali</h3><p>Scegli subito chi prende in carico cartamodello, taglio e confezione. I task vengono creati con l'ordine e assegnati al salvataggio.</p></div></div>
        <div class="task-list">
          ${plan.map((item, index) => `
            <div class="task-item" style="grid-template-columns: 1fr 1fr 1fr 1fr; align-items:end;">
              <div><label class="muted" style="display:block; margin-bottom:6px;"><input type="checkbox" data-order-flow-plan-index="${index}" data-order-flow-plan-field="enabled" ${item.enabled ? "checked" : ""} /> ${orderFlowEscape(item.label)}</label><strong>${orderFlowEscape(item.label)} ordine</strong></div>
              <div><label class="muted" style="display:block; margin-bottom:6px;">Assegna a</label><select class="filter-chip" data-order-flow-plan-index="${index}" data-order-flow-plan-field="assignedUserId"><option value="">Da assegnare dopo</option>${employees.map((employee) => `<option value="${orderFlowEscape(employee.value)}" ${item.assignedUserId === employee.value ? "selected" : ""}>${orderFlowEscape(employee.label)}</option>`).join("")}</select></div>
              <div><label class="muted" style="display:block; margin-bottom:6px;">Data</label><input class="field-value" type="date" data-order-flow-plan-index="${index}" data-order-flow-plan-field="plannedDate" value="${orderFlowEscape(item.plannedDate)}" /></div>
              <div><label class="muted" style="display:block; margin-bottom:6px;">Ora</label><input class="field-value" type="time" data-order-flow-plan-index="${index}" data-order-flow-plan-field="plannedTime" value="${orderFlowEscape(item.plannedTime)}" /></div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function orderFlowMountTaskPanel() {
  if (appState.currentView !== "new-order") return;
  const section = document.querySelector("section.view.active");
  if (!section || section.querySelector(".order-task-plan-panel")) return;
  const title = Array.from(section.querySelectorAll(".section-title h3")).find((node) => node.textContent.trim().toLowerCase().includes("task generati"));
  const surface = title?.closest(".surface");
  if (surface) surface.insertAdjacentHTML("beforebegin", orderFlowTaskPanelMarkup());
}

function orderFlowAttachPlanEvents() {
  document.querySelectorAll("[data-order-flow-plan-field]").forEach((input) => {
    const handler = (event) => {
      const index = Number(event.target.dataset.orderFlowPlanIndex);
      const field = event.target.dataset.orderFlowPlanField;
      const plan = orderFlowPlan();
      if (!plan[index]) return;
      plan[index][field] = field === "enabled" ? event.target.checked : event.target.value;
    };
    input.oninput = handler;
    input.onchange = handler;
  });
}

async function orderFlowFinalize(order, materialsSnapshot) {
  if (!order?.id && !order?.db_id) return;
  const savedMaterials = await orderFlowSaveMaterials(order, materialsSnapshot).catch(() => 0);
  const assignedTasks = await orderFlowApplyTaskPlan(order).catch(() => 0);
  await Promise.all([orderFlowLoadAttachments(order), orderFlowLoadMaterials(order), orderFlowLoadTasks(order)]);
  if (savedMaterials || assignedTasks) setFlashMessage(`Ordine completato: ${savedMaterials} materiali collegati, ${assignedTasks} task assegnati`);
}

const baseSaveDraftOrderFlow = saveDraftOrder;
saveDraftOrder = async function saveDraftOrderWithOrderFlow() {
  const materialsSnapshot = Array.isArray(appState.draftMaterials) ? appState.draftMaterials.map((item) => ({ ...item })) : [];
  await baseSaveDraftOrderFlow();
  await orderFlowFinalize(getSelectedOrder?.(), materialsSnapshot);
  renderApp();
};

const baseRefreshBootstrapOrderFlow = refreshBootstrap;
refreshBootstrap = async function refreshBootstrapWithOrderFlow() {
  await baseRefreshBootstrapOrderFlow();
  const order = getSelectedOrder?.();
  if (order?.id || order?.db_id) await Promise.all([orderFlowLoadMaterials(order).catch(() => []), orderFlowLoadTasks(order).catch(() => [])]);
};

const baseRenderAppOrderFlow = renderApp;
renderApp = function renderAppWithOrderFlow() {
  baseRenderAppOrderFlow();
  orderFlowMountTaskPanel();
  orderFlowAttachPlanEvents();
};
