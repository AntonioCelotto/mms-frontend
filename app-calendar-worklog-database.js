(function () {
  const WORKLOG_DATABASE_API = "/api/calendar-worklog";
  let worklogDatabaseLoaded = false;
  let worklogDatabaseLoading = false;

  function worklogDatabaseNormalize(row) {
    if (!row || typeof row !== "object") return null;
    const taskId = String(row.taskId || row.task_id || "").trim();
    if (!taskId) return null;
    return {
      taskId,
      orderId: row.orderId || row.order_id || "",
      status: row.status || "Da avviare",
      elapsedMs: Number(row.elapsedMs ?? row.elapsed_ms ?? 0) || 0,
      startedAt: row.startedAt || row.started_at || "",
      finishedAt: row.finishedAt || row.finished_at || "",
      pauses: Number(row.pauses || 0) || 0,
      updatedAt: row.updatedAt || row.updated_at || "",
      payload: row.payload && typeof row.payload === "object" ? row.payload : {},
    };
  }

  function worklogDatabaseToLocalMap(rows) {
    return (Array.isArray(rows) ? rows : []).reduce((state, row) => {
      const normalized = worklogDatabaseNormalize(row);
      if (!normalized) return state;
      state[normalized.taskId] = {
        status: normalized.status,
        elapsedMs: normalized.elapsedMs,
        startedAt: normalized.startedAt,
        finishedAt: normalized.finishedAt,
        pauses: normalized.pauses,
        updatedAt: normalized.updatedAt,
      };
      return state;
    }, {});
  }

  function worklogDatabaseTaskMeta(taskId) {
    if (typeof calendarWorklogAllTasks !== "function") return {};
    const row = calendarWorklogAllTasks().find((item) => String(item.taskId) === String(taskId));
    if (!row) return {};
    return {
      orderId: row.orderId,
      payload: {
        taskName: row.task?.name || row.task?.task_name || "",
        phase: row.task?.phase || row.task?.task_phase || "",
        owner: typeof calendarWorklogAssignee === "function" ? calendarWorklogAssignee(row.task) : row.task?.team || "",
      },
    };
  }

  async function worklogDatabaseRequest(method, body) {
    const response = await fetch(WORKLOG_DATABASE_API, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || payload.error || "Registro lavorazioni non disponibile");
    return payload;
  }

  async function worklogDatabaseLoad({ rerender = false } = {}) {
    if (worklogDatabaseLoaded || worklogDatabaseLoading) return;
    worklogDatabaseLoading = true;
    try {
      const payload = await worklogDatabaseRequest("GET");
      const remote = worklogDatabaseToLocalMap(payload.worklogs || []);
      const current = typeof calendarWorklogRead === "function" ? calendarWorklogRead() : {};
      const merged = { ...current, ...remote };
      if (typeof calendarWorklogWrite === "function") calendarWorklogWrite(merged);
      worklogDatabaseLoaded = true;
      if (rerender && document.getElementById("app")?.innerHTML) renderApp();
    } catch (error) {
      console.warn("Registro lavorazioni database non caricato", error);
    } finally {
      worklogDatabaseLoading = false;
    }
  }

  async function worklogDatabaseSave(taskId, session) {
    const normalized = worklogDatabaseNormalize({ taskId, ...(session || {}) });
    if (!normalized) return;
    const meta = worklogDatabaseTaskMeta(taskId);
    try {
      await worklogDatabaseRequest("POST", {
        worklog: {
          taskId: normalized.taskId,
          orderId: meta.orderId || normalized.orderId || null,
          status: normalized.status,
          elapsedMs: normalized.elapsedMs,
          startedAt: normalized.startedAt || null,
          finishedAt: normalized.finishedAt || null,
          pauses: normalized.pauses,
          payload: meta.payload || {},
        },
      });
    } catch (error) {
      console.warn("Lavorazione non sincronizzata su database", error);
      setFlashMessage("Lavorazione aggiornata localmente. Salvataggio database non riuscito, riprova tra poco.");
    }
  }

  const baseCalendarWorklogUpdateDatabase = typeof calendarWorklogUpdate === "function" ? calendarWorklogUpdate : null;
  if (baseCalendarWorklogUpdateDatabase) {
    calendarWorklogUpdate = function calendarWorklogUpdateWithDatabase(taskId, action) {
      baseCalendarWorklogUpdateDatabase(taskId, action);
      const stored = typeof calendarWorklogRead === "function" ? calendarWorklogRead() : {};
      worklogDatabaseSave(taskId, stored[taskId]);
    };
  }

  const baseRefreshBootstrapWorklogDatabase = typeof refreshBootstrap === "function" ? refreshBootstrap : null;
  if (baseRefreshBootstrapWorklogDatabase) {
    refreshBootstrap = async function refreshBootstrapWithWorklogDatabase() {
      await baseRefreshBootstrapWorklogDatabase();
      await worklogDatabaseLoad({ rerender: false });
    };
  }

  window.worklogDatabaseLoad = worklogDatabaseLoad;
  window.worklogDatabaseSave = worklogDatabaseSave;
  worklogDatabaseLoad({ rerender: true });
})();
