(function () {
  const DAY_KEYS = ["domenica", "lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato"];
  const DEFAULT_WORKING_DAYS = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi"];
  const DEFAULT_DAILY_HOURS = 8;
  const WORK_START_HOUR = 8;
  const BREAK_START_OFFSET = 4;
  const BREAK_HOURS = 1;
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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(date, days) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function normalize(value) {
    return text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  }

  function accountName(account) {
    return account?.name || account?.displayName || [account?.first_name, account?.last_name].filter(Boolean).join(" ") || account?.email || "";
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
    const owner = normalize(taskOwnerName(task));
    if (!owner) return null;
    return (appData.accounts || []).find((account) => normalize(accountName(account)) === owner) || null;
  }

  function accountKey(task, account) {
    return String(account?.id || task?.assignedUserId || task?.assigned_user_id || normalize(taskOwnerName(task)) || "non-assegnato");
  }

  function workingDaysFor(account) {
    const raw = account?.working_days || account?.workingDays;
    const days = Array.isArray(raw) ? raw.map(normalize).filter(Boolean) : text(raw).split(",").map(normalize).filter(Boolean);
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

  function clockForOffset(offset, startsAfterBreak = false) {
    const adjusted = offset > BREAK_START_OFFSET || (startsAfterBreak && offset === BREAK_START_OFFSET) ? offset + BREAK_HOURS : offset;
    const totalMinutes = Math.round((WORK_START_HOUR + adjusted) * 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  }

  function segmentTimeLabel(startOffset, hours) {
    const endOffset = startOffset + hours;
    if (startOffset < BREAK_START_OFFSET && endOffset > BREAK_START_OFFSET) {
      return `${clockForOffset(startOffset, true)}–12:00 / 13:00–${clockForOffset(endOffset)}`;
    }
    return `${clockForOffset(startOffset, true)}–${clockForOffset(endOffset)}`;
  }

  function allocateTask(task, occupancy) {
    const planned = parseDate(task.time || task.planned_date || "");
    const totalHours = taskHours(task);
    if (!planned || totalHours <= 0) return [task];

    const account = accountForTask(task);
    const dailyHours = dailyHoursFor(account);
    const workingDays = workingDaysFor(account);
    const ownerKey = accountKey(task, account);
    const segments = [];
    let remaining = totalHours;
    let cursor = planned.date;
    let guard = 0;

    while (remaining > 0.0001 && guard < 366) {
      if (isWorkingDay(cursor, workingDays)) {
        const iso = isoDate(cursor);
        const capacityKey = `${ownerKey}:${iso}`;
        const used = Number(occupancy.get(capacityKey) || 0);
        const available = Math.max(0, dailyHours - used);
        if (available > 0) {
          const hours = Math.min(available, remaining);
          segments.push({ iso, hours, timeLabel: segmentTimeLabel(used, hours) });
          occupancy.set(capacityKey, used + hours);
          remaining -= hours;
        }
      }
      cursor = addDays(cursor, 1);
      guard += 1;
    }

    if (!segments.length) return [task];
    const baseName = (task.name || task.task_name || "Task ordine").replace(/\s+\([\d,.]+\s*h\)$/i, "");
    return segments.map((segment, index) => ({
      ...task,
      id: task.id,
      taskId: task.taskId || task.id,
      name: baseName,
      task_name: baseName,
      hours: formatHours(totalHours),
      estimated_hours: totalHours,
      estimatedHours: totalHours,
      planned_date: segment.iso,
      time: segment.iso,
      calendarDay: null,
      calendar_day_label: null,
      calendarSegmentIndex: index + 1,
      calendarSegmentCount: segments.length,
      calendarSegmentHours: segment.hours,
      calendarSegmentTimeLabel: segment.timeLabel,
      calendarDistributed: true,
    }));
  }

  function distributedOrderTasks(source) {
    const rows = Object.entries(source || {}).flatMap(([orderId, tasks]) =>
      (Array.isArray(tasks) ? tasks : []).map((task, index) => ({ orderId, task, index, planned: parseDate(task.time || task.planned_date || "") }))
    );
    rows.sort((a, b) => {
      const dateOrder = String(a.planned?.iso || "9999-12-31").localeCompare(String(b.planned?.iso || "9999-12-31"));
      if (dateOrder) return dateOrder;
      const idOrder = Number(a.task?.id || 0) - Number(b.task?.id || 0);
      return idOrder || a.index - b.index;
    });

    const occupancy = new Map();
    const result = Object.fromEntries(Object.keys(source || {}).map((orderId) => [orderId, []]));
    rows.forEach(({ orderId, task }) => result[orderId].push(...allocateTask(task, occupancy)));
    return result;
  }

  function hasAccountSchedules() {
    return (appData.accounts || []).some((account) => account.daily_work_hours || account.dailyWorkHours || account.working_days || account.workingDays);
  }

  async function ensureAccountSchedules() {
    if (accountScheduleLoadStarted || hasAccountSchedules()) return;
    accountScheduleLoadStarted = true;
    try {
      const session = await window.mmsSupabaseAuth?.auth?.getSession?.();
      const token = session?.data?.session?.access_token || "";
      const headers = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch("/api/accounts", { headers });
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
