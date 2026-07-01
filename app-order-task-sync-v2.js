const TASK_SYNC_LOCAL_PREFIX = "local-task";

function taskSyncOrder() {
  return typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
}

function taskSyncOrderId(order = taskSyncOrder()) {
  return Number(order?.id || appState.selectedOrderId || 0);
}

function taskSyncKey(task) {
  const raw = String(task?.phase || task?.task_phase || task?.name || task?.task_name || "").toLowerCase();
  if (raw.includes("cartamodello")) return "cartamodello";
  if (raw.includes("taglio")) return "taglio";
  if (raw.includes("confezione")) return "confezione";
  return raw.trim();
}

function taskSyncLocalId(orderId, key, index) {
  return `${TASK_SYNC_LOCAL_PREFIX}-${orderId}-${String(key || index).replace(/[^a-z0-9]+/gi, "-")}`;
}

function taskSyncAssigneeValue(task) {
  if (task?.assignedUserId) return String(task.assignedUserId);
  if (task?.assigned_user_id) return String(task.assigned_user_id);
  if (task?.externalSupplierName) return `external:${encodeURIComponent(task.externalSupplierName)}`;
  if (task?.external_supplier_name) return `external:${encodeURIComponent(task.external_supplier_name)}`;
  return "";
}

function taskSyncAssigneeLabel(value) {
  if (!value) return "Da assegnare";
  if (String(value).startsWith("external:")) return decodeURIComponent(String(value).slice(9));
  const option = (typeof orderFlowEmployeeOptions === "function" ? orderFlowEmployeeOptions() : [])
    .find((item) => String(item.value) === String(value));
  return option?.label || "Da assegnare";
}

function taskSyncDraftFromTask(task, index, orderId) {
  const key = taskSyncKey(task) || `task-${index + 1}`;
  const assignedUserId = taskSyncAssigneeValue(task);
  return {
    id: task.id || taskSyncLocalId(orderId, key, index),
    name: task.name || task.task_name || `${key} ordine`,
    phase: task.phase || task.task_phase || key,
    assignedUserId,
    team: task.team || taskSyncAssigneeLabel(assignedUserId),
    hours: String(task.hours || task.estimated_hours || "").replace(" h", "").replace(",", "."),
    time: String(task.time || task.planned_date || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "",
    state: task.state || task.status || "Da avviare",
  };
}

function taskSyncTaskFromDraft(task, index, orderId) {
  const assignedUserId = task.assignedUserId || "";
  const hours = String(task.hours || "").trim();
  return {
    id: task.id || taskSyncLocalId(orderId, task.phase || task.name, index),
    name: task.name || "Nuovo task ordine",
    phase: task.phase || "altro",
    team: taskSyncAssigneeLabel(assignedUserId),
    hours: hours ? `${hours.replace(".", ",")} h` : "0,0 h",
    time: task.time || "Da pianificare",
    state: task.state || "Da avviare",
    assignedUserId,
    externalSupplierName: String(assignedUserId).startsWith("external:") ? decodeURIComponent(String(assignedUserId).slice(9)) : "",
    localOnly: String(task.id || "").startsWith(TASK_SYNC_LOCAL_PREFIX),
  };
}

function taskSyncEnsureOrderTasks(order = taskSyncOrder()) {
  const orderId = taskSyncOrderId(order);
  if (!orderId) return [];
  if (typeof orderTaskCompletenessMerge === "function") orderTaskCompletenessMerge(order);
  if (!appData.orderTasks || typeof appData.orderTasks !== "object") appData.orderTasks = {};
  if (!Array.isArray(appData.orderTasks[orderId])) appData.orderTasks[orderId] = [];
  return appData.orderTasks[orderId];
}

function taskSyncDraft(order = taskSyncOrder(), draft = null) {
  const orderId = taskSyncOrderId(order);
  if (!orderId) return draft;
  const currentDraft = draft || appState.orderDetailEdits?.[orderId];
  if (!currentDraft) return draft;
  if (!Array.isArray(currentDraft.tasks)) currentDraft.tasks = [];
  const byKey = new Map(currentDraft.tasks.map((task) => [taskSyncKey(task), task]));
  taskSyncEnsureOrderTasks(order).forEach((task, index) => {
    const key = taskSyncKey(task);
    if (key && !byKey.has(key)) currentDraft.tasks.push(taskSyncDraftFromTask(task, index, orderId));
  });
  return currentDraft;
}

if (typeof orderDetailEditApplyStoredToOrders === "function") {
  const baseApply = orderDetailEditApplyStoredToOrders;
  orderDetailEditApplyStoredToOrders = function taskSyncApplyStored() {
    baseApply();
    const order = taskSyncOrder();
    taskSyncEnsureOrderTasks(order);
    taskSyncDraft(order);
  };
}

if (typeof orderDetailEditDraftFor === "function") {
  const baseDraftFor = orderDetailEditDraftFor;
  orderDetailEditDraftFor = function taskSyncDraftFor(order) {
    return taskSyncDraft(order, baseDraftFor(order));
  };
}

if (typeof orderDetailEditTaskRows === "function") {
  orderDetailEditTaskRows = function taskSyncRows(rows) {
    const people = typeof orderFlowEmployeeOptions === "function" ? orderFlowEmployeeOptions() : [];
    if (!rows.length) return `<div class="empty-state">Nessun task ancora inserito. Usa + Task per organizzare il lavoro.</div>`;
    return rows.map((row, index) => `
      <div class="task-item order-detail-edit-task">
        <div><label class="muted">Task</label><input class="field-value" data-order-detail-task-index="${index}" data-order-detail-task-field="name" value="${orderDetailEditEscape(row.name)}" /></div>
        <div><label class="muted">Fase</label><select class="filter-chip" data-order-detail-task-index="${index}" data-order-detail-task-field="phase">${["cartamodello", "taglio", "confezione", "controllo", "altro"].map((phase) => `<option value="${phase}" ${String(row.phase || "").toLowerCase() === phase ? "selected" : ""}>${phase.charAt(0).toUpperCase() + phase.slice(1)}</option>`).join("")}</select></div>
        <div><label class="muted">Assegna a</label><select class="filter-chip" data-order-detail-task-index="${index}" data-order-detail-task-field="assignedUserId"><option value="">Da assegnare</option>${people.map((person) => `<option value="${orderDetailEditEscape(person.value)}" ${String(row.assignedUserId || "") === String(person.value) ? "selected" : ""}>${orderDetailEditEscape(person.label)}</option>`).join("")}</select></div>
        <div><label class="muted">Data consegna task</label><input class="field-value" type="date" data-order-detail-task-index="${index}" data-order-detail-task-field="time" value="${orderDetailEditEscape(row.time)}" /></div>
        <div><label class="muted">Ore lavoro</label><input class="field-value" type="number" min="0" step="0.5" data-order-detail-task-index="${index}" data-order-detail-task-field="hours" value="${orderDetailEditEscape(row.hours)}" /></div>
        <div><label class="muted">Stato</label><select class="filter-chip" data-order-detail-task-index="${index}" data-order-detail-task-field="state">${["Da avviare", "In corso", "Completato", "Da confermare", "Stand by"].map((state) => `<option value="${state}" ${row.state === state ? "selected" : ""}>${state}</option>`).join("")}</select></div>
        <div><button class="mini-btn" data-order-detail-remove-task="${index}" type="button">Rimuovi</button></div>
      </div>
    `).join("");
  };
}

if (typeof orderDetailEditHandleClick === "function") {
  const baseClick = orderDetailEditHandleClick;
  orderDetailEditHandleClick = function taskSyncClick(target) {
    const add = target.closest?.("[data-order-detail-add-task]");
    const draft = typeof orderDetailEditCurrentDraft === "function" ? orderDetailEditCurrentDraft() : null;
    if (add && draft) {
      const orderId = taskSyncOrderId();
      const index = draft.tasks.length;
      draft.tasks.push({ id: taskSyncLocalId(orderId, "nuovo", index), name: "Nuovo task ordine", phase: "altro", assignedUserId: "", team: "Da assegnare", hours: "", time: "", state: "Da avviare" });
      renderApp();
      return true;
    }
    return baseClick(target);
  };
}

if (typeof orderDetailEditSave === "function") {
  const baseSave = orderDetailEditSave;
  orderDetailEditSave = function taskSyncSave() {
    const order = taskSyncOrder();
    const orderId = taskSyncOrderId(order);
    const draft = typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
    if (draft && orderId) {
      appData.orderTasks[orderId] = draft.tasks.map((task, index) => taskSyncTaskFromDraft(task, index, orderId));
    }
    baseSave();
  };
}

const baseRenderTaskSync = renderApp;
renderApp = function renderTaskSync() {
  if (appState.currentView === "order-detail") {
    const order = taskSyncOrder();
    taskSyncEnsureOrderTasks(order);
    taskSyncDraft(order);
  }
  baseRenderTaskSync();
};

if (document.getElementById("app")?.innerHTML) renderApp();
