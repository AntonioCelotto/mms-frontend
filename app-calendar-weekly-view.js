(function () {
  const WEEK_DAYS = ["Lunedi'", "Martedi'", "Mercoledi'", "Giovedi'", "Venerdi'", "Sabato", "Domenica"];
  const OWNER_COLORS = ["#e50c39", "#0f766e", "#7c3aed", "#b45309", "#2563eb", "#be123c", "#047857", "#9333ea", "#a16207"];

  function calendarWeeklyEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function calendarWeeklyEnsureFilters() {
    if (!appState.calendarFilters || typeof appState.calendarFilters !== "object") {
      appState.calendarFilters = { employee: "all", phase: "all" };
    }
    if (!("orderQuery" in appState.calendarFilters)) appState.calendarFilters.orderQuery = "";
  }

  function calendarWeeklyDayKey(day) {
    const normalized = String(day || "")
      .toLowerCase()
      .replace(/[ìí]/g, "i")
      .replace(/[àá]/g, "a")
      .replace(/[èé]/g, "e")
      .replace(/[òó]/g, "o")
      .replace(/[ùú]/g, "u");
    if (normalized.startsWith("lun")) return "Lunedi'";
    if (normalized.startsWith("mar")) return "Martedi'";
    if (normalized.startsWith("mer")) return "Mercoledi'";
    if (normalized.startsWith("gio")) return "Giovedi'";
    if (normalized.startsWith("ven")) return "Venerdi'";
    if (normalized.startsWith("sab")) return "Sabato";
    if (normalized.startsWith("dom")) return "Domenica";
    return "Da pianificare";
  }

  function calendarWeeklyOwner(slot) {
    return slot.owner || slot.externalSupplierName || slot.external_supplier_name || "Non assegnato";
  }

  function calendarWeeklyOrder(slot) {
    return (appData.orders || []).find((order) => Number(order.id) === Number(slot.orderId)) || null;
  }

  function calendarWeeklyColor(owner) {
    const key = String(owner || "Non assegnato");
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) hash = (hash + key.charCodeAt(index) * (index + 1)) % OWNER_COLORS.length;
    return OWNER_COLORS[hash];
  }

  function calendarWeeklyAllSlots() {
    if (typeof calendarOrderSyncEnsureOrderTasks === "function") calendarOrderSyncEnsureOrderTasks();
    if (typeof calendarOrderSyncBuildCalendarFromTasks === "function") calendarOrderSyncBuildCalendarFromTasks();
    return (appData.calendar || []).flatMap((day) =>
      (Array.isArray(day.slots) ? day.slots : []).map((slot) => ({
        ...slot,
        day: calendarWeeklyDayKey(slot.day || day.day),
        date: slot.date || day.date || "",
        owner: calendarWeeklyOwner(slot),
      }))
    );
  }

  function calendarWeeklyMatches(slot) {
    calendarWeeklyEnsureFilters();
    const employee = appState.calendarFilters.employee || "all";
    const phase = appState.calendarFilters.phase || "all";
    const query = String(appState.calendarFilters.orderQuery || "").trim().toLowerCase();
    const order = calendarWeeklyOrder(slot);
    const haystack = [
      slot.orderId,
      slot.title,
      slot.phase,
      slot.owner,
      order?.client,
      order?.category,
      order?.status,
    ]
      .join(" ")
      .toLowerCase();
    const byEmployee = employee === "all" || slot.owner === employee;
    const byPhase = phase === "all" || String(slot.phase || "").toLowerCase() === String(phase).toLowerCase();
    const byQuery = !query || haystack.includes(query);
    return byEmployee && byPhase && byQuery;
  }

  function calendarWeeklyGroupedSlots() {
    const grouped = new Map(WEEK_DAYS.map((day) => [day, []]));
    calendarWeeklyAllSlots()
      .filter(calendarWeeklyMatches)
      .forEach((slot) => {
        const day = grouped.has(slot.day) ? slot.day : "Lunedi'";
        grouped.get(day).push(slot);
      });
    grouped.forEach((slots) => slots.sort((a, b) => String(a.time || "").localeCompare(String(b.time || ""))));
    return grouped;
  }

  function calendarWeeklyEmployeeOptions() {
    const employees = typeof getCalendarEmployees === "function" ? getCalendarEmployees() : ["all"];
    return employees.filter(Boolean);
  }

  function calendarWeeklyPhaseOptions() {
    const phases = typeof getCalendarPhases === "function" ? getCalendarPhases() : ["all"];
    return phases.filter(Boolean);
  }

  function calendarWeeklyTaskRows() {
    const tasks = appData.orderTasks?.[appState.selectedOrderId] || appData.orderTasks?.[String(appState.selectedOrderId)] || [];
    return Array.isArray(tasks) ? tasks : [];
  }

  function calendarWeeklyAssignmentPanel() {
    const tasks = calendarWeeklyTaskRows();
    const employeeOptions = (appData.accounts || [])
      .filter((account) => account.role === "Amministratore" || account.role === "Visualizzatore")
      .map((account) => ({ id: account.id, label: account.name }));
    return `
      <div class="surface calendar-assignment-panel">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Assegna lavorazione</h3>
              <p>Collega un task dell'ordine selezionato a persona, data e ora.</p>
            </div>
            <button class="action-pill" data-action="save-assignment" type="button">${appState.busy ? "Salvataggio..." : "Salva assegnazione"}</button>
          </div>
          <div class="calendar-assignment-grid">
            <div class="field">
              <label>Task ordine #${calendarWeeklyEscape(appState.selectedOrderId)}</label>
              <select class="filter-chip" data-assignment-field="taskId">
                <option value="">Seleziona task</option>
                ${tasks
                  .map(
                    (task, index) =>
                      `<option value="${calendarWeeklyEscape(task.id || index)}" ${
                        String(appState.assignmentDraft.taskId) === String(task.id || index) ? "selected" : ""
                      }>${calendarWeeklyEscape(task.name || task.task_name || "Task ordine")}</option>`
                  )
                  .join("")}
              </select>
            </div>
            <div class="field">
              <label>Dipendente</label>
              <select class="filter-chip" data-assignment-field="assignedUserId">
                <option value="">Seleziona dipendente</option>
                ${employeeOptions
                  .map(
                    (employee) =>
                      `<option value="${calendarWeeklyEscape(employee.id)}" ${
                        String(appState.assignmentDraft.assignedUserId) === String(employee.id) ? "selected" : ""
                      }>${calendarWeeklyEscape(employee.label)}</option>`
                  )
                  .join("")}
              </select>
            </div>
            <div class="field">
              <label>Data</label>
              <input class="field-value" type="date" data-assignment-field="plannedDate" value="${calendarWeeklyEscape(
                appState.assignmentDraft.plannedDate || ""
              )}" />
            </div>
            <div class="field">
              <label>Ora</label>
              <input class="field-value" type="time" data-assignment-field="plannedTime" value="${calendarWeeklyEscape(
                appState.assignmentDraft.plannedTime || ""
              )}" />
            </div>
            <div class="field">
              <label>Giorno</label>
              <select class="filter-chip" data-assignment-field="calendarDay">
                ${WEEK_DAYS.map(
                  (day) => `<option value="${day}" ${appState.assignmentDraft.calendarDay === day ? "selected" : ""}>${day}</option>`
                ).join("")}
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function calendarWeeklyFilters() {
    const employees = calendarWeeklyEmployeeOptions();
    const phases = calendarWeeklyPhaseOptions();
    return `
      <div class="surface">
        <div class="surface-inner">
          <div class="calendar-filter-grid">
            <input class="filter-chip" data-calendar-search="orderQuery" value="${calendarWeeklyEscape(
              appState.calendarFilters.orderQuery || ""
            )}" placeholder="Cerca ordine, cliente, dipendente o lavorazione" />
            <select class="filter-chip" data-calendar-filter="employee">
              ${employees
                .map(
                  (employee) =>
                    `<option value="${calendarWeeklyEscape(employee)}" ${
                      appState.calendarFilters.employee === employee ? "selected" : ""
                    }>${employee === "all" ? "Tutti i dipendenti" : calendarWeeklyEscape(employee)}</option>`
                )
                .join("")}
            </select>
            <select class="filter-chip" data-calendar-filter="phase">
              ${phases
                .map(
                  (phase) =>
                    `<option value="${calendarWeeklyEscape(phase)}" ${
                      appState.calendarFilters.phase === phase ? "selected" : ""
                    }>${phase === "all" ? "Tutte le lavorazioni" : calendarWeeklyEscape(phase)}</option>`
                )
                .join("")}
            </select>
            <div class="filter-chip">Ordine selezionato: #${calendarWeeklyEscape(appState.selectedOrderId)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function calendarWeeklyBoard() {
    const grouped = calendarWeeklyGroupedSlots();
    return `
      <div class="surface calendar-weekly-surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Planning generale ordini</h3>
              <p>Settimana operativa da lunedi' a domenica, filtrabile per ordine, dipendente e lavorazione.</p>
            </div>
            <div class="ghost-pill">${calendarWeeklyAllSlots().filter(calendarWeeklyMatches).length} task visibili</div>
          </div>
          <div class="calendar-week-board">
            ${WEEK_DAYS.map((day) => {
              const slots = grouped.get(day) || [];
              return `
                <div class="calendar-week-day">
                  <div class="calendar-day-head">
                    <h4>${day}</h4>
                    <span>${slots.length} task</span>
                  </div>
                  <div class="calendar-day-slots">
                    ${
                      slots.length
                        ? slots
                            .map((slot) => {
                              const order = calendarWeeklyOrder(slot);
                              const color = calendarWeeklyColor(slot.owner);
                              return `
                                <button class="calendar-event" data-detail="${calendarWeeklyEscape(slot.orderId)}" style="--owner-color:${color}" type="button">
                                  <span class="calendar-event-time">${calendarWeeklyEscape(slot.time || "Da pianificare")}</span>
                                  <strong>#${calendarWeeklyEscape(slot.orderId)} - ${calendarWeeklyEscape(slot.title || slot.phase || "Task")}</strong>
                                  <span>${calendarWeeklyEscape(order?.client || "Cliente")} · ${calendarWeeklyEscape(slot.phase || "Lavorazione")}</span>
                                  <small>${calendarWeeklyEscape(slot.owner || "Non assegnato")}</small>
                                </button>
                              `;
                            })
                            .join("")
                        : `<div class="calendar-empty">Nessun task</div>`
                    }
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function calendarWeeklySelectedTasks() {
    const tasks = calendarWeeklyTaskRows();
    return `
      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Task dell'ordine #${calendarWeeklyEscape(appState.selectedOrderId)}</h3>
              <p>Elenco operativo dell'ordine selezionato.</p>
            </div>
            <button class="mini-btn" data-open="order-detail" type="button">Scheda ordine</button>
          </div>
          <div class="calendar-task-list">
            ${
              tasks.length
                ? tasks
                    .map((task) => {
                      const owner = String(task.team || "").includes(" - ") ? String(task.team).split(" - ").pop() : task.team || "Non assegnato";
                      return `
                        <div class="calendar-task-row">
                          <div>
                            <strong>${calendarWeeklyEscape(task.name || task.task_name || "Task ordine")}</strong>
                            <span>${calendarWeeklyEscape(task.phase || task.task_phase || "Lavorazione")}</span>
                          </div>
                          <div>${calendarWeeklyEscape(owner || "Non assegnato")}</div>
                          <div>${calendarWeeklyEscape(task.time || task.planned_date || "Da pianificare")}</div>
                          <div><span class="table-status ${getStatusClass(task.state || task.status || "Da avviare")}">${calendarWeeklyEscape(
                        task.state || task.status || "Da avviare"
                      )}</span></div>
                        </div>
                      `;
                    })
                    .join("")
                : `<div class="empty-state">Nessun task collegato a questo ordine.</div>`
            }
          </div>
        </div>
      </div>
    `;
  }

  function calendarWeeklyRender() {
    calendarWeeklyEnsureFilters();
    const worklog = typeof calendarWorklogPanel === "function" ? calendarWorklogPanel() : "";
    return `
      <section class="view ${appState.currentView === "calendar" ? "active" : ""}">
        <div class="screen-header">
          <div>
            <h2>Calendario operativo</h2>
            <p>Planning generale degli ordini con filtri rapidi e colori per dipendente.</p>
          </div>
          <div class="screen-actions">
            <div class="ghost-pill">Vista: lunedi' - domenica</div>
          </div>
        </div>
        ${calendarWeeklyFilters()}
        ${calendarWeeklyAssignmentPanel()}
        <div class="calendar-main-grid">
          <div>
            ${calendarWeeklyBoard()}
          </div>
          <div class="calendar-side-stack">
            ${calendarWeeklySelectedTasks()}
          </div>
        </div>
        ${worklog}
      </section>
    `;
  }

  function calendarWeeklyEnsureStyles() {
    if (document.getElementById("calendar-weekly-view-styles")) return;
    const style = document.createElement("style");
    style.id = "calendar-weekly-view-styles";
    style.textContent = `
      .calendar-filter-grid{display:grid;grid-template-columns:minmax(260px,1.5fr) minmax(180px,.8fr) minmax(180px,.8fr) minmax(190px,.7fr);gap:12px}
      .calendar-assignment-grid{display:grid;grid-template-columns:minmax(220px,1.35fr) minmax(190px,1fr) minmax(150px,.75fr) minmax(120px,.6fr) minmax(150px,.7fr);gap:12px;align-items:end}
      .calendar-main-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(340px,.72fr);gap:16px}
      .calendar-side-stack{display:grid;gap:16px;align-content:start}
      .calendar-week-board{display:grid;grid-template-columns:repeat(7,minmax(132px,1fr));gap:10px;overflow-x:auto;padding-bottom:4px}
      .calendar-week-day{min-height:410px;background:rgba(255,255,255,.62);border:1px solid var(--line);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:10px}
      .calendar-day-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;border-bottom:1px solid var(--line);padding-bottom:9px;min-height:48px}
      .calendar-day-head h4{margin:0;font-size:14px}
      .calendar-day-head span{color:var(--muted);font-size:12px;white-space:nowrap}
      .calendar-day-slots{display:grid;gap:8px;align-content:start}
      .calendar-event{width:100%;text-align:left;border:1px solid rgba(30,45,41,.09);border-left:4px solid var(--owner-color);background:var(--panel);border-radius:8px;padding:10px;display:grid;gap:4px;transition:transform 160ms ease,box-shadow 160ms ease}
      .calendar-event:hover{transform:translateY(-1px);box-shadow:var(--shadow-soft)}
      .calendar-event strong,.calendar-event span,.calendar-event small{display:block}
      .calendar-event strong{font-size:12px;line-height:1.25}
      .calendar-event span,.calendar-event small{font-size:11px;color:var(--muted);line-height:1.35}
      .calendar-event-time{font-weight:700;color:var(--text)!important}
      .calendar-empty{border:1px dashed rgba(30,45,41,.18);border-radius:8px;color:var(--muted);font-size:12px;text-align:center;padding:16px 8px}
      .calendar-task-list{display:grid;gap:8px}
      .calendar-task-row{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(90px,.75fr) minmax(95px,.75fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);font-size:12px}
      .calendar-task-row:last-child{border-bottom:0}
      .calendar-task-row strong,.calendar-task-row span{display:block}
      .calendar-task-row span{color:var(--muted);margin-top:3px}
      section.view.active button[data-calendar-task-finish],
      section.view.active .calendar-task-finish,
      section.view.active [data-action='finish-task'],
      section.view.active [data-next-status='completato']{display:none!important}
      @media(max-width:1500px){.calendar-main-grid{grid-template-columns:1fr}.calendar-week-board{grid-template-columns:repeat(7,minmax(150px,1fr))}}
      @media(max-width:980px){.calendar-filter-grid,.calendar-assignment-grid{grid-template-columns:1fr}.calendar-week-day{min-height:260px}}
    `;
    document.head.appendChild(style);
  }

  const baseRenderCalendarWeekly = typeof renderCalendar === "function" ? renderCalendar : null;
  if (baseRenderCalendarWeekly) {
    renderCalendar = function renderCalendarWeeklyView() {
      return calendarWeeklyRender();
    };
  }

  const baseRenderAppCalendarWeekly = renderApp;
  renderApp = function renderAppCalendarWeeklyView() {
    calendarWeeklyEnsureStyles();
    baseRenderAppCalendarWeekly();
  };

  const baseSaveTaskAssignmentCalendarWeekly = typeof saveTaskAssignment === "function" ? saveTaskAssignment : null;
  if (baseSaveTaskAssignmentCalendarWeekly) {
    saveTaskAssignment = async function saveTaskAssignmentCalendarWeeklyView() {
      const originalDate = appState.assignmentDraft.plannedDate;
      const plannedTime = String(appState.assignmentDraft.plannedTime || "").trim();
      if (originalDate && plannedTime && !String(originalDate).includes(plannedTime)) {
        appState.assignmentDraft.plannedDate = `${originalDate} ${plannedTime}`;
      }
      try {
        await baseSaveTaskAssignmentCalendarWeekly();
      } finally {
        if (originalDate) appState.assignmentDraft.plannedDate = originalDate;
      }
    };
  }

  document.addEventListener("input", (event) => {
    const input = event.target.closest?.("[data-calendar-search]");
    if (!input) return;
    calendarWeeklyEnsureFilters();
    const cursor = input.selectionStart || input.value.length;
    appState.calendarFilters[input.dataset.calendarSearch] = input.value;
    renderApp();
    window.requestAnimationFrame(() => {
      const nextInput = document.querySelector(`[data-calendar-search='${input.dataset.calendarSearch}']`);
      if (!nextInput) return;
      nextInput.focus();
      nextInput.setSelectionRange?.(cursor, cursor);
    });
  });

  document.addEventListener("change", (event) => {
    const input = event.target.closest?.("[data-assignment-field='plannedTime']");
    if (!input) return;
    appState.assignmentDraft.plannedTime = input.value;
  });

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest?.("button");
      if (!button || appState.currentView !== "calendar") return;
      if (button.classList.contains("calendar-event") && button.dataset.detail) {
        event.preventDefault();
        navigate("order-detail", Number(button.dataset.detail));
        return;
      }
      const label = button.textContent.trim().toLowerCase();
      if (label === "segna finito" || label === "finito") {
        event.preventDefault();
        event.stopImmediatePropagation();
        button.remove();
      }
    },
    true
  );

  if (document.getElementById("app")?.innerHTML) renderApp();
})();
