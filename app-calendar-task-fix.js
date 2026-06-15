function calendarTaskFixShape(task) {
  const userName = [task.users?.first_name, task.users?.last_name].filter(Boolean).join(" ").trim();
  const owner = userName || task.external_supplier_name || "Non assegnato";
  const dept = task.departments?.name || "Reparto";
  return {
    id: task.id,
    name: task.task_name,
    phase: task.task_phase,
    team: `${dept} - ${owner}`,
    hours: `${Number(task.estimated_hours || 0).toFixed(1).replace(".", ",")} h`,
    time: task.planned_date || "Da pianificare",
    state: String(task.status || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
    calendarDay: task.calendar_day_label || "Da pianificare",
    assignedUserId: task.assigned_user_id ? String(task.assigned_user_id) : "",
    externalSupplierName: task.external_supplier_name || "",
  };
}

if (typeof orderFlowTaskShape === "function") orderFlowTaskShape = calendarTaskFixShape;

let calendarTaskFixLoading = false;

function calendarTaskFixOrder() {
  return typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
}

function calendarTaskFixDisplayId(order) {
  return Number(order?.id || appState.selectedOrderId || 0);
}

function calendarTaskFixTasks() {
  const order = calendarTaskFixOrder();
  const displayId = calendarTaskFixDisplayId(order);
  const direct = appData.orderTasks?.[displayId] || appData.orderTasks?.[appState.selectedOrderId] || [];
  return Array.isArray(direct) ? direct : [];
}

async function calendarTaskFixLoadTasks(force = false) {
  if (calendarTaskFixLoading) return;
  const order = calendarTaskFixOrder();
  if (!order || typeof orderFlowLoadTasks !== "function") return;
  if (!force && calendarTaskFixTasks().length) return;
  calendarTaskFixLoading = true;
  try {
    await orderFlowLoadTasks(order);
  } catch (error) {
    console.warn("Task calendario non caricati", error);
  } finally {
    calendarTaskFixLoading = false;
  }
}

function calendarTaskFixSplitDateTime(value) {
  if (typeof splitPlannedDateTime === "function") return splitPlannedDateTime(value);
  if (!value || value === "Da pianificare") return { date: "", time: "" };
  const [date = "", time = ""] = String(value).split(" ");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date, time } : { date: "", time: "" };
}

function calendarTaskFixAssignedValue(task) {
  if (task?.assignedUserId) return String(task.assignedUserId);
  if (task?.externalSupplierName) return `external:${encodeURIComponent(task.externalSupplierName)}`;
  return "";
}

function calendarTaskFixRefreshAssignee(section) {
  if (typeof taskAssignmentEnhanceCalendar === "function") taskAssignmentEnhanceCalendar();
  const select = section?.querySelector("select[data-assignment-field='assignedUserId']");
  if (select && appState.assignmentDraft.assignedUserId) select.value = String(appState.assignmentDraft.assignedUserId);
}

function calendarTaskFixSyncDraftFromTask(task, overwrite = false) {
  if (!task) return;
  if (overwrite || !appState.assignmentDraft.assignedUserId) appState.assignmentDraft.assignedUserId = calendarTaskFixAssignedValue(task);
  const parts = calendarTaskFixSplitDateTime(task.time);
  if (overwrite || !appState.assignmentDraft.plannedDate) appState.assignmentDraft.plannedDate = parts.date;
  if (overwrite || !appState.assignmentDraft.plannedTime) appState.assignmentDraft.plannedTime = parts.time;
  if (appState.assignmentDraft.plannedDate && typeof getCalendarDayFromDate === "function") {
    appState.assignmentDraft.calendarDay = getCalendarDayFromDate(appState.assignmentDraft.plannedDate);
  }
}

function calendarTaskFixTaskOptions(tasks, selectedValue) {
  if (!tasks.length) return `<option value="">${calendarTaskFixLoading ? "Caricamento task..." : "Nessun task caricato"}</option>`;
  return `<option value="">Seleziona task</option>${tasks.map((task) => `<option value="${task.id}" ${String(selectedValue || "") === String(task.id) ? "selected" : ""}>${task.name}</option>`).join("")}`;
}

function calendarTaskFixEnhanceTaskSelect(section) {
  const select = section.querySelector("select[data-assignment-field='taskId']");
  if (!select) return;
  const tasks = calendarTaskFixTasks();
  if (!tasks.length) {
    calendarTaskFixLoadTasks().then(() => {
      if (appState.currentView === "calendar") renderApp();
    }).catch(() => {});
  }
  const selected = String(appState.assignmentDraft?.taskId || select.value || "");
  const markup = calendarTaskFixTaskOptions(tasks, selected);
  if (select.dataset.calendarTaskFixMarkup !== markup) {
    select.innerHTML = markup;
    select.value = selected;
    select.dataset.calendarTaskFixMarkup = markup;
  }
  const selectedTask = tasks.find((task) => String(task.id) === selected);
  if (selectedTask) {
    calendarTaskFixSyncDraftFromTask(selectedTask, false);
    calendarTaskFixRefreshAssignee(section);
  }
  select.onchange = (event) => {
    appState.assignmentDraft.taskId = event.target.value;
    const task = tasks.find((item) => String(item.id) === String(event.target.value));
    calendarTaskFixSyncDraftFromTask(task, true);
    renderApp();
  };
}

function calendarTaskFixEnhance() {
  if (appState.currentView !== "calendar") return;
  const section = document.querySelector("section.view.active");
  if (!section) return;
  calendarTaskFixEnhanceTaskSelect(section);
}

const baseRenderAppCalendarTaskFix = renderApp;
renderApp = function renderAppWithCalendarTaskFix() {
  baseRenderAppCalendarTaskFix();
  calendarTaskFixEnhance();
};

if (appState.currentView === "calendar") {
  calendarTaskFixLoadTasks().then(() => renderApp()).catch(() => {});
}
