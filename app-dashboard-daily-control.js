(function () {
  function text(value) {
    return String(value ?? "").trim();
  }

  function html(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalize(value) {
    return text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  }

  function isoToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function isoFrom(value) {
    return text(value).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
  }

  function numberValue(value) {
    const parsed = Number(text(value).replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function taskRows() {
    const worklogs = typeof calendarWorklogRead === "function" ? calendarWorklogRead() : {};
    return Object.entries(appData.orderTasks || {}).flatMap(([orderId, tasks]) => {
      const order = (appData.orders || []).find((item) => Number(item.id) === Number(orderId)) || {};
      return (Array.isArray(tasks) ? tasks : []).filter((task) => Number(task.id) > 0).map((task) => {
        const taskId = String(task.id);
        const log = worklogs[taskId] || {};
        const status = log.status || task.state || task.status || "Da avviare";
        const assignedId = task.assignedUserId || task.assigned_user_id || "";
        const account = (appData.accounts || []).find((item) => String(item.id) === String(assignedId));
        const team = text(task.team);
        const owner = account?.name || account?.displayName || [account?.first_name, account?.last_name].filter(Boolean).join(" ")
          || (team.includes(" - ") ? team.split(" - ").pop() : team)
          || task.owner || "Da assegnare";
        return {
          taskId,
          orderId,
          order,
          title: task.name || task.task_name || "Task ordine",
          phase: task.phase || task.task_phase || "Lavorazione",
          owner,
          status,
          plannedDate: isoFrom(task.time || task.planned_date),
          hours: numberValue(task.hours || task.estimated_hours || task.estimatedHours),
          finishedDate: isoFrom(log.finishedAt || log.finished_at),
        };
      });
    });
  }

  function isCompleted(row) {
    return normalize(row.status).includes("complet");
  }

  function isActive(row) {
    const status = normalize(row.status);
    return status.includes("corso") || status.includes("pausa") || status.includes("stand");
  }

  function displayOrderNumber(order, fallback) {
    return order.sourceQuoteNumber || order.source_quote_number || order.orderNumber || order.order_number || `#${fallback}`;
  }

  function deliveryDate(order) {
    return isoFrom(order.customerWindow || order.customer_window || order.estimatedDelivery || order.estimated_delivery || order.eta);
  }

  function daysFromToday(iso) {
    if (!iso) return null;
    const start = new Date(`${isoToday()}T12:00:00`);
    const end = new Date(`${iso}T12:00:00`);
    return Math.round((end - start) / 86400000);
  }

  function urgentOrders(rows) {
    const lateOrderIds = new Set(rows.filter((row) => row.plannedDate && row.plannedDate < isoToday() && !isCompleted(row)).map((row) => String(row.orderId)));
    return (appData.orders || []).map((order) => {
      const delivery = deliveryDate(order);
      const days = daysFromToday(delivery);
      const priority = normalize(order.priority);
      const reasons = [];
      if (priority.includes("express") || priority.includes("urgent")) reasons.push("Priorità urgente");
      if (days !== null && days < 0) reasons.push("Consegna scaduta");
      else if (days !== null && days <= 2) reasons.push(days === 0 ? "Consegna oggi" : days === 1 ? "Consegna domani" : "Consegna entro 2 giorni");
      if (lateOrderIds.has(String(order.id))) reasons.push("Task in ritardo");
      return { order, delivery, reasons };
    }).filter((item) => item.reasons.length).sort((a, b) => {
      const aDays = daysFromToday(a.delivery);
      const bDays = daysFromToday(b.delivery);
      return (aDays ?? 9999) - (bDays ?? 9999);
    });
  }

  function taskStatusClass(status) {
    const value = normalize(status);
    if (value.includes("complet")) return "done";
    if (value.includes("pausa") || value.includes("stand")) return "hold";
    return "progress";
  }

  function taskCard(row) {
    return `
      <button class="daily-task-row" data-order="${html(row.orderId)}" type="button">
        <span><strong>${html(displayOrderNumber(row.order, row.orderId))} · ${html(row.title)}</strong><small>${html(row.order.client || "Cliente")} · ${html(row.phase)}</small></span>
        <span><strong>${html(row.owner)}</strong><small>${String(row.hours).replace(".", ",")} ore previste</small></span>
        <span class="table-status ${taskStatusClass(row.status)}">${html(row.status)}</span>
      </button>
    `;
  }

  function emptyState(message) {
    return `<div class="daily-empty">${html(message)}</div>`;
  }

  function urgentCard(item) {
    const order = item.order;
    return `
      <button class="urgent-order-row" data-order="${html(order.id)}" type="button">
        <span class="urgent-marker">!</span>
        <span><strong>${html(displayOrderNumber(order, order.id))} · ${html(order.client || "Cliente")}</strong><small>${html(item.reasons.join(" · "))}</small></span>
        <span><strong>${html(item.delivery || "Data da definire")}</strong><small>${html(order.status || "Ordine aperto")}</small></span>
      </button>
    `;
  }

  function ensureStyles() {
    if (document.getElementById("dashboard-daily-control-styles")) return;
    const style = document.createElement("style");
    style.id = "dashboard-daily-control-styles";
    style.textContent = `
      .daily-control-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-bottom:18px}
      .daily-control-kpis .kpi{min-height:126px}.daily-control-kpis .kpi strong{font-size:34px}
      .daily-control-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(330px,.85fr);gap:18px;align-items:start}
      .daily-control-column{display:grid;gap:18px}.daily-task-list,.urgent-order-list{display:grid;gap:9px}
      .daily-task-row,.urgent-order-row{width:100%;border:1px solid var(--line);background:rgba(255,255,255,.72);border-radius:9px;padding:13px 14px;text-align:left;display:grid;grid-template-columns:minmax(230px,1.5fr) minmax(150px,.8fr) auto;gap:14px;align-items:center;cursor:pointer}
      .daily-task-row:hover,.urgent-order-row:hover{border-color:#e50c39;box-shadow:0 8px 24px rgba(17,24,39,.07)}
      .daily-task-row small,.urgent-order-row small{display:block;color:var(--muted);font-size:12px;margin-top:4px}
      .urgent-order-row{grid-template-columns:32px minmax(190px,1fr) auto;background:#fff7ed;border-color:#fdba74}
      .urgent-marker{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#e50c39;color:#fff;font-weight:800}
      .daily-empty{padding:18px;border:1px dashed var(--line);border-radius:9px;color:var(--muted);text-align:center}
      @media(max-width:1180px){.daily-control-kpis{grid-template-columns:repeat(3,1fr)}.daily-control-grid{grid-template-columns:1fr}}
      @media(max-width:720px){.daily-control-kpis{grid-template-columns:repeat(2,1fr)}.daily-task-row,.urgent-order-row{grid-template-columns:1fr}.urgent-marker{display:none}}
    `;
    document.head.appendChild(style);
  }

  renderDashboard = function renderDailyOperationalDashboard() {
    ensureStyles();
    const today = isoToday();
    const rows = taskRows();
    const todayRows = rows.filter((row) => row.plannedDate === today);
    const activeRows = rows.filter(isActive);
    const completedToday = rows.filter((row) => row.finishedDate === today || (row.plannedDate === today && isCompleted(row)));
    const lateRows = rows.filter((row) => row.plannedDate && row.plannedDate < today && !isCompleted(row));
    const toStart = todayRows.filter((row) => !isActive(row) && !isCompleted(row));
    const urgent = urgentOrders(rows);
    const plannedHours = todayRows.reduce((sum, row) => sum + row.hours, 0);
    const productionRows = [...activeRows, ...toStart.filter((row) => !activeRows.some((active) => active.taskId === row.taskId))];

    return `
      <section class="view ${appState.currentView === "dashboard" ? "active" : ""}">
        <div class="screen-header">
          <div><h2>Controllo operativo della giornata</h2><p>Task da eseguire, produzione attiva, lavorazioni concluse e ordini che richiedono attenzione.</p></div>
          <div class="screen-actions"><div class="ghost-pill">Aggiornato alle ${new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</div><button class="action-pill" data-open="calendar">Apri planning settimana</button></div>
        </div>

        <div class="daily-control-kpis">
          <div class="kpi surface"><small>Da avviare oggi</small><strong>${toStart.length}</strong><span>task pronte per la produzione</span></div>
          <div class="kpi surface"><small>In produzione</small><strong>${activeRows.length}</strong><span>task attive o in pausa</span></div>
          <div class="kpi surface"><small>Finite oggi</small><strong>${completedToday.length}</strong><span>lavorazioni completate</span></div>
          <div class="kpi surface"><small>Task in ritardo</small><strong>${lateRows.length}</strong><span>da recuperare nel planning</span></div>
          <div class="kpi surface"><small>Ore pianificate oggi</small><strong>${String(plannedHours).replace(".", ",")}</strong><span>ore complessive assegnate</span></div>
          <div class="kpi surface"><small>Ordini urgenti</small><strong>${urgent.length}</strong><span>priorità, consegne vicine o ritardi</span></div>
        </div>

        <div class="daily-control-grid">
          <div class="daily-control-column">
            <div class="surface"><div class="surface-inner">
              <div class="section-title"><div><h3>Produzione di oggi</h3><p>Task da avviare e lavorazioni già in corso.</p></div><div class="ghost-pill">${productionRows.length} task</div></div>
              <div class="daily-task-list">${productionRows.length ? productionRows.map(taskCard).join("") : emptyState("Nessuna task prevista o in corso oggi.")}</div>
            </div></div>
            <div class="surface"><div class="surface-inner">
              <div class="section-title"><div><h3>Completate oggi</h3><p>Le lavorazioni concluse durante la giornata.</p></div><div class="ghost-pill">${completedToday.length} finite</div></div>
              <div class="daily-task-list">${completedToday.length ? completedToday.map(taskCard).join("") : emptyState("Nessuna task completata oggi.")}</div>
            </div></div>
          </div>
          <div class="surface"><div class="surface-inner">
            <div class="section-title"><div><h3>Ordini urgenti</h3><p>Priorità Express, consegne vicine e task in ritardo.</p></div><div class="ghost-pill">${urgent.length} attenzioni</div></div>
            <div class="urgent-order-list">${urgent.length ? urgent.map(urgentCard).join("") : emptyState("Nessun ordine urgente in questo momento.")}</div>
          </div></div>
        </div>
      </section>
    `;
  };

  const baseRenderAppDailyControl = renderApp;
  renderApp = function renderAppWithDailyControl() {
    baseRenderAppDailyControl();
    if (appState.currentView === "dashboard") ensureStyles();
  };

  if (document.getElementById("app")?.innerHTML) renderApp();
})();
