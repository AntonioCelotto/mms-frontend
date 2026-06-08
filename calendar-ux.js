function getTaskDisplayState(task) {
  const raw = String(task.state || "").toLowerCase();
  const hasSchedule = task.calendarDay && task.calendarDay !== "Da pianificare";
  const hasOwner = getTaskOwner(task) && getTaskOwner(task) !== "Non assegnato";

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

if (!appState.calendarFilters.department) appState.calendarFilters.department = "all";
if (!appState.calendarFilters.periodView) appState.calendarFilters.periodView = "week";

function getOrderOptions() {
  return [...appData.orders]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .map((order) => ({
      id: order.id,
      label: `#${order.id} · ${order.client}`,
    }));
}

function buildGeneralCalendarWeekMap() {
  const map = {
    "Lunedi'": [],
    "Martedi'": [],
    "Mercoledi'": [],
    "Giovedi'": [],
    "Venerdi'": [],
  };

  appData.calendar.forEach((day) => {
    const filteredSlots = filterCalendarSlotsEnhanced(day.slots);
    if (!map[day.day]) {
      map[day.day] = [];
    }
    map[day.day].push(...filteredSlots);
  });

  return map;
}

function getGeneralScheduledTasks() {
  return Object.values(appData.orderTasks)
    .flat()
    .filter((task) => task.calendarDay && task.calendarDay !== "Da pianificare")
    .filter((task) => {
      const ownerMatches =
        appState.calendarFilters.employee === "all" || getTaskOwner(task) === appState.calendarFilters.employee;
      const phaseMatches =
        appState.calendarFilters.phase === "all" || task.phase === appState.calendarFilters.phase;
      const departmentMatches =
        appState.calendarFilters.department === "all" || getTaskDepartment(task) === appState.calendarFilters.department;
      return ownerMatches && phaseMatches && departmentMatches;
    })
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
}

renderCalendar = function renderCalendarUxOverride() {
  const order = getSelectedOrder();
  const selectedOrderTasks = appData.orderTasks[appState.selectedOrderId] || [];
  const departmentOptions = getDepartmentOptions();
  const employeeOptions = getEmployeeOptions();
  const phaseOptions = getPhaseOptions();
  const orderOptions = getOrderOptions();
  const assignableAccounts = appData.accounts
    .filter((account) => account.role === "Amministratore" || account.role === "Visualizzatore")
    .map((account) => ({ id: account.id, label: account.name }));
  const scheduledTasks = getScheduledTasksForSelectedOrder();
  const generalWeekMap = buildGeneralCalendarWeekMap();
  const generalScheduledTasks = getGeneralScheduledTasks();
  const selectedOrderWeekMap = {
    "Lunedi'": [],
    "Martedi'": [],
    "Mercoledi'": [],
    "Giovedi'": [],
    "Venerdi'": [],
  };

  scheduledTasks.forEach((task) => {
    const ownerMatches =
      appState.calendarFilters.employee === "all" || getTaskOwner(task) === appState.calendarFilters.employee;
    const phaseMatches =
      appState.calendarFilters.phase === "all" || task.phase === appState.calendarFilters.phase;
    const departmentMatches =
      appState.calendarFilters.department === "all" || getTaskDepartment(task) === appState.calendarFilters.department;

    if (!ownerMatches || !phaseMatches || !departmentMatches) {
      return;
    }

    if (!selectedOrderWeekMap[task.calendarDay]) {
      selectedOrderWeekMap[task.calendarDay] = [];
    }

    selectedOrderWeekMap[task.calendarDay].push({
      orderId: order.id,
      title: task.name,
      owner: getTaskOwner(task),
      time: task.time,
      phase: task.phase,
    });
  });

  const loadByEmployee = {};
  Object.values(appData.orderTasks)
    .flat()
    .forEach((task) => {
      const owner = getTaskOwner(task);
      if (!loadByEmployee[owner]) {
        loadByEmployee[owner] = { tasks: 0, hours: 0, phases: new Set() };
      }
      loadByEmployee[owner].tasks += 1;
      loadByEmployee[owner].hours += Number(String(task.hours || "0").replace(",", ".").split(" ")[0]) || 0;
      loadByEmployee[owner].phases.add(task.phase);
    });

  const employeeLoadCards = Object.entries(loadByEmployee)
    .sort((a, b) => b[1].tasks - a[1].tasks)
    .slice(0, 6);

  return `
    <section class="view ${appState.currentView === "calendar" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Calendario operativo ordini</h2>
          <p>Qui l'ordine diventa pianificazione vera: task, dipendente, giorno, stato e riassegnazione nello stesso flusso.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">Ordine attivo: #${order.id}</div>
          <button class="action-pill" data-action="save-assignment">${appState.busy ? "Salvataggio..." : "Salva assegnazione"}</button>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="filter-row" style="grid-template-columns: 1.6fr 1fr 1fr 1fr 1fr 1fr;">
            <select class="filter-chip" data-calendar-order-select>
              ${orderOptions
                .map(
                  (item) => `<option value="${item.id}" ${
                    Number(appState.selectedOrderId) === Number(item.id) ? "selected" : ""
                  }>${item.label}</option>`
                )
                .join("")}
            </select>
            <select class="filter-chip" data-calendar-department>
              ${departmentOptions
                .map(
                  (department) => `<option value="${department}" ${
                    appState.calendarFilters.department === department ? "selected" : ""
                  }>${department === "all" ? "Tutti i reparti" : department}</option>`
                )
                .join("")}
            </select>
            <select class="filter-chip" data-calendar-filter="employee">
              ${employeeOptions
                .map(
                  (employee) => `<option value="${employee}" ${
                    appState.calendarFilters.employee === employee ? "selected" : ""
                  }>${employee === "all" ? "Tutti i dipendenti" : employee}</option>`
                )
                .join("")}
            </select>
            <select class="filter-chip" data-calendar-filter="phase">
              ${phaseOptions
                .map(
                  (phase) => `<option value="${phase}" ${
                    appState.calendarFilters.phase === phase ? "selected" : ""
                  }>${phase === "all" ? "Tutte le lavorazioni" : phase}</option>`
                )
                .join("")}
            </select>
            <select class="filter-chip" data-calendar-filter="periodView">
              <option value="week" ${appState.calendarFilters.periodView === "week" ? "selected" : ""}>Settimana</option>
              <option value="month" ${appState.calendarFilters.periodView === "month" ? "selected" : ""}>Mese</option>
            </select>
            <div class="filter-chip">Stato ordine: ${order.status}</div>
            <div class="filter-chip">Consegna: ${order.estimatedDelivery}</div>
          </div>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Avanzamento pianificazione</h3>
              <p>Hai pianificato ${scheduledTasks.length} task su ${selectedOrderTasks.length} per questo ordine.</p>
            </div>
          </div>
          <div class="hero-pills">
            <span>Ogni salvataggio pianifica un solo task</span>
            <span>Per i 3 ruoli devi salvare 3 task</span>
            <span>Dopo il salvataggio li vedi sotto e nella dashboard</span>
          </div>
        </div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Task dell'ordine #${order.id}</h3>
                <p>Prima scegli il task giusto, poi assegni persona e data.</p>
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
                            <button class="mini-btn" data-pick-task="${task.id}" data-pick-day="${task.calendarDay}" data-pick-date="${task.time}">Seleziona</button>
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

        <div style="display:grid; gap:16px;">
          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Assegnazione rapida</h3>
                  <p>Seleziona un task sopra, poi salva. Un salvataggio = un task pianificato.</p>
                </div>
              </div>
              <div class="form-grid">
                <div class="field">
                  <label>Task ordine</label>
                  <select class="filter-chip" data-assignment-field="taskId">
                    <option value="">Seleziona task</option>
                    ${selectedOrderTasks
                      .map(
                        (task) => `<option value="${task.id}" ${
                          String(appState.assignmentDraft.taskId) === String(task.id) ? "selected" : ""
                        }>${task.name}</option>`
                      )
                      .join("")}
                  </select>
                </div>
                <div class="field">
                  <label>Dipendente</label>
                  <select class="filter-chip" data-assignment-field="assignedUserId">
                    <option value="">Seleziona dipendente</option>
                    ${assignableAccounts
                      .map(
                        (employee) => `<option value="${employee.id}" ${
                          String(appState.assignmentDraft.assignedUserId) === String(employee.id) ? "selected" : ""
                        }>${employee.label}</option>`
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
                  <h3>Carico per dipendente</h3>
                  <p>Serve a capire se stiamo saturando una persona prima di promettere la consegna.</p>
                </div>
              </div>
              <div class="dept-strip">
                ${employeeLoadCards
                  .map(
                    ([owner, stats]) => `
                  <div class="dept-row">
                    <div class="dept-name">
                      <strong>${owner}</strong>
                      <span>${Array.from(stats.phases).join(", ")}</span>
                    </div>
                    <div>
                      <div class="mini-progress"><div style="width:${Math.min(92, 22 + stats.tasks * 12)}%"></div></div>
                    </div>
                    <div class="mini-meta">${stats.tasks} task · ${stats.hours.toFixed(1).replace(".", ",")} h</div>
                    <button class="mini-btn" data-calendar-employee-filter="${owner}">Filtra</button>
                  </div>
                `
                  )
                  .join("")}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Lavori pianificati per questo ordine</h3>
              <p>Qui vedi subito tutti i task che hai gia' messo in calendario.</p>
            </div>
          </div>
          <div class="ledger-list">
            ${
              scheduledTasks.length
                ? scheduledTasks
                    .map((task) => {
                      const state = getTaskDisplayState(task);
                      return `
                  <div class="ledger-row">
                    <div>
                      <strong>${task.name}</strong>
                      <div class="muted">${getTaskDepartment(task)}</div>
                    </div>
                    <div>${task.calendarDay}</div>
                    <div>${task.time}</div>
                    <div>${getTaskOwner(task)}</div>
                    <div><span class="table-status ${state.className}">${state.label}</span></div>
                  </div>
                `;
                    })
                    .join("")
                : `<div class="empty-state">Dopo il salvataggio, i task pianificati dell'ordine compariranno qui.</div>`
            }
          </div>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Planning ${appState.calendarFilters.periodView === "month" ? "mese" : "settimana"} ordine</h3>
              <p>Qui sotto vedi i lavori assegnati di questo ordine distribuiti nel calendario.</p>
            </div>
          </div>
          ${
            appState.calendarFilters.periodView === "month"
              ? `<div class="ledger-list">
            ${
              scheduledTasks.length
                ? scheduledTasks
                    .map(
                      (task) => `
                  <div class="ledger-row">
                    <div><strong>${task.name}</strong><div class="muted">#${order.id} · ${getTaskDepartment(task)}</div></div>
                    <div>${task.calendarDay}</div>
                    <div>${task.time}</div>
                    <div>${getTaskOwner(task)}</div>
                  </div>
                `
                    )
                    .join("")
                : `<div class="empty-state">Nessun lavoro pianificato per questo ordine.</div>`
            }
          </div>`
              : `<div class="calendar-board">
            ${Object.keys(selectedOrderWeekMap)
              .map((day) => {
                const slots = selectedOrderWeekMap[day];
                return `
                  <div class="calendar-col">
                    <h4>${day}</h4>
                    <p>Ordine #${order.id}</p>
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
                        : `<div class="empty-state">Nessun task con questi filtri.</div>`
                    }
                  </div>
                `;
              })
              .join("")}
          </div>`
          }
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Calendario generale lavori</h3>
              <p>Questa e' la vista operativa per chi deve gestire manualmente tutta la settimana o tutto il mese.</p>
            </div>
          </div>
          ${
            appState.calendarFilters.periodView === "month"
              ? `<div class="ledger-list">
            ${
              generalScheduledTasks.length
                ? generalScheduledTasks
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
                : `<div class="empty-state">Nessun lavoro disponibile con questi filtri.</div>`
            }
          </div>`
              : `<div class="calendar-board">
            ${Object.keys(generalWeekMap)
              .map((day) => {
                const slots = generalWeekMap[day];
                return `
                  <div class="calendar-col">
                    <h4>${day}</h4>
                    <p>Tutti i lavori</p>
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
                        : `<div class="empty-state">Nessun lavoro con questi filtri.</div>`
                    }
                  </div>
                `;
              })
              .join("")}
          </div>`
          }
        </div>
      </div>
    </section>
  `;
};
