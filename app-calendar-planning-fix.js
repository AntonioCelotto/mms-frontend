const CALENDAR_PLANNING_DAYS = ["Domenica", "Lunedi'", "Martedi'", "Mercoledi'", "Giovedi'", "Venerdi'", "Sabato"];
let calendarPlanningLoading = false;
let calendarPlanningLoaded = false;

function calendarPlanningDateParts(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!match) return null;
  const date = new Date(`${match[1]}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return {
    isoDate: match[1],
    time: match[2] || "Orario da definire",
    day: CALENDAR_PLANNING_DAYS[date.getDay()] || "Da pianificare",
    label: date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }),
    sortKey: `${match[1]} ${match[2] || "99:99"}`,
  };
}

function calendarPlanningOwner(task) {
  return [task.users?.first_name, task.users?.last_name].filter(Boolean).join(" ").trim() || task.external_supplier_name || "Non assegnato";
}

function calendarPlanningOrderLabel(task) {
  return Number(task.orders?.order_number || task.order_number || task.order_id || 0);
}

function calendarPlanningSlot(task) {
  const parts = calendarPlanningDateParts(task.planned_date);
  if (!parts) return null;
  const orderNumber = calendarPlanningOrderLabel(task);
  return {
    orderId: orderNumber,
    phase: task.task_phase || task.task_name || "Lavorazione",
    title: task.task_name || `Task ordine #${orderNumber}`,
    owner: calendarPlanningOwner(task),
    time: parts.time,
    date: parts.label,
    isoDate: parts.isoDate,
    day: parts.day,
    sortKey: parts.sortKey,
    status: task.status || "da_avviare",
  };
}

function calendarPlanningEmptyWeek() {
  return ["Lunedi'", "Martedi'", "Mercoledi'", "Giovedi'", "Venerdi'"].map((day) => ({ day, date: "Nessun task pianificato", slots: [] }));
}

function calendarPlanningBuild(slots) {
  const grouped = new Map();
  slots.forEach((slot) => {
    const key = slot.isoDate;
    if (!grouped.has(key)) grouped.set(key, { day: slot.day, date: slot.date, slots: [] });
    grouped.get(key).slots.push(slot);
  });
  const days = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => ({
      ...group,
      slots: group.slots.sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
    }));
  return days.length ? days : calendarPlanningEmptyWeek();
}

async function calendarPlanningLoad(force = false) {
  if (calendarPlanningLoading) return false;
  if (!force && calendarPlanningLoaded) return false;
  if (typeof orderFlowRequest !== "function") return false;
  calendarPlanningLoading = true;
  try {
    const rows = await orderFlowRequest("/rest/v1/order_tasks?select=id,order_id,task_name,task_phase,status,planned_date,calendar_day_label,external_supplier_name,orders(order_number),users(first_name,last_name)&order=planned_date.asc");
    const slots = (Array.isArray(rows) ? rows : []).map(calendarPlanningSlot).filter(Boolean);
    appData.calendar = calendarPlanningBuild(slots);
    calendarPlanningLoaded = true;
    return true;
  } catch (error) {
    console.warn("Planning calendario non caricato", error);
    return false;
  } finally {
    calendarPlanningLoading = false;
  }
}

function calendarPlanningSelectedOrderHasSlots() {
  const selected = Number(appState.selectedOrderId || 0);
  return (appData.calendar || []).some((day) => (day.slots || []).some((slot) => Number(slot.orderId) === selected));
}

function calendarPlanningEnhanceText() {
  if (appState.currentView !== "calendar") return;
  const section = document.querySelector("section.view.active");
  if (!section) return;
  section.querySelectorAll(".section-title h3").forEach((heading) => {
    const text = heading.textContent.trim().toLowerCase();
    if (text === "calendario generale lavori") heading.textContent = "Planning generale ordini";
  });
  if (!calendarPlanningSelectedOrderHasSlots() && calendarPlanningLoaded) {
    section.querySelectorAll(".empty-state").forEach((node) => {
      if (node.textContent.includes("Nessun task con i filtri attuali")) {
        node.textContent = "Nessun task pianificato per l'ordine selezionato.";
      }
    });
  }
}

const baseSaveTaskAssignmentCalendarPlanning = saveTaskAssignment;
saveTaskAssignment = async function saveTaskAssignmentWithCalendarPlanning() {
  await baseSaveTaskAssignmentCalendarPlanning();
  calendarPlanningLoaded = false;
  const changed = await calendarPlanningLoad(true);
  if (changed && appState.currentView === "calendar") renderApp();
};

const baseRenderAppCalendarPlanning = renderApp;
renderApp = function renderAppWithCalendarPlanning() {
  baseRenderAppCalendarPlanning();
  if (appState.currentView !== "calendar") return;
  calendarPlanningEnhanceText();
  if (!calendarPlanningLoaded && !calendarPlanningLoading) {
    calendarPlanningLoad().then((changed) => {
      if (changed && appState.currentView === "calendar") renderApp();
      else calendarPlanningEnhanceText();
    }).catch(() => {});
  }
};

calendarPlanningLoad().then((changed) => {
  if (changed && appState.currentView === "calendar") renderApp();
}).catch(() => {});
