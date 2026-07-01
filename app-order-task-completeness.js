const ORDER_TASK_COMPLETENESS_STORAGE_KEY = "mms_order_task_plan_v1";
const ORDER_TASK_COMPLETENESS_PHASES = [
  { phase: "cartamodello", label: "Cartamodello" },
  { phase: "taglio", label: "Taglio" },
  { phase: "confezione", label: "Confezione" },
];

function orderTaskCompletenessNormalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

function orderTaskCompletenessPhaseKey(task) {
  const raw = orderTaskCompletenessNormalize(task?.phase || task?.task_phase || task?.name || task?.task_name);
  if (raw.includes("cartamodello")) return "cartamodello";
  if (raw.includes("taglio")) return "taglio";
  if (raw.includes("confezione")) return "confezione";
  return raw;
}

function orderTaskCompletenessRead() {
  try {
    return JSON.parse(localStorage.getItem(ORDER_TASK_COMPLETENESS_STORAGE_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function orderTaskCompletenessWrite(orderId, plan) {
  if (!orderId || !Array.isArray(plan)) return;
  try {
    const stored = orderTaskCompletenessRead();
    stored[orderId] = plan;
    localStorage.setItem(ORDER_TASK_COMPLETENESS_STORAGE_KEY, JSON.stringify(stored));
  } catch (error) {
    console.warn("Piano task locale non disponibile", error);
  }
}

function orderTaskCompletenessCurrentPlan() {
  const plan = typeof orderFromQuoteV2EnsureTaskHours === "function"
    ? orderFromQuoteV2EnsureTaskHours()
    : typeof orderFlowPlan === "function"
      ? orderFlowPlan()
      : [];
  return (Array.isArray(plan) ? plan : [])
    .filter((item) => item && item.enabled !== false)
    .map((item) => ({
      phase: item.phase,
      label: item.label || item.phase || "Task",
      workHours: item.workHours || item.estimatedHours || "",
      plannedDate: item.plannedDate || "",
      assignedUserId: item.assignedUserId || "",
    }));
}

function orderTaskCompletenessFallbackPlan(orderId) {
  const stored = orderTaskCompletenessRead()[orderId];
  if (Array.isArray(stored) && stored.length) return stored;
  return ORDER_TASK_COMPLETENESS_PHASES.map((item) => ({ ...item, workHours: "", plannedDate: "", assignedUserId: "" }));
}

function orderTaskCompletenessAssigneeLabel(value) {
  if (!value) return "Da assegnare";
  if (String(value).startsWith("external:")) return decodeURIComponent(String(value).slice(9));
  const options = typeof orderFlowEmployeeOptions === "function" ? orderFlowEmployeeOptions() : [];
  return options.find((item) => String(item.value) === String(value))?.label || "Da assegnare";
}

function orderTaskCompletenessTaskFromPlan(item) {
  const cleanHours = String(item.workHours || "").trim();
  return {
    id: "",
    name: `${item.label || "Task"} ordine`,
    phase: item.phase || item.label || "Task",
    team: orderTaskCompletenessAssigneeLabel(item.assignedUserId),
    hours: cleanHours ? `${cleanHours.replace(".", ",")} h` : "0,0 h",
    time: item.plannedDate || "Da pianificare",
    state: "Da avviare",
    localOnly: true,
  };
}

function orderTaskCompletenessMerge(order, preferredPlan = null) {
  const orderId = Number(order?.id || appState.selectedOrderId);
  if (!orderId) return false;
  if (!appData.orderTasks || typeof appData.orderTasks !== "object") appData.orderTasks = {};

  const current = Array.isArray(appData.orderTasks[orderId]) ? appData.orderTasks[orderId] : [];
  const phaseKeys = new Set(current.map(orderTaskCompletenessPhaseKey).filter(Boolean));
  const plan = (Array.isArray(preferredPlan) && preferredPlan.length ? preferredPlan : orderTaskCompletenessFallbackPlan(orderId))
    .filter((item) => item && item.enabled !== false);
  const missing = plan.filter((item) => item.phase && !phaseKeys.has(orderTaskCompletenessNormalize(item.phase)));
  if (!missing.length) return false;

  appData.orderTasks[orderId] = [...current, ...missing.map(orderTaskCompletenessTaskFromPlan)];
  if (appState.orderDetailEdits?.[orderId]) {
    appState.orderDetailEdits[orderId].tasks = appData.orderTasks[orderId].map((task) => ({
      id: task.id || "",
      name: task.name || "",
      phase: task.phase || "",
      team: task.team || "",
      hours: String(task.hours || "").replace(" h", "").trim(),
      time: task.time || "",
      state: task.state || "Da avviare",
    }));
  }
  return true;
}

const baseSaveDraftOrderTaskCompleteness = saveDraftOrder;
saveDraftOrder = async function saveDraftOrderWithCompleteTasks() {
  const planSnapshot = orderTaskCompletenessCurrentPlan();
  await baseSaveDraftOrderTaskCompleteness();
  const order = getSelectedOrder?.();
  const orderId = Number(order?.id || appState.selectedOrderId);
  if (orderId && planSnapshot.length) orderTaskCompletenessWrite(orderId, planSnapshot);
  if (orderTaskCompletenessMerge(order, planSnapshot)) renderApp();
};

const baseOrderFlowLoadTasksTaskCompleteness = typeof orderFlowLoadTasks === "function" ? orderFlowLoadTasks : null;
if (baseOrderFlowLoadTasksTaskCompleteness) {
  orderFlowLoadTasks = async function orderFlowLoadTasksWithCompleteness(order) {
    const tasks = await baseOrderFlowLoadTasksTaskCompleteness(order);
    orderTaskCompletenessMerge(order);
    return appData.orderTasks?.[Number(order?.id || appState.selectedOrderId)] || tasks;
  };
}

const baseRenderAppTaskCompleteness = renderApp;
renderApp = function renderAppTaskCompleteness() {
  if (appState.currentView === "order-detail") {
    orderTaskCompletenessMerge(getSelectedOrder?.());
  }
  baseRenderAppTaskCompleteness();
};

if (document.getElementById("app")?.innerHTML) renderApp();
