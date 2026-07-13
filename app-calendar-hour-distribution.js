(function () {
  const DAY_KEYS = ["domenica", "lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato"];
  const DEFAULT_WORKING_DAYS = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi"];
  const DEFAULT_DAILY_HOURS = 8;
  let accountScheduleLoadStarted = false;

  function text(value) {
    return String(value ?? "").trim();
  }

  function numberValue(value) {
    const raw = text(value).replace(",", ".");
    const parsed = Number(raw.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function parseDate(value) {
    const match = text(value).match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
    if (!match) return null;
    const date = new Date(`${match[1]}T12:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return { date, iso: match[1], time: match[2] || "" };
  }

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function addDays(date, days) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function normalizeDay(value) {
    return text(value)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function accountName(account) {
    return account?.name || [account?.first_name, account?.last_name].filter(Boolean).join(" ") || account?.email || "";
  }

  function taskOwnerName(task) {
    const team = text(task?.team);
    if (team.includes(" - ")) return team.split(" - ").pop().trim();
    return task?.owner || task?.externalSupplierName || task?.external_supplier_name || team || "";
  }

  function accountForTask(task) {
    const assigned = task?.assignedUserId || task?.assigned_user_id;
    if (assigned) {
      const byId = (appData.accounts || []).find((account) => String(account.id) === String(assigned));
      if (byId) return byId;
    }
    const owner = normalizeDay(taskOwnerName(task));
    if (!owner) return null;
    return (appData.accounts || []).find((account) => normalizeDay(accountName(account)) === owner) || null;
  }

  function workingDaysFor(account) {
    const raw = account?.working_days || account?.workingDays;
    const days = Array.isArray(raw) ? raw.map(normalizeDay).filter(Boolean) : text(raw).split(",").map(normalizeDay).filter(Boolean);
    return new Set((days.length ? days : DEFAULT_WORKING_DAYS).filter(Boolean));
  }

  function dailyHoursFor(account) {
    return numberValue(account?.daily_work_hours || account?.dailyWorkHours) || DEFAULT_DAILY_HOURS;
  }

  function taskHours(task) {
    return numberValue(task?.estimated_hours || task?.estimatedHours || task?.hours || task?.workHours);
  }

  function formatHours(value) {
    const normalized = Math.round(Number(value || 0) * 100) / 100;
    return `${String(normalized).replace(".", ",")} h`;
  }

  function isWorkingDay(date, days) {
    return days.has(DAY_KEYS[date.getDay()]);
  }

  function distributionDates(dueDate, totalHours, dailyHours, workingDays) {
    const dates = [];
    let remainingCapacity = totalHours;
    let cursor = dueDate;
    let guard = 0;

    while (remainingCapacity > 0 && guard < 120) {
      if (isWorkingDay(cursor, workingDays)) {
        dates.push(cursor);
        remainingCapacity -= dailyHours;
      }
      cursor = addDays(cursor, -1);
      guard += 1;
    }

    return dates.reverse();
  }

  function cloneForSegment(task, segment, index, count) {
    const planned = parseDate(task.time || task.planned_date || "");
    const time = planned?.time || "09:00";
    const label = formatHours(segment.hours);
    const baseName = task.name || task.task_name || "Task ordine";
    return {
      ...task,
      id: task.id,
      taskId: task.taskId || task.id,
      name: `${baseName} (${label})`,
      task_name: `${baseName} (${label})`,
      hours: label,
      estimated_hours: segment.hours,
      planned_date: `${segment.iso} ${time}`.trim(),
      time: `${segment.iso} ${time}`.trim(),
      calendarDay: null,
      calendar_day_label: null,
      calendarSegmentIndex: index + 1,
      calendarSegmentCount: count,
      calendarSegmentHours: segment.hours,
      calendarDistributed: true,
    };
  }

  function splitTask(task) {
    const planned = parseDate(task.time || task.planned_date || "");
    const totalHours = taskHours(task);
    const account = accountForTask(task);
    const dailyHours = dailyHoursFor(account);
    const workingDays = workingDaysFor(account);

    if (!planned || totalHours <= dailyHours || dailyHours <= 0) return [task];

    const dates = distributionDates(planned.date, totalHours, dailyHours, workingDays);
    if (dates.length <= 1) return [task];

    let remaining = totalHours;
    const segments = dates.map((date) => {
      const hours = Math.min(dailyHours, remaining);
      remaining = Math.max(0, remaining - hours);
      return { iso: isoDate(date), hours };
    });

    return segments.map((segment, index) => cloneForSegment(task, segment, index, segments.length));
  }

  function distributedOrderTasks(source) {
    return Object.fromEntries(
      Object.entries(source || {}).map(([orderId, tasks]) => [
        orderId,
        (Array.isArray(tasks) ? tasks : []).flatMap(splitTask),
      ])
    );
  }

  function hasAccountSchedules() {
    return (appData.accounts || []).some((account) => account.daily_work_hours || account.dailyWorkHours || account.working_days || account.workingDays);
  }

  async function ensureAccountSchedules() {
    if (accountScheduleLoadStarted || hasAccountSchedules()) return;
    accountScheduleLoadStarted = true;
    try {
      const response = await fetch("/api/accounts", { headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.accounts)) return;
      appData.accounts = payload.accounts;
      if (appState.currentView === "calendar") renderApp();
    } catch (error) {
      console.warn("Orari account non caricati per distribuzione calendario", error);
    }
  }

  const baseRenderCalendarHourDistribution = typeof renderCalendar === "function" ? renderCalendar : null;
  if (!baseRenderCalendarHourDistribution) return;

  renderCalendar = function renderCalendarHourDistribution() {
    ensureAccountSchedules();
    const original = appData.orderTasks;
    appData.orderTasks = distributedOrderTasks(original);
    try {
      return baseRenderCalendarHourDistribution();
    } finally {
      appData.orderTasks = original;
    }
  };

  if (document.getElementById("app")?.innerHTML) renderApp();
})();
