function getScheduledTasksForSelectedOrder() {
  const tasks = appData.orderTasks[appState.selectedOrderId] || [];
  return tasks.filter((task) => task.calendarDay && task.calendarDay !== "Da pianificare");
}

function getUpcomingScheduledTasks(limit = 6) {
  return Object.values(appData.orderTasks)
    .flat()
    .filter((task) => task.calendarDay && task.calendarDay !== "Da pianificare")
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")))
    .slice(0, limit);
}

renderCalendar = function renderCalendarVisibilityOverride() {
  const order = getSelectedOrder();
  const selectedOrderTasks = appData.orderTasks[appState.selectedOrderId] || [];
  const departmentOptions = getDepartmentOptions();
  const employeeOptions = getEmployeeOptions();
  const phaseOptions = getPhaseOptions();
  const assignableAccounts = appData.accounts
    .filter((account) => account.role === "Amministratore" || account.role === "Visualizzatore")
    .map((account) => ({ id: account.id, label: account.name }));

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
          <div class="filter-row" style="grid-template-columns: 1.2fr 1fr 1fr 1fr 1fr 1fr;">
            <div class="filter-chip">Ordine: #${order.id} · ${order.client}</div>
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
            <div class="filter-chip">Stato ordine: ${order.status}</div>
            <div class="filter-chip">Consegna: ${order.estimatedDelivery}</div>
          </div>
        </div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Task dell'ordine #${order.id}</h3>
                <p>Seleziona un task, assegnalo a una persona e spostalo sul giorno corretto.</p>
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
                        .map(
                          (task) => `
                      <tr>
                        <td>${task.name}</td>
                        <td>${getTaskDepartment(task)}</td>
                        <td>${task.phase}</td>
                        <td>${getTaskOwner(task)}</td>
                        <td>${task.time}</td>
                        <td>${task.calendarDay}</td>
                        <td><span class="table-status ${getStatusClass(task.state)}">${task.state}</span></td>
                        <td>
                          <div class="pill-row">
                            <button class="mini-btn" data-pick-task="${task.id}" data-pick-day="${task.calendarDay}" data-pick-date="${task.time}">Pianifica</button>
                            <button class="mini-btn" data-task-update="${task.id}" data-next-status="${
                            task.state === "Completato" ? "in_corso" : "completato"
                          }">${task.state === "Completato" ? "Riapri" : "Completa"}</button>
                          </div>
                        </td>
                      </tr>
                    `
                        )
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
                  <p>La compilazione minima per mettere il task in calendario.</p>
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
                  <label>Ora consegna / task</label>
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
              <h3>Task pianificati per questo ordine</h3>
              <p>Qui devi vedere subito i salvataggi appena fai l'assegnazione.</p>
            </div>
          </div>
          <div class="ledger-list">
            ${
              getScheduledTasksForSelectedOrder().length
                ? getScheduledTasksForSelectedOrder()
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

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Planning settimana</h3>
              <p>Vista pratica per reparto e dipendente, utile per spostare i task dell'ordine appena creato.</p>
            </div>
          </div>
          <div class="calendar-board">
            ${appData.calendar
              .map((day) => {
                const slots = filterCalendarSlotsEnhanced(day.slots);
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
                        : `<div class="empty-state">Nessun task con questi filtri.</div>`
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

renderDashboard = function renderDashboardVisibilityOverride() {
  const topOrders = appData.orders.slice(0, 4);
  const scheduled = getUpcomingScheduledTasks(6);
  return `
    <section class="view ${appState.currentView === "dashboard" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Controllo operativo della giornata</h2>
          <p>Una dashboard per direzione e coordinamento: cosa e' aperto, cosa e' a rischio e quali reparti hanno bisogno di attenzione subito.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">Ultimo aggiornamento live</div>
          <button class="action-pill" data-open="calendar">Apri planning settimana</button>
        </div>
      </div>

      <div class="hero-band">
        <div class="hero-panel surface">
          <div class="surface-inner">
            <strong>Dal foglio operativo a una cabina di regia unica per ordini, reparti e consegne.</strong>
            <p>Questa base collega ordini, task e calendario nello stesso sistema: il salvataggio del planning deve comparire qui, non restare nascosto.</p>
            <div class="hero-pills">
              <span>Ordini unificati</span>
              <span>Pianificazione reparto</span>
              <span>Pagamenti collegati</span>
              <span>AI assistiva</span>
            </div>
          </div>
        </div>
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Planning recente</h3>
                <p>Le ultime assegnazioni salvate.</p>
              </div>
            </div>
            <div class="alert-list">
              ${
                scheduled.length
                  ? scheduled
                      .map(
                        (task) => `
                    <div class="alert-item">
                      <strong>${task.name}</strong>
                      <span>${task.calendarDay} · ${task.time} · ${getTaskOwner(task)}</span>
                    </div>
                  `
                      )
                      .join("")
                  : `<div class="empty-state">Appena pianifichi un task, lo vedrai qui nella dashboard.</div>`
              }
            </div>
          </div>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi surface"><small>Ordini aperti</small><strong>${appData.metrics.openOrders}</strong><span>${appData.metrics.activeOrders} in lavorazione, ${appData.metrics.toStart} da avviare</span></div>
        <div class="kpi surface"><small>Urgenti</small><strong>${appData.metrics.urgent}</strong><span>Ordini express da seguire da vicino</span></div>
        <div class="kpi surface"><small>Ritardi</small><strong>${appData.metrics.delays}</strong><span>Task da ripianificare</span></div>
        <div class="kpi surface"><small>Incassi aperti</small><strong>${appData.metrics.paymentValue}</strong><span>${appData.metrics.openPayments} posizioni ancora aperte</span></div>
        <div class="kpi surface"><small>Task attivi</small><strong>${appData.metrics.activeTasks}</strong><span>taglio, confezione, controllo finale</span></div>
        <div class="kpi surface"><small>Evasi mese</small><strong>${appData.metrics.completedMonth}</strong><span>ordini chiusi nel mese</span></div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Ordini prioritari</h3>
                <p>Le lavorazioni che oggi spostano davvero il planning.</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>N. ordine</th>
                  <th>Cliente</th>
                  <th>Reparto</th>
                  <th>Priorita'</th>
                  <th>Consegna</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                ${topOrders
                  .map(
                    (order) => `
                  <tr data-order="${order.id}" class="clickable-row">
                    <td>#${order.id}</td>
                    <td>${order.client}</td>
                    <td>${order.department}</td>
                    <td>${renderPriorityBadge(order.priority)}</td>
                    <td>${order.eta}</td>
                    <td><span class="table-status ${getStatusClass(order.status)}">${order.status}</span></td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Attenzioni operative</h3>
                <p>Le eccezioni che oggi meritano una regia piu' chiara.</p>
              </div>
            </div>
            <div class="alert-list">
              ${appData.alerts
                .map(
                  (alert) => `
                <div class="alert-item" data-order="${alert.orderId}">
                  <strong>${alert.title}</strong>
                  <span>${alert.detail}</span>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
};
