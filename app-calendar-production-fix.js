(function () {
  let accountsLoaded = false;
  let accountsLoading = false;

  function text(value) {
    return String(value ?? "").trim();
  }

  function normalize(value) {
    return text(value)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function accountName(account) {
    return account?.name || [account?.first_name, account?.last_name].filter(Boolean).join(" ") || account?.email || "";
  }

  function isProductionAccount(account) {
    return Boolean(account && account.is_active !== false && (account.id || account.email || accountName(account)));
  }

  function activeAccounts() {
    const preferred = Array.isArray(appState.calendarActiveAccounts) ? appState.calendarActiveAccounts : [];
    const source = preferred.length ? preferred : appData.accounts || [];
    return source.filter(isProductionAccount);
  }

  function activeAccountNames() {
    return activeAccounts().map(accountName).filter(Boolean);
  }

  function accountById(id) {
    if (!id) return null;
    return activeAccounts().find((account) => String(account.id) === String(id)) || null;
  }

  function accountByName(name) {
    const normalized = normalize(name);
    if (!normalized) return null;
    return activeAccounts().find((account) => normalize(accountName(account)) === normalized) || null;
  }

  function taskRawOwner(task) {
    const team = text(task?.team);
    if (team.includes(" - ")) return team.split(" - ").pop().trim();
    return task?.owner || task?.externalSupplierName || task?.external_supplier_name || team || "";
  }

  function taskOwner(task) {
    const assigned = accountById(task?.assignedUserId || task?.assigned_user_id);
    if (assigned) return accountName(assigned);
    const named = accountByName(taskRawOwner(task));
    return named ? accountName(named) : "Non assegnato";
  }

  function dateOnly(value) {
    const match = text(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : text(value).split(/\s+/)[0];
  }

  async function loadActiveAccounts() {
    if (accountsLoaded || accountsLoading) return;
    accountsLoading = true;
    try {
      const response = await fetch("/api/accounts", { headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.accounts)) return;
      appState.calendarActiveAccounts = payload.accounts.filter(isProductionAccount);
      appData.accounts = payload.accounts.filter(isProductionAccount);
      accountsLoaded = true;
      if (appState.currentView === "calendar") renderApp();
    } catch (error) {
      console.warn("Account calendario non caricati", error);
    } finally {
      accountsLoading = false;
    }
  }

  function safeEscape(value) {
    if (typeof escapeHTML === "function") return escapeHTML(value);
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const getCalendarEmployeesProduction = function getCalendarEmployeesProduction() {
    return ["all", ...activeAccountNames()];
  };

  window.getCalendarEmployees = getCalendarEmployeesProduction;
  try {
    getCalendarEmployees = getCalendarEmployeesProduction;
  } catch (error) {}

  const calendarOrderSyncEmployeesProduction = function calendarOrderSyncEmployeesProduction() {
    return ["all", ...activeAccountNames()];
  };

  window.calendarOrderSyncEmployees = calendarOrderSyncEmployeesProduction;
  try {
    calendarOrderSyncEmployees = calendarOrderSyncEmployeesProduction;
  } catch (error) {}

  const calendarOrderSyncTaskOwnerProduction = function calendarOrderSyncTaskOwnerProduction(task) {
    return taskOwner(task);
  };

  window.calendarOrderSyncTaskOwner = calendarOrderSyncTaskOwnerProduction;
  try {
    calendarOrderSyncTaskOwner = calendarOrderSyncTaskOwnerProduction;
  } catch (error) {}

  const calendarWorklogAssigneeProduction = function calendarWorklogAssigneeProduction(task) {
    return taskOwner(task);
  };

  window.calendarWorklogAssignee = calendarWorklogAssigneeProduction;
  try {
    calendarWorklogAssignee = calendarWorklogAssigneeProduction;
  } catch (error) {}

  if (typeof saveTaskAssignment === "function") {
    const baseSaveTaskAssignment = saveTaskAssignment;
    saveTaskAssignment = async function saveTaskAssignmentProductionFix() {
      const draft = appState.assignmentDraft || {};
      const originalDate = draft.plannedDate;
      const plannedTime = text(draft.plannedTime);
      if (originalDate && plannedTime) {
        draft.plannedDate = `${dateOnly(originalDate)} ${plannedTime}`.trim();
      }
      return baseSaveTaskAssignment();
    };
  }

  function parseHours(value) {
    const parsed = Number(text(value).replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function formatHours(value) {
    const rounded = Math.round(Number(value || 0) * 100) / 100;
    return `${String(rounded).replace(".", ",")} h`;
  }

  function formatDuration(ms) {
    if (typeof calendarWorklogFormatDuration === "function") return calendarWorklogFormatDuration(ms);
    const minutes = Math.max(0, Math.round(Number(ms || 0) / 60000));
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes} min`;
  }

  function worklogRows() {
    if (typeof calendarWorklogAllTasks !== "function" || typeof calendarWorklogSessionFor !== "function") return [];
    return calendarWorklogAllTasks().map(({ orderId, order, task, taskId }) => {
      const session = calendarWorklogSessionFor(taskId);
      const runtime = typeof calendarWorklogRuntime === "function" ? calendarWorklogRuntime(session) : Number(session?.elapsedMs || 0);
      const planned = parseHours(task?.estimated_hours || task?.estimatedHours || task?.hours);
      const worked = Math.round((runtime / 3600000) * 100) / 100;
      return {
        orderId,
        client: order?.client || "Cliente",
        task: task?.name || task?.task_name || "Task ordine",
        assignee: taskOwner(task),
        planned,
        worked,
        delta: Math.round((worked - planned) * 100) / 100,
        status: session?.status || task?.status || "Da avviare",
      };
    });
  }

  function reportPanel() {
    const rows = worklogRows().filter((row) => row.assignee !== "Non assegnato" || row.worked > 0 || row.planned > 0);
    const totalPlanned = rows.reduce((sum, row) => sum + row.planned, 0);
    const totalWorkedMs = rows.reduce((sum, row) => sum + row.worked * 3600000, 0);
    const body = rows
      .slice(0, 8)
      .map((row) => {
        const deltaClass = row.delta > 0 ? "hold" : "done";
        return `<div class="calendar-production-report-row">
          <div><strong>#${row.orderId} - ${safeEscape(row.task)}</strong><span>${safeEscape(row.client)} · ${safeEscape(row.assignee)}</span></div>
          <div><small>Previste</small><strong>${formatHours(row.planned)}</strong></div>
          <div><small>Lavorate</small><strong>${formatHours(row.worked)}</strong></div>
          <div><span class="table-status ${deltaClass}">${row.delta > 0 ? "+" : ""}${formatHours(row.delta)}</span></div>
        </div>`;
      })
      .join("");

    return `<div class="surface calendar-production-report"><div class="surface-inner">
      <div class="section-title">
        <div><h3>Report tempi sarte</h3><p>Riepilogo rapido ore previste, ore lavorate e scostamento per task.</p></div>
        <div class="ghost-pill">${formatHours(totalPlanned)} previste · ${formatDuration(totalWorkedMs)} lavorate</div>
      </div>
      <div class="calendar-production-report-list">${body || `<div class="empty-state">Nessuna lavorazione registrata per il report tempi.</div>`}</div>
    </div></div>`;
  }

  function ensureStyles() {
    if (document.getElementById("calendar-production-fix-styles")) return;
    const style = document.createElement("style");
    style.id = "calendar-production-fix-styles";
    style.textContent = `.calendar-production-report{margin-bottom:16px}.calendar-production-report-list{display:grid;gap:10px}.calendar-production-report-row{display:grid;grid-template-columns:minmax(220px,1.5fr) minmax(95px,.6fr) minmax(95px,.6fr) minmax(95px,.6fr);gap:12px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.58)}.calendar-production-report-row span,.calendar-production-report-row small{display:block;color:var(--muted);font-size:12px;margin-top:3px}@media(max-width:960px){.calendar-production-report-row{grid-template-columns:1fr 1fr}.calendar-production-report .ghost-pill{white-space:normal}}`;
    document.head.appendChild(style);
  }

  if (typeof renderCalendar === "function") {
    const baseRenderCalendar = renderCalendar;
    renderCalendar = function renderCalendarProductionFix() {
      loadActiveAccounts();
      const html = baseRenderCalendar();
      const marker = `<div class="surface worklog-panel">`;
      return html.includes(marker) ? html.replace(marker, `${reportPanel()}${marker}`) : `${reportPanel()}${html}`;
    };
  }

  if (typeof renderApp === "function") {
    const baseRenderApp = renderApp;
    renderApp = function renderAppProductionFix() {
      ensureStyles();
      baseRenderApp();
    };
  }

  loadActiveAccounts();
  if (document.getElementById("app")?.innerHTML) renderApp();
})();
