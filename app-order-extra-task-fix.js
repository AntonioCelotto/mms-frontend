(function () {

  function isRealId(value) {
    return /^\d+$/.test(String(value || ""));
  }

  function normalizeTasksWithExtras(tasks) {
    const rows = Array.isArray(tasks) ? tasks : [];
    return rows.map((task, index) => ({
      ...task,
      name: task.name || task.task_name || "Nuovo task ordine",
      phase: task.phase || task.task_phase || "altro",
      state: task.state || task.status || "Da avviare",
      sortIndex: index,
    }));
  }

  if (typeof orderCoreTaskNormalizeTasks === "function") {
    orderCoreTaskNormalizeTasks = normalizeTasksWithExtras;
  }

  async function saveTaskToDatabase(orderId, task) {
    const validDate = (value) => /^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(String(value || "")) ? value : null;
    const hours = Number(String(task.hours ?? task.estimated_hours ?? "").replace(/\s*h\s*$/i, "").replace(",", "."));
    if (!Number.isFinite(hours) || hours < 0 || String(task.hours ?? task.estimated_hours ?? "").trim() === "") {
      throw new Error(`Inserisci le ore di lavoro per ${task.name || "la nuova task"}`);
    }
    const response = await fetch("/api/order-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: orderId,
        client_task_key: task.clientTaskKey || String(task.id),
        task_name: task.name || task.task_name || "Nuovo task ordine",
        task_phase: task.phase || task.task_phase || "altro",
        assigned_user_id: String(task.assignedUserId || "").startsWith("external:") ? null : task.assignedUserId || task.assigned_user_id || null,
        external_supplier_name: String(task.assignedUserId || "").startsWith("external:") ? decodeURIComponent(task.assignedUserId.slice(9)) : task.externalSupplierName || task.external_supplier_name || null,
        planned_date: validDate(task.time) ? [String(task.time).slice(0, 10), task.plannedTime].filter(Boolean).join(" ") : validDate(task.planned_date),
        estimated_hours: hours,
        status: task.state || task.status || "Da avviare",
        article_key: task.articleKey || task.article_key || null,
        article_name: task.articleName || task.article_name || null,
        due_date: validDate(task.dueDate) || validDate(task.due_date) || validDate(task.time),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || payload.error || "Task non salvato");
    if (!payload.id) throw new Error("La nuova task non è stata confermata dal database");
    return payload;
  }

  function applyCreatedTask(orderId, draftTask, created) {
    if (!created || !created.id) return;
    const localId = String(draftTask.id);
    const key = draftTask.clientTaskKey || created.client_task_key || localId;
    const identity = { id: created.id, clientTaskKey: key, localOnly: false };
    // Rendering replaces row objects. Match their stable key, never their name
    // (two articles may legitimately have the same phase and label).
    const draft = appState.orderDetailEdits?.[orderId];
    (draft?.tasks || []).forEach((task) => {
      if (String(task.id) === localId || task.clientTaskKey === key) Object.assign(task, identity);
    });
    Object.assign(draftTask, identity);
    if (!appData.orderTasks || typeof appData.orderTasks !== "object") appData.orderTasks = {};
    appData.orderTasks[orderId] = normalizeTasksWithExtras(appData.orderTasks[orderId] || []);
    const rows = appData.orderTasks[orderId];
    const match = rows.find((task) => String(task.id) === localId || task.clientTaskKey === key || String(task.id) === String(created.id));
    const confirmed = typeof taskSyncTaskFromDraft === "function"
      ? taskSyncTaskFromDraft(taskSyncDraftFromTask(created, 0, orderId), 0, orderId)
      : { ...draftTask, ...identity, time: created.planned_date || draftTask.time };
    if (match) Object.assign(match, confirmed, identity);
    else rows.push({ ...confirmed, ...identity });
    appData.orderTasks[orderId] = rows.filter((row, index) => rows.findIndex((other) => String(other.id) === String(row.id)) === index);
    if (draft) draft.tasks = draft.tasks.filter((row, index, all) => all.findIndex((other) => String(other.id) === String(row.id)) === index);
  }

  const activeSaves = new Map();

  function pendingTaskSaveContext() {
    const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
    const orderId = Number(order?.id || appState.selectedOrderId || 0);
    const orderDbId = Number(order?.db_id || order?.internal_id || orderId || 0);
    const draft = typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
    const pending = (draft?.tasks || []).filter((task) =>
      String(task.id || "").startsWith(`local-task-${orderId}-extra-`) ||
      String(task.id || "").startsWith(`local-task-${orderId}-manual-`) ||
      String(task.id || "").startsWith(`local-task-${orderId}-nuovo`));
    pending.forEach((task) => { task.clientTaskKey ||= String(task.id); });
    return { order, orderId, orderDbId, draft, pending };
  }

  function persistPendingTasks() {
    const context = pendingTaskSaveContext();
    const { order, orderId, orderDbId, draft, pending } = context;
    if (activeSaves.has(orderDbId)) return activeSaves.get(orderDbId);
    if (!orderId || !orderDbId || !draft || !pending.length) return Promise.resolve([]);
    const snapshots = pending.map((task) => ({ ...task }));
    if (typeof orderDetailEditWriteStored === "function") orderDetailEditWriteStored(orderId, draft);
    const saving = Promise.resolve().then(() => Promise.all(
      snapshots.map((task) => saveTaskToDatabase(orderDbId, task).then((created) => {
        applyCreatedTask(orderId, task, created);
        return created;
      }))
    ))
      .then((createdTasks) => {
        if (typeof orderDetailEditWriteStored === "function") orderDetailEditWriteStored(orderId, draft);
        const displayNumber = order?.sourceQuoteNumber || order?.source_quote_number || orderId;
        if (typeof setFlashMessage === "function") setFlashMessage(`Task ordine ${displayNumber} salvati`);
        if (typeof renderApp === "function") renderApp();
        if (typeof window.productionPlannerSchedule === "function") window.productionPlannerSchedule();
        return createdTasks;
      })
      .catch((error) => {
        console.error("Salvataggio task ordine non riuscito", error);
        if (typeof setFlashMessage === "function") setFlashMessage(`Task non salvata: ${error.message}`);
        throw error;
      })
      .finally(() => {
        activeSaves.delete(orderDbId);
      });
    activeSaves.set(orderDbId, saving);
    return saving;
  }

  window.orderTaskPersistPending = persistPendingTasks;

  if (typeof orderDetailEditSave === "function") {
    const baseSave = orderDetailEditSave;
    orderDetailEditSave = function orderDetailEditSaveWithExtraTasks() {
      const result = baseSave();
      return Promise.all([result, persistPendingTasks()]).then(([saved]) => saved);
    };
  }

  // Il salvataggio delle task deve funzionare anche quando un altro modulo
  // blocca il salvataggio generale dell'ordine (per esempio un materiale non
  // ancora collegato al Magazzino). Il deduplicatore evita doppi inserimenti.
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-order-detail-save]")) return;
    persistPendingTasks().catch(() => {});
  });

  if (typeof orderDetailEditHandleClick === "function") {
    const baseHandleClick = orderDetailEditHandleClick;
    orderDetailEditHandleClick = function orderDetailEditHandleClickWithTaskDelete(target) {
      const removeButton = target.closest?.("[data-order-detail-remove-task]");
      if (!removeButton) return baseHandleClick(target);

      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const displayOrderId = Number(order?.id || appState.selectedOrderId || 0);
      const orderDbId = Number(order?.db_id || order?.internal_id || displayOrderId || 0);
      const draft = typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
      const taskIndex = Number(removeButton.dataset.orderDetailRemoveTask);
      const task = draft?.tasks?.[taskIndex];
      if (!task || !isRealId(task.id)) return baseHandleClick(target);
      if (!window.confirm(`Eliminare definitivamente la task "${task.name || "Task"}"?`)) return true;

      removeButton.disabled = true;
      Promise.resolve()
        .then(async () => {
          const session = await window.mmsSupabaseAuth?.auth?.getSession?.();
          const token = session?.data?.session?.access_token;
          if (!token) throw new Error("Sessione amministratore non disponibile");
          return fetch("/api/order-task", {
            method: "DELETE",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ task_id: Number(task.id), order_db_id: orderDbId }),
          });
        })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.detail || payload.error || "Task non eliminata");
          draft.tasks.splice(taskIndex, 1);
          if (appData.orderTasks?.[displayOrderId]) {
            appData.orderTasks[displayOrderId] = appData.orderTasks[displayOrderId].filter((row) => String(row.id) !== String(task.id));
          }
          if (typeof orderDetailEditWriteStored === "function") orderDetailEditWriteStored(displayOrderId, draft);
          if (typeof refreshBootstrap === "function") await refreshBootstrap();
          if (typeof setFlashMessage === "function") setFlashMessage("Task eliminata dall'ordine e dal calendario");
          else if (typeof renderApp === "function") renderApp();
        })
        .catch((error) => {
          removeButton.disabled = false;
          if (typeof setFlashMessage === "function") setFlashMessage(`Task non eliminata: ${error.message}`);
        });
      return true;
    };
  }

  const baseRenderAppExtraTaskFix = renderApp;
  renderApp = function renderAppExtraTaskFix() {
    if (appState.currentView === "order-detail") {
      const orderId = Number(appState.selectedOrderId || (typeof getSelectedOrder === "function" ? getSelectedOrder()?.id : 0));
      if (orderId && appData.orderTasks?.[orderId]) appData.orderTasks[orderId] = normalizeTasksWithExtras(appData.orderTasks[orderId]);
      const draft = appState.orderDetailEdits?.[orderId];
      if (draft && Array.isArray(draft.tasks)) draft.tasks = normalizeTasksWithExtras(draft.tasks);
    }
    baseRenderAppExtraTaskFix();
  };

  if (document.getElementById("app")?.innerHTML) renderApp();
})();
