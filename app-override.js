const WEEKDAY_LABELS = ["Domenica", "Lunedi'", "Martedi'", "Mercoledi'", "Giovedi'", "Venerdi'", "Sabato"];

if (!appState.assignmentDraft.plannedTime) {
  appState.assignmentDraft.plannedTime = "";
}

function getCalendarDayFromDate(dateValue) {
  if (!dateValue) return "Da pianificare";
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Da pianificare";
  return WEEKDAY_LABELS[date.getDay()] || "Da pianificare";
}

function formatPlannedDateTime(dateValue, timeValue) {
  if (!dateValue) return "";
  return timeValue ? `${dateValue} ${timeValue}` : dateValue;
}

function splitPlannedDateTime(value) {
  if (!value || value === "Da pianificare") return { date: "", time: "" };
  const [datePart = "", timePart = ""] = String(value).split(" ");
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return { date: datePart, time: timePart || "" };
  }
  return { date: "", time: "" };
}

function getTaskOwner(task) {
  return (task.team?.split(" - ").pop() || "Non assegnato").trim();
}

function getTaskDepartment(task) {
  return (task.team?.split(" - ")[0] || "Da assegnare").trim();
}

function getTaskDisplayState(task) {
  const raw = String(task.state || "").toLowerCase();
  const hasSchedule = task.calendarDay && task.calendarDay !== "Da pianificare";
  const hasOwner = getTaskOwner(task) !== "Non assegnato";

  if (raw.includes("completato")) {
    return { label: "Fatto", className: "done", actionLabel: "Rimetti attivo", nextStatus: "in_corso" };
  }
  if (hasSchedule) {
    return { label: "Pianificato", className: "progress", actionLabel: "Segna finito", nextStatus: "completato" };
  }
  if (hasOwner) {
    return { label: "Assegnato", className: "progress", actionLabel: "Segna finito", nextStatus: "completato" };
  }
  return { label: "Da pianificare", className: "hold", actionLabel: "Segna finito", nextStatus: "completato" };
}

function getScheduledTasksForSelectedOrder() {
  const tasks = appData.orderTasks[appState.selectedOrderId] || [];
  return tasks.filter((task) => task.calendarDay && task.calendarDay !== "Da pianificare");
}

function getOrderOptions() {
  return [...appData.orders]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .map((order) => ({
      id: order.id,
      label: `#${order.id} · ${order.client}`,
    }));
}

function filterSelectedOrderCalendarSlots(slots) {
  return filterCalendarSlots(slots).filter(
    (slot) => Number(slot.orderId) === Number(appState.selectedOrderId)
  );
}

saveTaskAssignment = async function saveTaskAssignmentOverride() {
  const taskId = Number(appState.assignmentDraft.taskId);
  const assignedUserId = Number(appState.assignmentDraft.assignedUserId);
  if (!taskId || !assignedUserId) {
    setFlashMessage("Seleziona task e dipendente");
    return;
  }
  setBusy(true);
  try {
    const calendarDay = getCalendarDayFromDate(appState.assignmentDraft.plannedDate);
    const plannedDateTime = formatPlannedDateTime(
      appState.assignmentDraft.plannedDate,
      appState.assignmentDraft.plannedTime
    );
    await patchRows(
      "order_tasks",
      { id: `eq.${taskId}` },
      {
        assigned_user_id: assignedUserId,
        planned_date: plannedDateTime || null,
        calendar_day_label: calendarDay !== "Da pianificare" ? calendarDay : null,
        notes: "Assegnazione aggiornata dalla UI",
      }
    );
    await refreshBootstrap();
    setFlashMessage("Assegnazione calendario salvata");
  } catch (error) {
    setFlashMessage(error.message || "Errore nell'assegnazione");
  } finally {
    appState.busy = false;
    renderApp();
  }
};

renderCalendar = function renderCalendarOverride() {
  const employees = getCalendarEmployees();
  const phases = getCalendarPhases();
  const order = getSelectedOrder();
  const selectedOrderTasks = appData.orderTasks[appState.selectedOrderId] || [];
  const scheduledTasks = getScheduledTasksForSelectedOrder();
  const orderOptions = getOrderOptions();
  const employeeOptions = appData.accounts
    .filter((account) => account.role === "Amministratore" || account.role === "Visualizzatore")
    .map((account) => ({
      id: account.id,
      label: account.name,
    }));

  return `
    <section class="view ${appState.currentView === "calendar" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Calendario operativo ordini</h2>
          <p>Qui l'ordine diventa pianificazione vera: task, dipendente, data, ora e stato nello stesso flusso.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">Ordine attivo: #${order.id}</div>
          <button class="action-pill" data-action="save-assignment">${appState.busy ? "Salvataggio..." : "Salva assegnazione"}</button>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="filter-row" style="grid-template-columns: 1.2fr 1fr 1fr 1fr 1fr 1fr;">
            <select class="filter-chip" data-calendar-order-select>
              ${orderOptions
                .map(
                  (item) => `<option value="${item.id}" ${
                    Number(appState.selectedOrderId) === Number(item.id) ? "selected" : ""
                  }>${item.label}</option>`
                )
                .join("")}
            </select>
            <select class="filter-chip" data-calendar-filter="employee">
              ${employees
                .map(
                  (employee) => `<option value="${employee}" ${appState.calendarFilters.employee === employee ? "selected" : ""}>${
                    employee === "all" ? "Tutti i dipendenti" : employee
                  }</option>`
                )
                .join("")}
            </select>
            <select class="filter-chip" data-calendar-filter="phase">
              ${phases
                .map(
                  (phase) => `<option value="${phase}" ${appState.calendarFilters.phase === phase ? "selected" : ""}>${
                    phase === "all" ? "Tutte le lavorazioni" : phase
                  }</option>`
                )
                .join("")}
            </select>
            <div class="filter-chip">Reparto: Sartoria</div>
            <div class="filter-chip">Moduli: cartamodello</div>
            <div class="filter-chip">Taglio e confezione</div>
          </div>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Task dell'ordine #${order.id}</h3>
              <p>Prima scegli il task corretto, poi lo assegni e lo pianifichi.</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Reparto</th>
                <th>Fase</th>
                <th>Assegnato</th>
                <th>Data</th>
                <th>Giorno</th>
                <th>Stato</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              ${
                selectedOrderTasks.length
                  ? selectedOrderTasks
                      .map((task) => {
                        const state = getTaskDisplayState(task);
                        return `
                    <tr>
                      <td>${task.name}</td>
                      <td>${getTaskDepartment(task)}</td>
                      <td>${task.phase}</td>
                      <td>${getTaskOwner(task)}</td>
                      <td>${task.time}</td>
                      <td>${task.calendarDay}</td>
                      <td><span class="table-status ${state.className}">${state.label}</span></td>
                      <td>
                        <div class="pill-row">
                          <button class="mini-btn" data-pick-task="${task.id}" data-pick-date="${task.time}">Seleziona</button>
                          <button class="mini-btn" data-task-update="${task.id}" data-next-status="${state.nextStatus}">${state.actionLabel}</button>
                        </div>
                      </td>
                    </tr>
                  `;
                      })
                      .join("")
                  : `<tr><td colspan="8"><div class="empty-state">Questo ordine non ha ancora task da pianificare.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Assegnazione dipendenti</h3>
              <p>Compila i campi minimi per mettere il task in calendario.</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Task ordine #${order.id}</label>
              <select class="filter-chip" data-assignment-field="taskId">
                <option value="">Seleziona task</option>
                ${selectedOrderTasks
                  .map(
                    (task) => `<option value="${task.id}" ${String(appState.assignmentDraft.taskId) === String(task.id) ? "selected" : ""}>${task.name}</option>`
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
                    (employee) => `<option value="${employee.id}" ${String(appState.assignmentDraft.assignedUserId) === String(employee.id) ? "selected" : ""}>${employee.label}</option>`
                  )
                  .join("")}
              </select>
            </div>
            <div class="field">
              <label>Data pianificata</label>
              <input type="date" class="field-value" data-assignment-field="plannedDate" value="${appState.assignmentDraft.plannedDate}" />
            </div>
            <div class="field">
              <label>Ora task</label>
              <input type="time" class="field-value" data-assignment-field="plannedTime" value="${appState.assignmentDraft.plannedTime}" />
            </div>
            <div class="field">
              <label>Giorno calendario</label>
              <div class="field-value">${getCalendarDayFromDate(appState.assignmentDraft.plannedDate)}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Task pianificati per questo ordine</h3>
              <p>Qui vedi subito i salvataggi appena fai l'assegnazione.</p>
            </div>
          </div>
          <div class="ledger-list">
            ${
              scheduledTasks.length
                ? scheduledTasks
                    .map(
                      (task) => `
                  <div class="ledger-row">
                    <div>
                      <strong>${task.name}</strong>
                      <div class="muted">${getTaskDepartment(task)}</div>
                    </div>
                    <div>${task.calendarDay}</div>
                    <div>${task.time}</div>
                    <div>${getTaskOwner(task)}</div>
                  </div>
                `
                    )
                    .join("")
                : `<div class="empty-state">Dopo il salvataggio, i task pianificati dell'ordine compariranno qui.</div>`
            }
          </div>
        </div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Planning ordine selezionato</h3>
                <p>Qui sotto vedi nel calendario solo i task dell'ordine che stai gestendo.</p>
              </div>
            </div>
            <div class="calendar-board">
              ${appData.calendar
                .map((day) => {
                  const slots = filterSelectedOrderCalendarSlots(day.slots);
                  return `
                <div class="calendar-col">
                  <h4>${day.day}</h4>
                  <p>${day.date}</p>
                  ${
                    slots.length
                      ? slots
                          .map(
                            (slot) => `
                    <div class="slot" data-detail="${slot.orderId}">
                      <strong>#${slot.orderId} - ${slot.title}</strong>
                      <span>${slot.owner} · ${slot.time}</span>
                      <span>${slot.phase}</span>
                    </div>
                  `
                          )
                          .join("")
                      : `<div class="empty-state">Nessun task con i filtri attuali.</div>`
                  }
                </div>
              `;
                })
                .join("")}
            </div>
          </div>
        </div>

        <div style="display:grid; gap:16px;">
          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Capacita' reparto</h3>
                  <p>Chi lavora, quanto e dove si satura.</p>
                </div>
              </div>
              <div class="dept-strip">
                <div class="dept-row">
                  <div class="dept-name"><strong>Eleonora</strong><span>cartamodelli + taglio</span></div>
                  <div><div class="mini-progress"><div style="width:78%"></div></div></div>
                  <div class="mini-meta">31h assegnate</div>
                  <button class="mini-btn">Dettaglio</button>
                </div>
                <div class="dept-row">
                  <div class="dept-name"><strong>Olga</strong><span>confezione</span></div>
                  <div><div class="mini-progress"><div style="width:86%"></div></div></div>
                  <div class="mini-meta">34h assegnate</div>
                  <button class="mini-btn">Dettaglio</button>
                </div>
                <div class="dept-row">
                  <div class="dept-name"><strong>Roberta</strong><span>taglio part-time</span></div>
                  <div><div class="mini-progress"><div style="width:54%"></div></div></div>
                  <div class="mini-meta">15h su 3 giorni</div>
                  <button class="mini-btn">Dettaglio</button>
                </div>
              </div>
            </div>
          </div>

          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Attenzioni calendario</h3>
                  <p>Per ripianificare senza perdere contesto.</p>
                </div>
              </div>
              <div class="alert-list">
                <div class="alert-item">
                  <strong>1 assenza da confermare per venerdi'</strong>
                  <span>Il sistema dovra' ricalcolare i task impattati con un solo click.</span>
                </div>
                <div class="alert-item">
                  <strong>2 task in attesa materiale</strong>
                  <span>Segnale utile prima che il reparto perda tempo su lavorazioni bloccate.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Calendario generale lavori</h3>
              <p>Questa e' la vista operativa completa per gestire manualmente tutta la settimana.</p>
            </div>
          </div>
          <div class="calendar-board">
            ${appData.calendar
              .map((day) => {
                const slots = filterCalendarSlots(day.slots);
                return `
                <div class="calendar-col">
                  <h4>${day.day}</h4>
                  <p>${day.date || "Settimana attiva"}</p>
                  ${
                    slots.length
                      ? slots
                          .map(
                            (slot) => `
                    <div class="slot" data-detail="${slot.orderId}">
                      <strong>#${slot.orderId} - ${slot.title}</strong>
                      <span>${slot.owner} · ${slot.time}</span>
                      <span>${slot.phase}</span>
                    </div>
                  `
                          )
                          .join("")
                      : `<div class="empty-state">Nessun lavoro con i filtri attuali.</div>`
                  }
                </div>
              `;
              })
              .join("")}
          </div>
        </div>
      </div>
    </section>
  `;
};

const baseAttachEvents = attachEvents;
attachEvents = function attachEventsOverride() {
  baseAttachEvents();

  document.querySelectorAll("[data-assignment-field]").forEach((input) => {
    const handler = (event) => {
      appState.assignmentDraft[event.target.dataset.assignmentField] = event.target.value;
      if (event.target.dataset.assignmentField === "plannedDate") {
        appState.assignmentDraft.calendarDay = getCalendarDayFromDate(event.target.value);
      }
    };
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });

  document.querySelectorAll("[data-pick-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const parts = splitPlannedDateTime(button.dataset.pickDate);
      appState.assignmentDraft.taskId = button.dataset.pickTask;
      appState.assignmentDraft.plannedDate = parts.date;
      appState.assignmentDraft.plannedTime = parts.time;
      if (parts.date) {
        appState.assignmentDraft.calendarDay = getCalendarDayFromDate(parts.date);
      }
      renderApp();
    });
  });

  document.querySelectorAll("[data-calendar-order-select]").forEach((select) => {
    select.addEventListener("change", (event) => {
      appState.selectedOrderId = Number(event.target.value);
      appState.assignmentDraft.taskId = "";
      appState.assignmentDraft.assignedUserId = "";
      appState.assignmentDraft.plannedDate = "";
      appState.assignmentDraft.plannedTime = "";
      appState.assignmentDraft.calendarDay = "Lunedi'";
      renderApp();
    });
  });
};
