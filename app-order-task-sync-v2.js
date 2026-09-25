const TASK_SYNC_LOCAL_PREFIX = "local-task";
const taskSyncPendingOrders = new Set();

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
    plannedTime: String(task.time || task.planned_date || "").match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2})/)?.[1] || "",
    state: task.state || task.status || "Da avviare",
    articleKey: task.articleKey || task.article_key || "",
    articleName: task.articleName || task.article_name || "",
    dueDate: task.dueDate || task.due_date || String(task.time || task.planned_date || "").slice(0, 10),
    sequenceOrder: Number(task.sequenceOrder || task.sequence_order || 0),
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
    plannedTime: task.plannedTime || "",
    state: task.state || "Da avviare",
    assignedUserId,
    externalSupplierName: String(assignedUserId).startsWith("external:") ? decodeURIComponent(String(assignedUserId).slice(9)) : "",
    localOnly: String(task.id || "").startsWith(TASK_SYNC_LOCAL_PREFIX),
    articleKey: task.articleKey || "",
    articleName: task.articleName || "",
    dueDate: task.dueDate || task.time || "",
    sequenceOrder: Number(task.sequenceOrder || 0),
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
  const byId = new Set(currentDraft.tasks.map((task) => String(task.id || "")));
  taskSyncEnsureOrderTasks(order).forEach((task, index) => {
    if (!/^\d+$/.test(String(task.id || "")) || byId.has(String(task.id))) return;
    currentDraft.tasks.push(taskSyncDraftFromTask(task, index, orderId));
    byId.add(String(task.id));
  });
  return currentDraft;
}

if (typeof orderDetailEditApplyStoredToOrders === "function") {
  const baseApply = orderDetailEditApplyStoredToOrders;
  orderDetailEditApplyStoredToOrders = function taskSyncApplyStored() {
    const databaseTasks = new Map((appData.orders || [])
      .filter((order) => order.db_id || order.internal_id)
      .map((order) => [String(order.id), (appData.orderTasks?.[order.id] || [])
        .filter((task) => /^\d+$/.test(String(task.id || "")))
        .map((task) => ({ ...task }))]));
    baseApply();
    databaseTasks.forEach((tasks, orderId) => {
      appData.orderTasks[orderId] = tasks;
      const draft = appState.orderDetailEdits?.[Number(orderId)] || appState.orderDetailEdits?.[orderId];
      if (draft && !taskSyncPendingOrders.has(String(orderId))) {
        const currentRows = Array.isArray(draft.tasks) ? draft.tasks : [];
        const pendingRows = currentRows.filter((task) =>
          /^local-task-\d+-(extra|manual|nuovo)/.test(String(task?.id || "")));
        const databaseRows = tasks.map((task, index) => taskSyncDraftFromTask(task, index, Number(orderId)));
        // Never discard a row created with + Task just because it has not
        // reached the database yet. It belongs only to this order's draft.
        draft.tasks = [...databaseRows, ...pendingRows];
      }
    });
  };
}

if (typeof orderDetailEditDraftFor === "function") {
  const baseDraftFor = orderDetailEditDraftFor;
  orderDetailEditDraftFor = function taskSyncDraftFor(order) {
    const orderId = taskSyncOrderId(order);
    const alreadyOpen = !!appState.orderDetailEdits?.[orderId];
    const draft = baseDraftFor(order);
    if (draft && !alreadyOpen && (order?.db_id || order?.internal_id)) {
      draft.tasks = (appData.orderTasks?.[orderId] || [])
        .filter((task) => /^\d+$/.test(String(task.id || "")))
        .map((task, index) => taskSyncDraftFromTask(task, index, orderId));
    }
    return taskSyncDraft(order, draft);
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
    const previousTasks = new Map((appData.orderTasks?.[orderId] || [])
      .filter((task) => Number(task.id) > 0)
      .map((task) => [Number(task.id), task]));
    const draft = typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
    const tasks = draft && orderId
      ? draft.tasks.map((task, index) => taskSyncTaskFromDraft(task, index, orderId))
      : [];

    if (draft && orderId) appData.orderTasks[orderId] = tasks;
    const result = baseSave();

    const persistedStatus = (value) => {
      const key = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
      return ({ da_confermare: "in_attesa", stand_by: "in_attesa" })[key] || key;
    };
    const validDate = (value) => /^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(String(value || "")) ? value : null;
    const changedFields = (task, previous) => ["name", "phase", "assignedUserId", "time", "plannedTime", "hours", "articleKey", "articleName", "dueDate"]
      .some((field) => String(task[field] || "") !== String(previous[field] || ""));
    const plannedDateTime = (task) => validDate(task.time)
      ? [String(task.time).slice(0, 10), task.plannedTime].filter(Boolean).join(" ")
      : null;

    const persistAssignments = async () => {
      let saved = 0;
      for (const task of tasks.filter((row) => Number(row.id) > 0)) {
        const previous = previousTasks.get(Number(task.id));
        const oldTask = previous ? taskSyncTaskFromDraft(taskSyncDraftFromTask(previous, 0, orderId), 0, orderId) : null;
        const detailsChanged = !oldTask || changedFields(task, oldTask);
        const stateChanged = !oldTask || persistedStatus(task.state) !== persistedStatus(oldTask.state);
        if (!detailsChanged && !stateChanged) continue;
        if (detailsChanged && task.assignedUserId && typeof taskAssignmentPatchTask === "function") {
          await taskAssignmentPatchTask(
          Number(task.id),
          task.assignedUserId,
          task.time,
          task.plannedTime,
          "Assegnazione aggiornata dalla scheda ordine",
          {
            task_name: task.name,
            task_phase: task.phase,
            estimated_hours: Number(String(task.hours || "").replace(/\s*h\s*$/i, "").replace(",", ".")),
            status: task.state,
            article_key: task.articleKey || null,
            article_name: task.articleName || null,
            due_date: validDate(task.dueDate) || validDate(task.time),
            sequence_order: task.sequenceOrder || null,
          }
        );
        } else {
          // A task can have no assignee. Its status still belongs in the database.
          const payload = detailsChanged ? {
            task_name: task.name,
            task_phase: task.phase,
            planned_date: plannedDateTime(task),
            due_date: validDate(task.dueDate) || validDate(task.time),
            estimated_hours: Number(String(task.hours || "").replace(" h", "").replace(",", ".")) || 0,
            article_key: task.articleKey || null,
            article_name: task.articleName || null,
          } : {};
          if (stateChanged) payload.status = persistedStatus(task.state);
          await orderFlowRequest(`/rest/v1/order_tasks?id=eq.${Number(task.id)}&select=id`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify(payload),
          }).then((rows) => { if (!rows?.length) throw new Error("Task non aggiornata nel database"); });
        }
        saved += 1;
      }
      if (saved && typeof orderFlowLoadTasks === "function") await orderFlowLoadTasks(order);
      return saved;
    };

    if (orderId) taskSyncPendingOrders.add(String(orderId));
    const savingTasks = persistAssignments()
      .then((count) => {
        if (draft && orderId && typeof orderFlowLoadTasks === "function") {
          // Reopen from the rows confirmed by the database, not the optimistic
          // values saved in the browser before the request finished.
          draft.tasks = (appData.orderTasks?.[orderId] || [])
            .filter((task) => /^\d+$/.test(String(task.id || "")))
            .map((task, index) => taskSyncDraftFromTask(task, index, orderId))
            .concat(draft.tasks.filter((task) => String(task.id || "").startsWith(TASK_SYNC_LOCAL_PREFIX)));
          orderDetailEditWriteStored(orderId, draft);
        }
        if (!count) return;
        setFlashMessage(`${count} ${count === 1 ? "task aggiornata" : "task aggiornate"} nel database`);
        renderApp();
      })
      .catch((error) => {
        setFlashMessage(`Ordine salvato, ma assegnazione task non riuscita: ${error.message}`);
        renderApp();
      }).finally(() => {
        taskSyncPendingOrders.delete(String(orderId));
      });

    return Promise.resolve(result).then(() => savingTasks);
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
