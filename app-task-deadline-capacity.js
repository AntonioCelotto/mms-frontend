(function () {
  const DAY_KEYS = ["domenica", "lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato"];
  const DEFAULT_DAYS = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi"];
  const DEFAULT_HOURS = 8;

  function text(value) {
    return String(value ?? "").trim();
  }

  function normalize(value) {
    return text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  }

  function numberValue(value) {
    const parsed = Number(text(value).replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function parseDate(value) {
    const match = text(value).match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) return null;
    const date = new Date(`${match[1]}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(date, amount) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    copy.setDate(copy.getDate() + amount);
    return copy;
  }

  function today() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  }

  function accountName(account) {
    return account?.name || account?.displayName || [account?.first_name, account?.last_name].filter(Boolean).join(" ") || account?.email || "Operatrice";
  }

  function accountFor(assignedUserId) {
    return (appData.accounts || []).find((account) => String(account.id) === String(assignedUserId)) || null;
  }

  function workingDays(account) {
    const raw = account?.working_days || account?.workingDays;
    const values = Array.isArray(raw) ? raw : text(raw).split(",");
    const normalized = values.map(normalize).filter(Boolean);
    return new Set(normalized.length ? normalized : DEFAULT_DAYS);
  }

  function dailyHours(account) {
    return numberValue(account?.daily_work_hours || account?.dailyWorkHours) || DEFAULT_HOURS;
  }

  function isWorkingDay(date, days) {
    return days.has(DAY_KEYS[date.getDay()]);
  }

  function sameAssignee(task, assignedUserId) {
    return String(task?.assignedUserId || task?.assigned_user_id || "") === String(assignedUserId || "");
  }

  function isCompleted(task) {
    return normalize(task?.state || task?.status).includes("complet");
  }

  function otherWorkload(candidate, deadline) {
    const uniqueTasks = new Map();
    const addTask = (task, fallbackKey) => {
      const id = text(task?.id);
      const key = id || fallbackKey;
      if (key) uniqueTasks.set(key, task);
    };
    let total = 0;
    Object.entries(appData.orderTasks || {}).forEach(([orderId, tasks]) => {
      (Array.isArray(tasks) ? tasks : []).forEach((task, index) => addTask(task, `database-${orderId}-${index}`));
    });
    const draft = currentDraft();
    (Array.isArray(draft?.tasks) ? draft.tasks : []).forEach((task, index) => addTask(task, `draft-${index}`));
    uniqueTasks.forEach((task) => {
      if (!sameAssignee(task, candidate.assignedUserId) || isCompleted(task)) return;
      if (candidate.id && String(task.id || "") === String(candidate.id)) return;
      const taskDeadline = parseDate(task.time || task.planned_date);
      if (!taskDeadline || taskDeadline > deadline) return;
      total += numberValue(task.hours || task.estimated_hours || task.estimatedHours);
    });
    return total;
  }

  function capacityUntil(deadline, account) {
    const days = workingDays(account);
    const perDay = dailyHours(account);
    let cursor = today();
    let capacity = 0;
    let guard = 0;
    while (cursor <= deadline && guard < 366) {
      if (isWorkingDay(cursor, days)) capacity += perDay;
      cursor = addDays(cursor, 1);
      guard += 1;
    }
    return capacity;
  }

  function firstPossibleDate(requiredHours, account) {
    const days = workingDays(account);
    const perDay = dailyHours(account);
    let cursor = today();
    let capacity = 0;
    let guard = 0;
    while (guard < 732) {
      if (isWorkingDay(cursor, days)) capacity += perDay;
      if (capacity + 0.0001 >= requiredHours) return isoDate(cursor);
      cursor = addDays(cursor, 1);
      guard += 1;
    }
    return "";
  }

  function formatDate(value) {
    const date = parseDate(value);
    return date ? date.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" }) : value;
  }

  function checkTask(task) {
    const assignedUserId = task?.assignedUserId || task?.assigned_user_id || "";
    const hours = numberValue(task?.hours || task?.estimated_hours || task?.estimatedHours);
    const deadline = parseDate(task?.time || task?.planned_date);
    if (!assignedUserId || !hours || !deadline) return { state: "neutral" };

    const account = accountFor(assignedUserId);
    const otherHours = otherWorkload({ ...task, assignedUserId }, deadline);
    const capacity = capacityUntil(deadline, account);
    const freeHours = Math.max(0, capacity - otherHours);
    const possible = hours <= freeHours + 0.0001;
    const firstDate = possible ? isoDate(deadline) : firstPossibleDate(otherHours + hours, account);
    return {
      state: possible ? "ok" : "error",
      operator: accountName(account),
      freeHours,
      firstDate,
      deadline: isoDate(deadline),
    };
  }

  function warningMarkup(result, index) {
    if (result.state === "neutral") {
      return '<div class="task-capacity-note neutral">Assegna operatrice, ore e data di consegna per verificare la disponibilità.</div>';
    }
    if (result.state === "ok") {
      return `<div class="task-capacity-note ok"><strong>Consegna possibile entro il ${formatDate(result.deadline)}.</strong><span>${result.operator}: ${String(result.freeHours).replace(".", ",")} ore disponibili prima di questa task.</span></div>`;
    }
    return `<div class="task-capacity-note error"><div><strong>Consegna non possibile entro il ${formatDate(result.deadline)}.</strong><span>${result.operator} ha già il calendario pieno. Prima data disponibile: ${formatDate(result.firstDate)}.</span></div><button class="mini-btn" type="button" data-task-use-first-date="${index}" data-first-date="${result.firstDate}">Usa prima data disponibile</button></div>`;
  }

  function currentDraft() {
    return typeof orderDetailEditCurrentDraft === "function" ? orderDetailEditCurrentDraft() : null;
  }

  function refreshWarnings() {
    if (appState.currentView !== "order-detail") return;
    const draft = currentDraft();
    if (!draft || !Array.isArray(draft.tasks)) return;
    document.querySelectorAll(".order-detail-edit-task").forEach((row, index) => {
      let note = row.querySelector(".task-capacity-note");
      const html = warningMarkup(checkTask(draft.tasks[index]), index);
      if (note) note.outerHTML = html;
      else row.insertAdjacentHTML("beforeend", html);
    });
  }

  function ensureStyles() {
    if (document.getElementById("task-deadline-capacity-styles")) return;
    const style = document.createElement("style");
    style.id = "task-deadline-capacity-styles";
    style.textContent = `
      .task-capacity-note{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 13px;border-radius:8px;border:1px solid var(--line);font-size:14px}
      .task-capacity-note strong,.task-capacity-note span{display:block}
      .task-capacity-note span{margin-top:3px;font-size:13px}
      .task-capacity-note.ok{background:#ecfdf3;border-color:#86efac;color:#166534}
      .task-capacity-note.error{background:#fff1f2;border-color:#fda4af;color:#9f1239}
      .task-capacity-note.neutral{background:#f8fafc;color:var(--muted)}
      .task-capacity-note.error .mini-btn{flex:0 0 auto;background:#fff}
      @media(max-width:760px){.task-capacity-note{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  const baseRenderAppCapacity = renderApp;
  renderApp = function renderAppWithTaskCapacity() {
    baseRenderAppCapacity();
    ensureStyles();
    refreshWarnings();
  };

  const baseAttachEventsCapacity = attachEvents;
  attachEvents = function attachEventsWithTaskCapacity() {
    baseAttachEventsCapacity();
    document.querySelectorAll("[data-order-detail-task-field='assignedUserId'],[data-order-detail-task-field='time'],[data-order-detail-task-field='hours']").forEach((input) => {
      input.addEventListener("input", refreshWarnings);
      input.addEventListener("change", refreshWarnings);
    });
    document.querySelectorAll("[data-task-use-first-date]").forEach((button) => {
      button.addEventListener("click", () => {
        const draft = currentDraft();
        const index = Number(button.dataset.taskUseFirstDate);
        const firstDate = button.dataset.firstDate || "";
        if (!draft?.tasks?.[index] || !firstDate) return;
        draft.tasks[index].time = firstDate;
        const input = document.querySelector(`[data-order-detail-task-index="${index}"][data-order-detail-task-field="time"]`);
        if (input) input.value = firstDate;
        refreshWarnings();
        if (typeof setFlashMessage === "function") setFlashMessage(`Data aggiornata al ${formatDate(firstDate)}`);
      });
    });
  };

  if (document.getElementById("app")?.innerHTML) renderApp();
})();
