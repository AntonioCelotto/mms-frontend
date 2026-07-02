(function () {
  const AI_REPORT_DEFAULT_WAGE = 10;
  const AI_REPORT_DEFAULT_EMPLOYEE_COSTS = {
    olga: "10",
    roberta: "12",
    eleonora: "15",
  };

  function ensureAIReportState() {
    if (!appState.aiReport || typeof appState.aiReport !== "object") {
      appState.aiReport = { period: "month", hourlyCost: String(AI_REPORT_DEFAULT_WAGE), employeeCosts: {}, employee: "all", untilDate: "", lastCalculatedAt: "", focus: "all" };
    }
    if (!appState.aiReport.period) appState.aiReport.period = "month";
    if (!appState.aiReport.hourlyCost) appState.aiReport.hourlyCost = String(AI_REPORT_DEFAULT_WAGE);
    if (!appState.aiReport.employeeCosts || typeof appState.aiReport.employeeCosts !== "object") appState.aiReport.employeeCosts = {};
    if (!appState.aiReport.employee) appState.aiReport.employee = "all";
    if (!appState.aiReport.focus) appState.aiReport.focus = "all";
  }

  function defaultEmployeeCost(owner) {
    const name = String(owner || "").toLowerCase();
    const match = Object.entries(AI_REPORT_DEFAULT_EMPLOYEE_COSTS).find(([key]) => name.includes(key));
    return match?.[1] || "";
  }

  function html(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function numberValue(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return 0;
    let cleaned = raw.replace(/[^\d,.-]/g, "");
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma >= 0 && lastDot >= 0) {
      cleaned = lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
    } else if (lastComma >= 0) {
      cleaned = cleaned.replace(",", ".");
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function money(value) {
    return `${numberValue(value).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
  }

  function percent(value) {
    return `${Math.round(Number(value) || 0)}%`;
  }

  function parseHours(value) {
    const raw = String(value ?? "").toLowerCase();
    if (!raw || raw.includes("n/d")) return 0;
    const hMatch = raw.match(/(\d+(?:[,.]\d+)?)\s*h/);
    const mMatch = raw.match(/(\d+(?:[,.]\d+)?)\s*m/);
    if (hMatch || mMatch) return numberValue(hMatch?.[1] || 0) + numberValue(mMatch?.[1] || 0) / 60;
    return numberValue(raw);
  }

  function italianDate(value) {
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw) return null;
    const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const slash = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (slash) {
      const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
      return new Date(year, Number(slash[2]) - 1, Number(slash[1]));
    }
    const months = {
      gennaio: 0,
      gen: 0,
      febbraio: 1,
      feb: 1,
      marzo: 2,
      mar: 2,
      aprile: 3,
      apr: 3,
      maggio: 4,
      mag: 4,
      giugno: 5,
      giu: 5,
      luglio: 6,
      lug: 6,
      agosto: 7,
      ago: 7,
      settembre: 8,
      set: 8,
      ottobre: 9,
      ott: 9,
      novembre: 10,
      nov: 10,
      dicembre: 11,
      dic: 11,
    };
    const text = raw.match(/(\d{1,2})\s+([a-z']+)(?:\s+(\d{4}))?/);
    if (text && Object.prototype.hasOwnProperty.call(months, text[2])) {
      return new Date(Number(text[3] || new Date().getFullYear()), months[text[2]], Number(text[1]));
    }
    return null;
  }

  function dateTime(value) {
    const parsed = italianDate(value);
    return parsed && Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
  }

  function allOrders() {
    return Array.isArray(appData?.orders) ? appData.orders : [];
  }

  function allTasks() {
    if (typeof calendarWorklogAllTasks === "function") return calendarWorklogAllTasks();
    return Object.entries(appData?.orderTasks || {}).flatMap(([orderId, tasks]) => {
      const order = allOrders().find((item) => Number(item.id) === Number(orderId));
      return (Array.isArray(tasks) ? tasks : []).map((task, index) => ({
        orderId: Number(orderId),
        order,
        task,
        taskId: task.id || `task-${orderId}-${index}`,
      }));
    });
  }

  function taskOwner(task) {
    if (typeof calendarWorklogAssignee === "function") return calendarWorklogAssignee(task);
    const raw = task?.team || task?.owner || task?.assigned_to || "Da assegnare";
    return String(raw).split(" - ").pop().trim() || "Da assegnare";
  }

  function taskPhase(task) {
    return task?.phase || task?.task_phase || task?.name || task?.task_name || "Lavorazione";
  }

  function taskName(task) {
    return task?.name || task?.task_name || taskPhase(task);
  }

  function taskStatus(task, worklog) {
    return worklog?.status || task?.state || task?.status || "Da avviare";
  }

  function taskPlannedHours(task) {
    return parseHours(task?.hours || task?.estimated_hours || task?.estimatedHours || task?.workHours);
  }

  function taskDate(row) {
    return dateTime(row.task?.time || row.task?.planned_date || row.order?.orderDate || row.order?.order_date || row.order?.estimatedDelivery || row.order?.estimated_delivery_date);
  }

  function worklogs() {
    if (typeof calendarWorklogRead !== "function") return {};
    return calendarWorklogRead() || {};
  }

  function worklogHours(taskId) {
    const log = worklogs()[taskId];
    if (!log) return 0;
    const ms = typeof calendarWorklogRuntime === "function" ? calendarWorklogRuntime(log) : Number(log.elapsedMs || log.elapsed_ms || 0);
    return Math.max(0, Number(ms || 0) / 3600000);
  }

  function paymentRows() {
    const stateRows = Array.isArray(appState.realClientPayments) ? appState.realClientPayments : [];
    const selectedRows = Array.isArray(appState.selectedOrderPayments) ? appState.selectedOrderPayments : [];
    const dataRows = Array.isArray(appData?.payments) ? appData.payments : [];
    return [...stateRows, ...selectedRows, ...dataRows];
  }

  function orderDbId(order) {
    return Number(order?.db_id || order?.id || order?.order_number || 0);
  }

  function paymentOrderId(payment) {
    return Number(payment?.order_id || payment?.orderId || 0);
  }

  function orderRevenue(order) {
    const id = orderDbId(order);
    const payments = paymentRows().filter((payment) => paymentOrderId(payment) === id || Number(payment.orderId) === Number(order?.id));
    const totalPayments = payments.reduce((sum, payment) => sum + numberValue(payment.amount || payment.total || payment.value), 0);
    if (totalPayments) return totalPayments;
    return numberValue(order?.total || order?.quote_total || order?.price || order?.amount || order?.revenue);
  }

  function materialCostForOrder(order) {
    const rows = appData?.orderMaterials?.[Number(order?.id)] || appData?.orderMaterials?.[orderDbId(order)] || [];
    return (Array.isArray(rows) ? rows : []).reduce((sum, material) => {
      const unit = numberValue(material.unit_cost || material.cost || material.price || material.purchase_price);
      const quantity = numberValue(material.quantity_required || material.quantity || material.qty || 1) || 1;
      return sum + unit * quantity;
    }, 0);
  }

  function latestDataDate(rows) {
    const candidates = [
      ...allOrders().map((order) => dateTime(order.orderDate || order.order_date || order.estimatedDelivery || order.estimated_delivery_date || order.eta)),
      ...rows.map(taskDate),
      ...paymentRows().map((payment) => dateTime(payment.created_at || payment.due_date || payment.paid_date || payment.due)),
    ].filter((value) => value !== null);
    return candidates.length ? Math.max(...candidates) : Date.now();
  }

  function dateInputValue(time) {
    const date = new Date(time || Date.now());
    if (!Number.isFinite(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function periodStart(anchor, period) {
    const date = new Date(anchor);
    if (period === "quarter") date.setMonth(date.getMonth() - 3);
    else if (period === "semester") date.setMonth(date.getMonth() - 6);
    else if (period === "year") date.setFullYear(date.getFullYear() - 1);
    else date.setMonth(date.getMonth() - 1);
    return date.getTime();
  }

  function periodLabel(period) {
    return {
      month: "Mensile",
      quarter: "Trimestrale",
      semester: "Semestrale",
      year: "Annuale",
    }[period] || "Mensile";
  }

  function stateClass(status) {
    return typeof getStatusClass === "function" ? getStatusClass(String(status || "")) : "progress";
  }

  function reportRows() {
    ensureAIReportState();
    const tasks = allTasks();
    const detectedAnchor = latestDataDate(tasks);
    if (!appState.aiReport.untilDate) appState.aiReport.untilDate = dateInputValue(detectedAnchor);
    const customAnchor = dateTime(appState.aiReport.untilDate);
    const anchor = customAnchor || detectedAnchor;
    const start = periodStart(anchor, appState.aiReport.period);
    const orderRows = allOrders().filter((order) => {
      const when = dateTime(order.orderDate || order.order_date || order.estimatedDelivery || order.estimated_delivery_date || order.eta);
      return when === null || when >= start;
    });
    const orderIds = new Set(orderRows.map((order) => Number(order.id)));
    const taskRows = tasks.filter((row) => {
      const when = taskDate(row);
      const byEmployee = appState.aiReport.employee === "all" || taskOwner(row.task) === appState.aiReport.employee;
      return byEmployee && orderIds.has(Number(row.orderId)) && (when === null || when >= start);
    });
    return { anchor, start, orders: orderRows, tasks: taskRows, wage: numberValue(appState.aiReport.hourlyCost) || AI_REPORT_DEFAULT_WAGE };
  }

  function employeeHourlyCost(owner, fallbackWage) {
    ensureAIReportState();
    const custom = numberValue(appState.aiReport.employeeCosts[owner]);
    const preset = numberValue(defaultEmployeeCost(owner));
    return custom || preset || fallbackWage || AI_REPORT_DEFAULT_WAGE;
  }

  function employeeReport() {
    const { tasks, wage, anchor } = reportRows();
    const byEmployee = new Map();
    tasks.forEach((row) => {
      const owner = taskOwner(row.task);
      const worklog = worklogs()[row.taskId];
      const planned = taskPlannedHours(row.task);
      const worked = worklogHours(row.taskId);
      const effective = worked || planned;
      const status = taskStatus(row.task, worklog);
      const due = taskDate(row);
      const late = !String(status).toLowerCase().includes("complet") && due !== null && due < anchor;
      if (!byEmployee.has(owner)) {
        byEmployee.set(owner, { owner, hourlyCost: employeeHourlyCost(owner, wage), planned: 0, worked: 0, cost: 0, completed: 0, late: 0, tasks: 0, phases: new Map() });
      }
      const rowData = byEmployee.get(owner);
      rowData.planned += planned;
      rowData.worked += effective;
      rowData.cost += effective * rowData.hourlyCost;
      rowData.tasks += 1;
      if (String(status).toLowerCase().includes("complet")) rowData.completed += 1;
      if (late) rowData.late += 1;
      const phase = taskPhase(row.task);
      rowData.phases.set(phase, (rowData.phases.get(phase) || 0) + 1);
    });
    return Array.from(byEmployee.values()).map((row) => {
      const hoursBase = row.planned || row.worked || 1;
      const efficiency = Math.max(0, Math.min(120, ((row.planned || row.worked) / Math.max(row.worked, 0.1)) * 100));
      const completion = row.tasks ? (row.completed / row.tasks) * 100 : 0;
      const score = Math.round(Math.max(0, Math.min(100, efficiency * 0.55 + completion * 0.35 - row.late * 8 + (row.worked <= hoursBase ? 8 : 0))));
      return {
        ...row,
        score,
        grade: score >= 85 ? "Ottima" : score >= 70 ? "Buona" : score >= 55 ? "Da monitorare" : "Critica",
        mainPhase: Array.from(row.phases.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "Lavorazione",
      };
    }).sort((a, b) => b.score - a.score);
  }

  function orderReport() {
    const { orders, tasks, wage } = reportRows();
    return orders.map((order) => {
      const relatedTasks = tasks.filter((row) => Number(row.orderId) === Number(order.id));
      let laborCost = 0;
      const hours = relatedTasks.reduce((sum, row) => {
        const worked = worklogHours(row.taskId);
        const effective = worked || taskPlannedHours(row.task);
        laborCost += effective * employeeHourlyCost(taskOwner(row.task), wage);
        return sum + effective;
      }, 0);
      const materialCost = materialCostForOrder(order);
      const revenue = orderRevenue(order);
      const margin = revenue - laborCost - materialCost;
      return {
        order,
        tasks: relatedTasks.length,
        hours,
        laborCost,
        materialCost,
        revenue,
        margin,
        marginRate: revenue ? (margin / revenue) * 100 : 0,
      };
    }).sort((a, b) => a.margin - b.margin);
  }

  function aiSuggestions(employees, orders) {
    const negative = orders.filter((row) => row.revenue && row.margin < 0);
    const lowMargin = orders.filter((row) => row.revenue && row.margin >= 0 && row.marginRate < 20);
    const criticalPeople = employees.filter((row) => row.score < 60);
    const suggestions = [];
    if (negative.length) suggestions.push(`${negative.length} ordini risultano in perdita sui dati registrati: controllare prezzo preventivo, ore e materiali.`);
    if (lowMargin.length) suggestions.push(`${lowMargin.length} ordini sono positivi ma con margine basso: suggerito aumentare preventivo o ridurre ore previste.`);
    if (criticalPeople.length) suggestions.push(`${criticalPeople.length} operatrici sono da monitorare per ore, completamento o ritardi.`);
    const noRevenue = orders.filter((row) => !row.revenue).length;
    if (noRevenue) suggestions.push(`${noRevenue} ordini non hanno ancora ricavo numerico: per un report economico preciso serve importo preventivo o pagamento registrato.`);
    if (!suggestions.length) suggestions.push("Il periodo selezionato non mostra criticita' economiche evidenti sui dati registrati.");
    suggestions.push("Usare questo report come controllo direzionale: l'AI segnala priorita', ma la decisione resta alla direzione.");
    return suggestions;
  }

  function renderAIEmployeeRows(rows) {
    if (!rows.length) return `<tr><td colspan="9"><div class="empty-state">Nessuna lavorazione nel periodo selezionato.</div></td></tr>`;
    return rows.map((row) => `
      <tr>
        <td><strong>${html(row.owner)}</strong><div class="muted">${html(row.mainPhase)}</div></td>
        <td><input class="field-value ai-report-employee-cost" data-ai-report-employee-cost="${encodeURIComponent(row.owner)}" inputmode="decimal" value="${html(appState.aiReport.employeeCosts[row.owner] || defaultEmployeeCost(row.owner) || row.hourlyCost || "")}" /></td>
        <td>${row.tasks}</td>
        <td>${row.completed}</td>
        <td>${row.late}</td>
        <td>${row.planned.toFixed(1)} h</td>
        <td>${row.worked.toFixed(1)} h</td>
        <td>${money(row.cost)}</td>
        <td><span class="table-status ${row.score >= 70 ? "done" : row.score >= 55 ? "hold" : "progress"}">${row.grade} ${row.score}/100</span></td>
      </tr>
    `).join("");
  }

  function renderAIOrderRows(rows) {
    if (!rows.length) return `<tr><td colspan="8"><div class="empty-state">Nessun ordine nel periodo selezionato.</div></td></tr>`;
    return rows.slice(0, 12).map((row) => `
      <tr>
        <td>#${html(row.order.id)}</td>
        <td><strong>${html(row.order.client)}</strong><div class="muted">${html(row.order.category || "")}</div></td>
        <td>${row.tasks}</td>
        <td>${row.hours.toFixed(1)} h</td>
        <td>${money(row.revenue)}</td>
        <td>${money(row.laborCost)}</td>
        <td>${money(row.materialCost)}</td>
        <td><span class="table-status ${row.revenue && row.margin >= 0 ? "done" : row.revenue ? "progress" : "hold"}">${row.revenue ? money(row.margin) : "Ricavo mancante"}</span></td>
      </tr>
    `).join("");
  }

  function renderAIReport() {
    ensureAIReportState();
    const allEmployees = Array.from(new Set(allTasks().map((row) => taskOwner(row.task)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const report = reportRows();
    const employees = employeeReport();
    const orders = orderReport();
    const totalRevenue = orders.reduce((sum, row) => sum + row.revenue, 0);
    const totalLabor = orders.reduce((sum, row) => sum + row.laborCost, 0);
    const totalMaterials = orders.reduce((sum, row) => sum + row.materialCost, 0);
    const totalMargin = totalRevenue - totalLabor - totalMaterials;
    const completedTasks = report.tasks.filter((row) => String(taskStatus(row.task, worklogs()[row.taskId])).toLowerCase().includes("complet")).length;
    const suggestions = aiSuggestions(employees, orders);
    const anchorLabel = new Date(report.anchor).toLocaleDateString("it-IT");

    return `
      <section class="view ${appState.currentView === "ai-assistant" ? "active" : ""}">
        <div class="screen-header">
          <div>
            <h2>Assistente AI - Report direzione</h2>
            <p>Controllo lavoro, ore, operatrici, ordini e margini per la direzione.</p>
          </div>
          <div class="screen-actions">
            <div class="ghost-pill">Report direzione</div>
            <div class="ghost-pill">Periodo: ${periodLabel(appState.aiReport.period)}</div>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="filter-row ai-report-filters">
              <select class="filter-chip" data-ai-report-field="period">
                ${[
                  ["month", "Mensile"],
                  ["quarter", "Trimestrale"],
                  ["semester", "Semestrale"],
                  ["year", "Annuale"],
                ].map(([value, label]) => `<option value="${value}" ${appState.aiReport.period === value ? "selected" : ""}>${label}</option>`).join("")}
              </select>
              <label class="filter-chip ai-report-cost">Costo ora <input data-ai-report-field="hourlyCost" inputmode="decimal" value="${html(appState.aiReport.hourlyCost)}" /></label>
              <label class="filter-chip ai-report-cost">Fino al <input type="date" data-ai-report-field="untilDate" value="${html(appState.aiReport.untilDate || dateInputValue(report.anchor))}" /></label>
              <select class="filter-chip" data-ai-report-field="employee">
                <option value="all" ${appState.aiReport.employee === "all" ? "selected" : ""}>Tutte le operatrici</option>
                ${allEmployees.map((employee) => `<option value="${html(employee)}" ${appState.aiReport.employee === employee ? "selected" : ""}>${html(employee)}</option>`).join("")}
              </select>
              <div class="filter-chip">Costo standard: ${money(report.wage)} / ora</div>
              <button class="action-pill" data-ai-report-calculate type="button">Calcola report</button>
            </div>
            <div class="muted ai-report-feedback">
              ${appState.aiReport.lastCalculatedAt ? `Ultimo calcolo: ${html(appState.aiReport.lastCalculatedAt)}. Periodo fino al ${anchorLabel}.` : `Imposta periodo, data, costo o operatrice e premi Calcola report.`}
            </div>
          </div>
        </div>

        <div class="metric-boxes">
          <div class="metric-box surface"><small>Ordini periodo</small><strong>${report.orders.length}</strong><span>${orders.filter((row) => row.revenue && row.margin < 0).length} in perdita stimata</span></div>
          <div class="metric-box surface"><small>Task analizzati</small><strong>${report.tasks.length}</strong><span>${completedTasks} completati nel periodo</span></div>
          <div class="metric-box surface"><small>Costo lavoro</small><strong>${money(totalLabor)}</strong><span>Calcolato con ${money(report.wage)} / ora</span></div>
          <div class="metric-box surface"><small>Margine stimato</small><strong>${money(totalMargin)}</strong><span>${totalRevenue ? percent((totalMargin / totalRevenue) * 100) : "Ricavi da completare"} sui ricavi registrati</span></div>
        </div>

        <div class="layout-2 ai-report-layout">
          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div><h3>Valutazione operatrici</h3><p>Ore previste, ore lavorate, task e grado di valutazione.</p></div>
              </div>
              <table>
                <thead><tr><th>Operatrice</th><th>Costo ora</th><th>Task</th><th>Completati</th><th>Ritardi</th><th>Ore previste</th><th>Ore lavoro</th><th>Costo</th><th>Valutazione</th></tr></thead>
                <tbody>${renderAIEmployeeRows(employees)}</tbody>
              </table>
            </div>
          </div>

          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div><h3>Suggerimenti AI</h3><p>Priorita' operative calcolate sui dati registrati.</p></div>
              </div>
              <div class="alert-list">
                ${suggestions.map((item) => `<div class="alert-item"><strong>Controllo</strong><span>${html(item)}</span></div>`).join("")}
              </div>
            </div>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div><h3>Ordini: guadagno o perdita</h3><p>Confronto tra ricavi registrati, ore di lavoro e costi materiale se disponibili.</p></div>
            </div>
            <table>
              <thead><tr><th>Ordine</th><th>Cliente</th><th>Task</th><th>Ore</th><th>Ricavo</th><th>Costo lavoro</th><th>Materiali</th><th>Margine</th></tr></thead>
              <tbody>${renderAIOrderRows(orders)}</tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  function ensureAIReportStyles() {
    if (document.getElementById("ai-report-styles")) return;
    const style = document.createElement("style");
    style.id = "ai-report-styles";
    style.textContent = `
      .ai-report-filters { grid-template-columns: minmax(140px,.7fr) minmax(150px,.7fr) minmax(170px,.75fr) minmax(190px,.9fr) minmax(190px,1fr) auto; }
      .ai-report-cost { gap: 8px; }
      .ai-report-cost input { width: 90px; border: 0; background: transparent; outline: none; color: var(--text); }
      .ai-report-cost input[type="date"] { width: 132px; }
      .ai-report-employee-cost { max-width: 92px; min-height: 34px; padding: 8px 10px; }
      .ai-report-feedback { margin-top: 10px; }
      .ai-report-layout { grid-template-columns: minmax(0,1.35fr) minmax(320px,.75fr); }
      @media (max-width: 1180px) {
        .ai-report-filters, .ai-report-layout { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function collectAIReportFormValues() {
    ensureAIReportState();
    document.querySelectorAll("[data-ai-report-field]").forEach((input) => {
      appState.aiReport[input.dataset.aiReportField] = input.value;
    });
    document.querySelectorAll("[data-ai-report-employee-cost]").forEach((input) => {
      appState.aiReport.employeeCosts[decodeURIComponent(input.dataset.aiReportEmployeeCost)] = input.value;
    });
  }

  const baseRenderAIReport = typeof renderAI === "function" ? renderAI : null;
  if (baseRenderAIReport) {
    renderAI = function renderAIReportingDashboard() {
      return renderAIReport();
    };
  }

  document.addEventListener("input", (event) => {
    const field = event.target?.dataset?.aiReportField;
    const employee = event.target?.dataset?.aiReportEmployeeCost;
    if (!field && !employee) return;
    ensureAIReportState();
    if (employee) appState.aiReport.employeeCosts[decodeURIComponent(employee)] = event.target.value;
    else appState.aiReport[field] = event.target.value;
  }, true);

  document.addEventListener("change", (event) => {
    const field = event.target?.dataset?.aiReportField;
    const employee = event.target?.dataset?.aiReportEmployeeCost;
    if (!field && !employee) return;
    ensureAIReportState();
    if (employee) appState.aiReport.employeeCosts[decodeURIComponent(employee)] = event.target.value;
    else {
      appState.aiReport[field] = event.target.value;
      if (["period", "employee", "untilDate"].includes(field)) renderApp();
    }
  }, true);

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-ai-report-calculate]");
    if (!button) return;
    event.preventDefault();
    ensureAIReportState();
    collectAIReportFormValues();
    appState.aiReport.lastCalculatedAt = new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
    renderApp();
  }, true);

  const baseRenderAppAIReport = renderApp;
  renderApp = function renderAppAIReport() {
    ensureAIReportState();
    ensureAIReportStyles();
    baseRenderAppAIReport();
  };

  ensureAIReportState();
  if (document.getElementById("app")?.innerHTML) renderApp();
})();