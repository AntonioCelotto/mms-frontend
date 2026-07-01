(function () {
  const DAYS = ["Lunedi'", "Martedi'", "Mercoledi'", "Giovedi'", "Venerdi'", "Sabato", "Domenica"];

  function text(value) {
    return String(value ?? "").trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function parseDate(value) {
    const match = text(value).match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
    if (!match) return null;
    const date = new Date(`${match[1]}T12:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return { date, iso: match[1], time: match[2] || "Orario da definire" };
  }

  function mondayFor(date) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    const day = copy.getDay();
    const diff = (day + 6) % 7;
    copy.setDate(copy.getDate() - diff);
    return copy;
  }

  function addDays(date, days) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function currentWeekStart() {
    if (appState.calendarWeekStart) {
      const parsed = parseDate(appState.calendarWeekStart);
      if (parsed) return mondayFor(parsed.date);
    }
    const today = new Date();
    return mondayFor(today);
  }

  function weekDates() {
    const start = currentWeekStart();
    return DAYS.map((day, index) => {
      const date = addDays(start, index);
      return {
        day,
        date,
        iso: isoDate(date),
        label: date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" }),
      };
    });
  }

  function weekTitle(dates) {
    const start = dates[0].date;
    const end = dates[6].date;
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const startLabel = start.toLocaleDateString("it-IT", sameMonth ? { day: "2-digit" } : { day: "2-digit", month: "short" });
    const endLabel = end.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
    return `${startLabel} - ${endLabel}`;
  }

  function accountName(account) {
    return account?.name || [account?.first_name, account?.last_name].filter(Boolean).join(" ") || account?.email || "";
  }

  function taskOwner(task) {
    const assigned = task.assignedUserId || task.assigned_user_id;
    if (assigned) {
      const account = (appData.accounts || []).find((item) => String(item.id) === String(assigned));
      const name = accountName(account);
      if (name) return name;
    }
    const team = text(task.team);
    if (team.includes(" - ")) return team.split(" - ").pop().trim();
    return task.owner || task.externalSupplierName || task.external_supplier_name || team || "Non assegnato";
  }

  function taskId(orderId, task, index) {
    if (task.id) return String(task.id);
    const phase = text(task.phase || task.task_phase || task.name || task.task_name || "task")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `calendar-task-${orderId}-${phase || index + 1}`;
  }

  function taskDate(task) {
    return parseDate(task.time || task.planned_date || "");
  }

  function taskDay(task, parsed) {
    if (parsed) {
      const index = (parsed.date.getDay() + 6) % 7;
      return DAYS[index] || "Lunedi'";
    }
    const raw = text(task.calendarDay || task.calendar_day_label);
    return DAYS.find((day) => day.toLowerCase() === raw.toLowerCase()) || "Lunedi'";
  }

  function taskRows() {
    if (typeof calendarOrderSyncEnsureOrderTasks === "function") calendarOrderSyncEnsureOrderTasks();
    return Object.entries(appData.orderTasks || {}).flatMap(([orderId, tasks]) =>
      (Array.isArray(tasks) ? tasks : []).map((task, index) => {
        const parsed = taskDate(task);
        const order = (appData.orders || []).find((item) => Number(item.id) === Number(orderId)) || {};
        const owner = taskOwner(task);
        return {
          orderId,
          taskId: taskId(orderId, task, index),
          title: task.name || task.task_name || "Task ordine",
          phase: task.phase || task.task_phase || "Lavorazione",
          owner,
          client: order.client || "Cliente",
          status: task.state || task.status || "Da avviare",
          iso: parsed?.iso || "",
          time: parsed?.time || "Orario da definire",
          day: taskDay(task, parsed),
          unscheduled: !parsed,
        };
      })
    );
  }

  function ensureFilters() {
    if (!appState.calendarFilters || typeof appState.calendarFilters !== "object") appState.calendarFilters = {};
    if (!appState.calendarFilters.employee) appState.calendarFilters.employee = "all";
    if (!appState.calendarFilters.phase) appState.calendarFilters.phase = "all";
    if (!("orderQuery" in appState.calendarFilters)) appState.calendarFilters.orderQuery = "";
  }

  function matchesFilters(row) {
    ensureFilters();
    const query = text(appState.calendarFilters.orderQuery).toLowerCase();
    const employee = appState.calendarFilters.employee || "all";
    const phase = appState.calendarFilters.phase || "all";
    const haystack = [row.orderId, row.title, row.phase, row.owner, row.client].join(" ").toLowerCase();
    return (
      (employee === "all" || row.owner === employee) &&
      (phase === "all" || text(row.phase).toLowerCase() === text(phase).toLowerCase()) &&
      (!query || haystack.includes(query))
    );
  }

  function matchesWeek(row, dates) {
    if (row.unscheduled) return true;
    return dates.some((item) => item.iso === row.iso);
  }

  function optionsFromRows(rows, key, fallback) {
    return ["all", ...new Set([...fallback, ...rows.map((row) => row[key]).filter(Boolean)])];
  }

  function colorFor(owner) {
    const palette = ["#e50c39", "#0f766e", "#7c3aed", "#b45309", "#2563eb", "#be123c", "#047857", "#9333ea", "#a16207"];
    let hash = 0;
    const key = owner || "Non assegnato";
    for (let index = 0; index < key.length; index += 1) hash = (hash + key.charCodeAt(index) * (index + 1)) % palette.length;
    return palette[hash];
  }

  function eventCard(row) {
    const session = typeof calendarWorklogSessionFor === "function" ? calendarWorklogSessionFor(row.taskId) : null;
    const status = session?.status || row.status || "Da avviare";
    const running = text(status).toLowerCase().includes("corso");
    return `
      <div class="calendar-event" data-detail="${escapeHtml(row.orderId)}" style="--owner-color:${colorFor(row.owner)}" role="button" tabindex="0">
        <span class="calendar-event-time">${escapeHtml(row.time)}</span>
        <strong>#${escapeHtml(row.orderId)} - ${escapeHtml(row.title)}</strong>
        <span>${escapeHtml(row.client)} · ${escapeHtml(row.phase)}</span>
        <small>${escapeHtml(row.owner)}</small>
        <div class="calendar-event-actions">
          <button class="mini-btn" data-calendar-open-order="${escapeHtml(row.orderId)}" type="button">Apri</button>
          <button class="mini-btn" data-calendar-plan-task="${escapeHtml(row.taskId)}" type="button">Pianifica</button>
          <button class="mini-btn" data-weekly-worklog-action="${running ? "pause" : "start"}" data-weekly-worklog-task="${escapeHtml(row.taskId)}" type="button">${running ? "Pausa" : "Inizio"}</button>
          <button class="mini-btn" data-weekly-worklog-action="finish" data-weekly-worklog-task="${escapeHtml(row.taskId)}" type="button">Stop</button>
        </div>
      </div>
    `;
  }

  function renderCalendarWithWeekNavigation() {
    ensureFilters();
    const dates = weekDates();
    const rows = taskRows();
    const visibleRows = rows.filter((row) => matchesWeek(row, dates)).filter(matchesFilters);
    const employeeOptions = optionsFromRows(rows, "owner", []);
    const phaseOptions = optionsFromRows(rows, "phase", ["Cartamodello", "Taglio", "Confezione"]);
    const byDay = new Map(DAYS.map((day) => [day, []]));
    visibleRows.forEach((row) => byDay.get(row.day)?.push(row));
    byDay.forEach((items) => items.sort((a, b) => `${a.time} ${a.orderId}`.localeCompare(`${b.time} ${b.orderId}`)));
    const worklog = typeof calendarWorklogPanel === "function" ? calendarWorklogPanel() : "";

    return `
      <section class="view ${appState.currentView === "calendar" ? "active" : ""}">
        <div class="screen-header calendar-week-header">
          <div>
            <h2>Calendario operativo</h2>
            <p>Planning generale degli ordini con settimana, mese, filtri e colori per dipendente.</p>
          </div>
          <div class="screen-actions calendar-week-actions">
            <button class="mini-btn" data-calendar-week-shift="-1" type="button">Settimana prima</button>
            <div class="ghost-pill">Settimana ${escapeHtml(weekTitle(dates))}</div>
            <button class="mini-btn" data-calendar-week-shift="1" type="button">Settimana dopo</button>
            <button class="mini-btn" data-calendar-week-today type="button">Oggi</button>
          </div>
        </div>
        <div class="surface">
          <div class="surface-inner">
            <div class="calendar-filter-grid">
              <input class="filter-chip" data-calendar-search="orderQuery" value="${escapeHtml(appState.calendarFilters.orderQuery)}" placeholder="Cerca ordine, cliente, dipendente o lavorazione" />
              <select class="filter-chip" data-calendar-filter="employee">
                ${employeeOptions.map((employee) => `<option value="${escapeHtml(employee)}" ${appState.calendarFilters.employee === employee ? "selected" : ""}>${employee === "all" ? "Tutti i dipendenti" : escapeHtml(employee)}</option>`).join("")}
              </select>
              <select class="filter-chip" data-calendar-filter="phase">
                ${phaseOptions.map((phase) => `<option value="${escapeHtml(phase)}" ${appState.calendarFilters.phase === phase ? "selected" : ""}>${phase === "all" ? "Tutte le lavorazioni" : escapeHtml(phase)}</option>`).join("")}
              </select>
              <div class="filter-chip">Ordine selezionato: #${escapeHtml(appState.selectedOrderId)}</div>
            </div>
          </div>
        </div>
        <div class="surface calendar-weekly-surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Planning generale ordini</h3>
                <p>Da ${escapeHtml(dates[0].label)} a ${escapeHtml(dates[6].label)}. Le lavorazioni senza data restano visibili come da pianificare.</p>
              </div>
              <div class="ghost-pill">${visibleRows.length} task visibili</div>
            </div>
            <div class="calendar-week-board">
              ${dates
                .map((date) => {
                  const slots = byDay.get(date.day) || [];
                  return `
                    <div class="calendar-week-day">
                      <div class="calendar-day-head">
                        <h4>${escapeHtml(date.day)}<small>${escapeHtml(date.label)}</small></h4>
                        <span>${slots.length} task</span>
                      </div>
                      <div class="calendar-day-slots">${slots.length ? slots.map(eventCard).join("") : `<div class="calendar-empty">Nessun task</div>`}</div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>
        </div>
        ${worklog}
      </section>
    `;
  }

  function ensureStyles() {
    if (document.getElementById("calendar-week-navigation-styles")) return;
    const style = document.createElement("style");
    style.id = "calendar-week-navigation-styles";
    style.textContent = `
      .calendar-week-actions{flex-wrap:wrap;justify-content:flex-end}
      .calendar-day-head h4{display:grid;gap:3px}
      .calendar-day-head h4 small{font-size:12px;color:var(--muted);font-weight:500}
      @media(max-width:980px){.calendar-week-header{align-items:flex-start}.calendar-week-actions{justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  renderCalendar = renderCalendarWithWeekNavigation;

  const baseRenderAppWeekNavigation = renderApp;
  renderApp = function renderAppCalendarWeekNavigation() {
    ensureStyles();
    baseRenderAppWeekNavigation();
  };

  document.addEventListener(
    "click",
    (event) => {
      if (appState.currentView !== "calendar") return;
      const shift = event.target.closest?.("[data-calendar-week-shift]");
      if (shift) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const next = addDays(currentWeekStart(), Number(shift.dataset.calendarWeekShift) * 7);
        appState.calendarWeekStart = isoDate(next);
        renderApp();
        return;
      }
      const today = event.target.closest?.("[data-calendar-week-today]");
      if (today) {
        event.preventDefault();
        event.stopImmediatePropagation();
        appState.calendarWeekStart = isoDate(mondayFor(new Date()));
        renderApp();
      }
    },
    true
  );

  if (document.getElementById("app")?.innerHTML) renderApp();
})();