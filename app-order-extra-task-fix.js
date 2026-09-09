(function () {
  const CORE_PHASES = [
    { phase: "cartamodello", label: "Cartamodello" },
    { phase: "taglio", label: "Taglio" },
    { phase: "confezione", label: "Confezione" },
  ];

  function key(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw.includes("cartamodello")) return "cartamodello";
    if (raw.includes("taglio")) return "taglio";
    if (raw.includes("confezione")) return "confezione";
    return "";
  }

  function isRealId(value) {
    return /^\d+$/.test(String(value || ""));
  }

  function normalizeTasksWithExtras(tasks) {
    const rows = Array.isArray(tasks) ? tasks : [];
    const used = new Set();
    const coreRows = CORE_PHASES.map((core, index) => {
      const existingIndex = rows.findIndex((task) => key(task.phase || task.task_phase || task.name || task.task_name) === core.phase);
      if (existingIndex >= 0) {
        used.add(existingIndex);
        const existing = rows[existingIndex];
        return {
          ...existing,
          phase: existing.phase || existing.task_phase || core.phase,
          name: existing.name || existing.task_name || `${core.label} ordine`,
        };
      }
      return {
        id: "",
        name: `${core.label} ordine`,
        phase: core.phase,
        team: "Da assegnare",
        hours: "0,0 h",
        time: "Da pianificare",
        state: "Da avviare",
        localOnly: true,
        sortIndex: index,
      };
    });

    const extraRows = rows
      .filter((task, index) => !used.has(index) && !key(task.phase || task.task_phase || task.name || task.task_name))
      .map((task, index) => ({
        ...task,
        name: task.name || task.task_name || "Nuovo task ordine",
        phase: task.phase || task.task_phase || "altro",
        state: task.state || task.status || "Da avviare",
        sortIndex: 100 + index,
      }));

    return [...coreRows, ...extraRows];
  }

  if (typeof orderCoreTaskNormalizeTasks === "function") {
    orderCoreTaskNormalizeTasks = normalizeTasksWithExtras;
  }

  async function saveTaskToDatabase(orderId, task) {
    const response = await fetch("/api/order-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: orderId,
        task_name: task.name || task.task_name || "Nuovo task ordine",
        task_phase: task.phase || task.task_phase || "altro",
        assigned_user_id: task.assignedUserId || task.assigned_user_id || null,
        external_supplier_name: task.externalSupplierName || task.external_supplier_name || null,
        planned_date: task.time || task.planned_date || null,
        estimated_hours: task.hours || task.estimated_hours || null,
        status: task.state || task.status || "Da avviare",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || payload.error || "Task non salvato");
    return payload;
  }

  function applyCreatedTask(orderId, draftTask, created) {
    if (!created || !created.id) return;
    draftTask.id = created.id;
    draftTask.localOnly = false;
    draftTask.name = created.task_name || draftTask.name;
    draftTask.phase = created.task_phase || draftTask.phase;
    draftTask.time = created.planned_date || draftTask.time || "";
    draftTask.hours = created.estimated_hours ?? draftTask.hours;
    draftTask.state = String(created.status || draftTask.state || "da_avviare").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    if (!appData.orderTasks || typeof appData.orderTasks !== "object") appData.orderTasks = {};
    appData.orderTasks[orderId] = normalizeTasksWithExtras(appData.orderTasks[orderId] || []);
    const match = appData.orderTasks[orderId].find((task) => !isRealId(task.id) && (task.name || "") === (draftTask.name || ""));
    if (match) Object.assign(match, draftTask, { id: created.id, localOnly: false });
  }

  if (typeof orderDetailEditSave === "function") {
    const baseSave = orderDetailEditSave;
    orderDetailEditSave = function orderDetailEditSaveWithExtraTasks() {
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const orderId = Number(order?.id || appState.selectedOrderId || 0);
      const orderDbId = Number(order?.db_id || order?.internal_id || orderId || 0);
      const draft = typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
      const pending = (draft?.tasks || []).filter((task) => !isRealId(task.id));

      baseSave();

      if (!orderId || !orderDbId || !pending.length) return;
      Promise.all(pending.map((task) => saveTaskToDatabase(orderDbId, task).then((created) => applyCreatedTask(orderId, task, created))))
        .then(() => {
          if (typeof orderDetailEditWriteStored === "function") orderDetailEditWriteStored(orderId, draft);
          const displayNumber = order?.sourceQuoteNumber || order?.source_quote_number || orderId;
          if (typeof setFlashMessage === "function") setFlashMessage(`Task ordine ${displayNumber} salvati`);
          if (typeof renderApp === "function") renderApp();
        })
        .catch((error) => {
          console.error("Salvataggio task ordine non riuscito", error);
          if (typeof setFlashMessage === "function") setFlashMessage(`Ordine salvato, ma una task non e' stata salvata: ${error.message}`);
        });
    };
  }

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
