(function () {
  const WEEK_DAYS = ["Lunedi'", "Martedi'", "Mercoledi'", "Giovedi'", "Venerdi'", "Sabato", "Domenica"];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function accountName(account) {
    return account.name || [account.first_name, account.last_name].filter(Boolean).join(" ") || account.email || `Account #${account.id}`;
  }

  function dayFromDate(value) {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "Lunedi'";
    return WEEK_DAYS[(date.getDay() + 6) % 7] || "Lunedi'";
  }

  function findTask(taskId, orderId) {
    const wantedTaskId = String(taskId || "");
    const wantedOrderId = String(orderId || "");
    const scoped = appData.orderTasks?.[wantedOrderId] || appData.orderTasks?.[Number(wantedOrderId)] || [];
    return (
      (Array.isArray(scoped) ? scoped : []).find((task) => String(task.id || "") === wantedTaskId) ||
      Object.values(appData.orderTasks || {})
        .flatMap((tasks) => (Array.isArray(tasks) ? tasks : []))
        .find((task) => String(task.id || "") === wantedTaskId) ||
      null
    );
  }

  function allCalendarSlots() {
    if (typeof calendarOrderSyncEnsureOrderTasks === "function") calendarOrderSyncEnsureOrderTasks();
    if (typeof calendarOrderSyncBuildCalendarFromTasks === "function") calendarOrderSyncBuildCalendarFromTasks();
    return (appData.calendar || []).flatMap((day) =>
      (Array.isArray(day.slots) ? day.slots : []).map((slot) => ({
        ...slot,
        orderId: slot.orderId,
        taskId: slot.taskId || slot.id || "",
        day: slot.day || day.day || "Lunedi'",
      }))
    );
  }

  function slotFromCard(card, taskId) {
    const orderId = String(card?.dataset.detail || "");
    return allCalendarSlots().find((slot) => String(slot.taskId || "") === String(taskId || "") && String(slot.orderId || "") === orderId) || null;
  }

  function assigneeId(task, owner) {
    if (task?.assignedUserId || task?.assigned_user_id) return String(task.assignedUserId || task.assigned_user_id);
    const ownerName = String(owner || "").trim().toLowerCase();
    const account = (appData.accounts || []).find((item) => accountName(item).trim().toLowerCase() === ownerName);
    return account?.id ? String(account.id) : "";
  }

  function planDate(task, slot) {
    const raw = String(task?.planned_date || task?.time || slot?.isoDate || "").trim();
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
    return {
      date: match?.[1] || slot?.isoDate || "",
      time: match?.[2] || (/^\d{2}:\d{2}/.test(String(slot?.time || "")) ? String(slot.time).slice(0, 5) : ""),
    };
  }

  function openPlan(slot) {
    const taskId = slot?.taskId || "";
    if (!/^\d+$/.test(String(taskId))) {
      setFlashMessage("Questa lavorazione non ha ancora un task salvato su database. Apri l'ordine per completarla.");
      return;
    }
    const task = findTask(taskId, slot.orderId);
    const planned = planDate(task, slot);
    appState.calendarQuickPlan = {
      taskId: String(taskId),
      orderId: String(slot.orderId || ""),
      title: slot.title || task?.name || task?.task_name || "Task ordine",
      phase: slot.phase || task?.phase || task?.task_phase || "Lavorazione",
      assignedUserId: assigneeId(task, slot.owner),
      plannedDate: planned.date,
      plannedTime: planned.time,
      calendarDay: task?.calendarDay || task?.calendar_day_label || slot.day || dayFromDate(planned.date),
    };
    renderApp();
  }

  function planModal() {
    const plan = appState.calendarQuickPlan;
    if (!plan || appState.currentView !== "calendar") return "";
    const accounts = (appData.accounts || []).filter((account) => account.id);
    return `
      <div class="calendar-plan-overlay" role="dialog" aria-modal="true">
        <div class="calendar-plan-modal">
          <div class="section-title">
            <div>
              <h3>Pianifica lavorazione</h3>
              <p>Ordine #${escapeHtml(plan.orderId)} - ${escapeHtml(plan.phase)}</p>
            </div>
            <button class="mini-btn" data-calendar-plan-close type="button">Chiudi</button>
          </div>
          <div class="calendar-plan-grid">
            <div class="field">
              <label>Task</label>
              <div class="field-value">${escapeHtml(plan.title)}</div>
            </div>
            <div class="field">
              <label>Dipendente</label>
              <select class="filter-chip" data-calendar-plan-field="assignedUserId">
                <option value="">Seleziona dipendente</option>
                ${accounts
                  .map(
                    (account) =>
                      `<option value="${escapeHtml(account.id)}" ${
                        String(plan.assignedUserId) === String(account.id) ? "selected" : ""
                      }>${escapeHtml(accountName(account))}</option>`
                  )
                  .join("")}
              </select>
            </div>
            <div class="field">
              <label>Data</label>
              <input class="field-value" type="date" data-calendar-plan-field="plannedDate" value="${escapeHtml(plan.plannedDate || "")}" />
            </div>
            <div class="field">
              <label>Ora</label>
              <input class="field-value" type="time" data-calendar-plan-field="plannedTime" value="${escapeHtml(plan.plannedTime || "")}" />
            </div>
            <div class="field">
              <label>Giorno</label>
              <select class="filter-chip" data-calendar-plan-field="calendarDay">
                ${WEEK_DAYS.map((day) => `<option value="${day}" ${plan.calendarDay === day ? "selected" : ""}>${day}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="calendar-plan-actions">
            <button class="mini-btn" data-calendar-plan-close type="button">Annulla</button>
            <button class="action-pill" data-calendar-plan-save type="button">${appState.busy ? "Salvataggio..." : "Salva pianificazione"}</button>
          </div>
        </div>
      </div>
    `;
  }

  function ensureStyles() {
    if (document.getElementById("calendar-quick-plan-styles")) return;
    const style = document.createElement("style");
    style.id = "calendar-quick-plan-styles";
    style.textContent = `
      .calendar-plan-overlay{position:fixed;inset:0;z-index:60;background:rgba(17,24,39,.32);display:grid;place-items:center;padding:22px}
      .calendar-plan-modal{width:min(760px,100%);background:var(--panel);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow-soft);padding:18px}
      .calendar-plan-grid{display:grid;grid-template-columns:minmax(180px,1fr) minmax(180px,1fr);gap:12px}
      .calendar-plan-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
      @media(max-width:980px){.calendar-plan-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function injectPlanButtons() {
    if (appState.currentView !== "calendar") return;
    document.querySelectorAll(".calendar-event").forEach((card) => {
      const actions = card.querySelector(".calendar-event-actions");
      if (!actions || actions.querySelector("[data-calendar-plan-task]")) return;
      const worklogButton = actions.querySelector("[data-weekly-worklog-task]");
      const taskId = worklogButton?.dataset.weeklyWorklogTask || "";
      const button = document.createElement("button");
      button.className = "mini-btn";
      button.type = "button";
      button.dataset.calendarPlanTask = taskId;
      button.textContent = "Pianifica";
      actions.insertBefore(button, worklogButton || actions.firstChild);
    });
  }

  function injectModal() {
    if (document.querySelector(".calendar-plan-overlay")) return;
    const activeView = document.querySelector("section.view.active");
    if (!activeView) return;
    activeView.insertAdjacentHTML("beforeend", planModal());
  }

  async function savePlan() {
    const plan = appState.calendarQuickPlan;
    if (!plan || appState.busy) return;
    if (!plan.taskId || !plan.assignedUserId) {
      setFlashMessage("Seleziona un dipendente per pianificare la lavorazione");
      return;
    }
    const plannedDate = [plan.plannedDate, plan.plannedTime].filter(Boolean).join(" ") || null;
    appState.busy = true;
    renderApp();
    try {
      const response = await fetch("/api/assign-task", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: Number(plan.taskId),
          assigned_user_id: Number(plan.assignedUserId),
          planned_date: plannedDate,
          calendar_day_label: plan.calendarDay || null,
          notes: "Pianificazione aggiornata dal calendario",
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Pianificazione non riuscita");
      }
      await refreshBootstrap();
      appState.calendarQuickPlan = null;
      setFlashMessage("Pianificazione calendario salvata");
    } catch (error) {
      setFlashMessage(error.message || "Errore durante la pianificazione");
    } finally {
      appState.busy = false;
      renderApp();
    }
  }

  const baseRenderAppQuickPlan = renderApp;
  renderApp = function renderAppCalendarQuickPlan() {
    baseRenderAppQuickPlan();
    ensureStyles();
    injectPlanButtons();
    injectModal();
  };

  document.addEventListener(
    "click",
    (event) => {
      if (appState.currentView !== "calendar") return;
      const planButton = event.target.closest?.("[data-calendar-plan-task]");
      if (planButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const slot = slotFromCard(planButton.closest(".calendar-event"), planButton.dataset.calendarPlanTask);
        if (!slot) {
          setFlashMessage("Lavorazione non trovata nel calendario");
          return;
        }
        openPlan(slot);
        return;
      }
      const closeButton = event.target.closest?.("[data-calendar-plan-close]");
      if (closeButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        appState.calendarQuickPlan = null;
        renderApp();
        return;
      }
      const saveButton = event.target.closest?.("[data-calendar-plan-save]");
      if (saveButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        savePlan();
      }
    },
    true
  );

  document.addEventListener("input", (event) => {
    const input = event.target.closest?.("[data-calendar-plan-field]");
    if (!input || !appState.calendarQuickPlan) return;
    appState.calendarQuickPlan[input.dataset.calendarPlanField] = input.value;
    if (input.dataset.calendarPlanField === "plannedDate" && input.value) {
      appState.calendarQuickPlan.calendarDay = dayFromDate(input.value);
      renderApp();
    }
  });

  document.addEventListener("change", (event) => {
    const input = event.target.closest?.("[data-calendar-plan-field]");
    if (!input || !appState.calendarQuickPlan) return;
    appState.calendarQuickPlan[input.dataset.calendarPlanField] = input.value;
    if (input.dataset.calendarPlanField === "plannedDate" && input.value) {
      appState.calendarQuickPlan.calendarDay = dayFromDate(input.value);
      renderApp();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !appState.calendarQuickPlan) return;
    appState.calendarQuickPlan = null;
    renderApp();
  });

  if (document.getElementById("app")?.innerHTML) renderApp();
})();