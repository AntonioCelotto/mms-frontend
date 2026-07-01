const CALENDAR_ORDER_SYNC_DAYS = ["Domenica", "Lunedi'", "Martedi'", "Mercoledi'", "Giovedi'", "Venerdi'", "Sabato"];

function calendarOrderSyncEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function calendarOrderSyncDateParts(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!match) return null;
  const date = new Date(`${match[1]}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return {
    isoDate: match[1],
    time: match[2] || "Orario da definire",
    day: CALENDAR_ORDER_SYNC_DAYS[date.getDay()] || "Da pianificare",
    dateLabel: date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }),
    sortKey: `${match[1]} ${match[2] || "99:99"}`,
  };
}

function calendarOrderSyncTaskOwner(task) {
  const team = String(task.team || "").trim();
  if (team.includes(" - ")) return team.split(" - ").pop().trim();
  return task.owner || task.externalSupplierName || task.external_supplier_name || "Non assegnato";
}

function calendarOrderSyncTaskDate(task) {
  return calendarOrderSyncDateParts(task.time || task.planned_date || "");
}

function calendarOrderSyncTaskId(orderId, task, index) {
  if (task.id) return String(task.id);
  const phase = String(task.phase || task.task_phase || task.name || task.task_name || "task")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  task.id = `calendar-task-${orderId}-${phase || index + 1}`;
  return String(task.id);
}

function calendarOrderSyncEnsureOrderTasks() {
  if (!appData.orderTasks || typeof appData.orderTasks !== "object") appData.orderTasks = {};
  const knownOrders = new Set((appData.orders || []).map((order) => String(order.id)));
  (appData.calendar || []).forEach((day) => {
    (day.slots || []).forEach((slot) => {
      const orderId = String(slot.orderId || "");
      if (!orderId || !knownOrders.has(orderId)) return;
      if (!Array.isArray(appData.orderTasks[orderId])) appData.orderTasks[orderId] = [];
      const exists = appData.orderTasks[orderId].some((task) => {
        const samePhase = String(task.phase || "").toLowerCase() === String(slot.phase || "").toLowerCase();
        const sameName = String(task.name || "").toLowerCase() === String(slot.title || "").toLowerCase();
        return samePhase && sameName;
      });
      if (exists) return;
      appData.orderTasks[orderId].push({
        id: "",
        name: slot.title || slot.phase || "Task ordine",
        phase: slot.phase || "Lavorazione",
        team: slot.owner || "Non assegnato",
        hours: slot.hours || "0,0 h",
        time: slot.isoDate ? `${slot.isoDate} ${slot.time || ""}`.trim() : day.date || slot.time || "Da pianificare",
        state: slot.status ? String(slot.status).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Da avviare",
        calendarDay: day.day || slot.day || "Da pianificare",
        localOnly: true,
      });
    });
  });
}

function calendarOrderSyncBuildCalendarFromTasks() {
  if (!appData.orderTasks || typeof appData.orderTasks !== "object") return false;
  const slots = [];
  Object.entries(appData.orderTasks).forEach(([orderId, tasks]) => {
    (Array.isArray(tasks) ? tasks : []).forEach((task, index) => {
      const parts = calendarOrderSyncTaskDate(task);
      if (!parts) return;
      slots.push({
        orderId: Number(orderId) || orderId,
        taskId: calendarOrderSyncTaskId(orderId, task, index),
        phase: task.phase || task.task_phase || "Lavorazione",
        title: task.name || task.task_name || "Task ordine",
        owner: calendarOrderSyncTaskOwner(task),
        time: parts.time,
        date: parts.dateLabel,
        isoDate: parts.isoDate,
        day: parts.day,
        sortKey: parts.sortKey,
        status: task.state || task.status || "Da avviare",
        hours: task.hours || task.estimated_hours || "",
      });
    });
  });
  if (!slots.length) return false;
  const grouped = new Map();
  slots.forEach((slot) => {
    if (!grouped.has(slot.isoDate)) grouped.set(slot.isoDate, { day: slot.day, date: slot.date, slots: [] });
    grouped.get(slot.isoDate).slots.push(slot);
  });
  appData.calendar = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => ({
      ...group,
      slots: group.slots.sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
    }));
  return true;
}

function calendarOrderSyncEmployees() {
  const fromCalendar = (appData.calendar || []).flatMap((day) => (day.slots || []).map((slot) => slot.owner).filter(Boolean));
  const fromTasks = Object.values(appData.orderTasks || {}).flatMap((tasks) =>
    (Array.isArray(tasks) ? tasks : []).map(calendarOrderSyncTaskOwner).filter(Boolean)
  );
  return ["all", ...new Set([...fromCalendar, ...fromTasks])];
}

function calendarOrderSyncPhases() {
  const fromCalendar = (appData.calendar || []).flatMap((day) => (day.slots || []).map((slot) => slot.phase).filter(Boolean));
  const fromTasks = Object.values(appData.orderTasks || {}).flatMap((tasks) =>
    (Array.isArray(tasks) ? tasks : []).map((task) => task.phase || task.task_phase).filter(Boolean)
  );
  const base = ["Cartamodello", "Taglio", "Confezione", "Materiale", "Controllo"];
  return ["all", ...new Set([...base, ...fromCalendar, ...fromTasks])];
}

function calendarOrderSyncFilterSlots(slots) {
  const selected = Number(appState.selectedOrderId || 0);
  return (slots || []).filter((slot) => {
    const owner = slot.owner || "Non assegnato";
    const phase = slot.phase || "";
    const byEmployee = appState.calendarFilters.employee === "all" || owner === appState.calendarFilters.employee;
    const byPhase = appState.calendarFilters.phase === "all" || String(phase).toLowerCase() === String(appState.calendarFilters.phase).toLowerCase();
    const byOrder = !selected || Number(slot.orderId) === selected || appState.calendarFilters.employee !== "all" || appState.calendarFilters.phase !== "all";
    return byEmployee && byPhase && byOrder;
  });
}

function calendarOrderSyncSelectedTask() {
  const orderId = String(appState.selectedOrderId || "");
  const taskId = String(appState.assignmentDraft?.taskId || "");
  const tasks = appData.orderTasks?.[orderId] || appData.orderTasks?.[Number(orderId)] || [];
  return (Array.isArray(tasks) ? tasks : []).find((task) => String(task.id) === taskId) || null;
}

function calendarOrderSyncPatchAssignmentFields() {
  if (appState.currentView !== "calendar") return;
  const section = document.querySelector("section.view.active");
  if (!section) return;
  const dateInput = section.querySelector("[data-assignment-field='plannedDate']");
  if (dateInput) {
    dateInput.setAttribute("type", "date");
    dateInput.setAttribute("placeholder", "Seleziona data");
  }
  if (!section.querySelector("[data-assignment-field='plannedTime']")) {
    const field = dateInput?.closest(".field");
    if (field) {
      field.insertAdjacentHTML(
        "afterend",
        `<div class="field"><label>Ora</label><input class="field-value" type="time" data-assignment-field="plannedTime" value="${calendarOrderSyncEscape(appState.assignmentDraft?.plannedTime || "")}" /></div>`
      );
    }
  }
  const timeInput = section.querySelector("[data-assignment-field='plannedTime']");
  if (timeInput && !timeInput.dataset.calendarOrderSyncBound) {
    timeInput.dataset.calendarOrderSyncBound = "true";
    timeInput.addEventListener("input", (event) => {
      appState.assignmentDraft.plannedTime = event.target.value;
    });
    timeInput.addEventListener("change", (event) => {
      appState.assignmentDraft.plannedTime = event.target.value;
    });
  }
  const selectedTask = calendarOrderSyncSelectedTask();
  if (selectedTask && !appState.assignmentDraft.assignedUserId) {
    appState.assignmentDraft.assignedUserId = selectedTask.assignedUserId || selectedTask.assigned_user_id || "";
  }
}

const baseGetCalendarEmployeesOrderSync = getCalendarEmployees;
getCalendarEmployees = function getCalendarEmployeesOrderSync() {
  const synced = calendarOrderSyncEmployees();
  return synced.length > 1 ? synced : baseGetCalendarEmployeesOrderSync();
};

const baseGetCalendarPhasesOrderSync = getCalendarPhases;
getCalendarPhases = function getCalendarPhasesOrderSync() {
  const synced = calendarOrderSyncPhases();
  return synced.length > 1 ? synced : baseGetCalendarPhasesOrderSync();
};

filterCalendarSlots = function filterCalendarSlotsOrderSync(slots) {
  return calendarOrderSyncFilterSlots(slots);
};

const baseRefreshBootstrapCalendarOrderSync = refreshBootstrap;
refreshBootstrap = async function refreshBootstrapCalendarOrderSync() {
  await baseRefreshBootstrapCalendarOrderSync();
  calendarOrderSyncEnsureOrderTasks();
  calendarOrderSyncBuildCalendarFromTasks();
};

const baseRenderCalendarOrderSync = renderCalendar;
renderCalendar = function renderCalendarOrderSync() {
  calendarOrderSyncEnsureOrderTasks();
  calendarOrderSyncBuildCalendarFromTasks();
  return baseRenderCalendarOrderSync()
    .replace("Calendario reparto - Sartoria interna", "Calendario operativo")
    .replace("Pianificazione della settimana", "Planning generale ordini");
};

const baseRenderAppCalendarOrderSync = renderApp;
renderApp = function renderAppCalendarOrderSync() {
  calendarOrderSyncEnsureOrderTasks();
  if (appState.currentView === "calendar") calendarOrderSyncBuildCalendarFromTasks();
  baseRenderAppCalendarOrderSync();
  calendarOrderSyncPatchAssignmentFields();
};

if (document.getElementById("app")?.innerHTML) renderApp();
