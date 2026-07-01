const ORDER_CORE_TASK_PHASES = [
  { phase: "cartamodello", label: "Cartamodello" },
  { phase: "taglio", label: "Taglio" },
  { phase: "confezione", label: "Confezione" },
];

function orderCoreTaskKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.includes("cartamodello")) return "cartamodello";
  if (raw.includes("taglio")) return "taglio";
  if (raw.includes("confezione")) return "confezione";
  return "";
}

function orderCoreTaskNormalizePlan(plan) {
  const rows = Array.isArray(plan) ? plan : [];
  return ORDER_CORE_TASK_PHASES.map((core) => {
    const existing = rows.find((item) => orderCoreTaskKey(item.phase || item.label || item.name) === core.phase);
    return {
      ...core,
      ...(existing || {}),
      phase: core.phase,
      label: core.label,
      enabled: existing?.enabled !== false,
    };
  });
}

function orderCoreTaskNormalizeAppPlan() {
  appState.newOrderTaskPlan = orderCoreTaskNormalizePlan(appState.newOrderTaskPlan);
  return appState.newOrderTaskPlan;
}

function orderCoreTaskNormalizeTasks(tasks) {
  const rows = Array.isArray(tasks) ? tasks : [];
  return ORDER_CORE_TASK_PHASES.map((core, index) => {
    const existing = rows.find((task) => orderCoreTaskKey(task.phase || task.task_phase || task.name || task.task_name) === core.phase);
    if (existing) {
      return {
        ...existing,
        phase: existing.phase || core.phase,
        name: existing.name || `${core.label} ordine`,
      };
    }
    return {
      id: "",
      name: `${core.label} ordine`,
      phase: core.phase,
      team: "Da assegnare",
      hours: "0,0 h",
      time: "Da pianificare",
      state: "Da avviare",
      localOnly: true,
      sortIndex: index,
    };
  });
}

function orderCoreTaskNormalizeCurrentOrder() {
  const orderId = Number(appState.selectedOrderId || getSelectedOrder?.()?.id || 0);
  if (!orderId || !appData.orderTasks || !Array.isArray(appData.orderTasks[orderId])) return;
  appData.orderTasks[orderId] = orderCoreTaskNormalizeTasks(appData.orderTasks[orderId]);
  const draft = appState.orderDetailEdits?.[orderId];
  if (draft && Array.isArray(draft.tasks)) {
    draft.tasks = orderCoreTaskNormalizeTasks(draft.tasks).map((task) => ({
      id: task.id || "",
      name: task.name || "",
      phase: task.phase || "",
      assignedUserId: task.assignedUserId || "",
      team: task.team || "",
      hours: String(task.hours || "").replace(" h", "").replace(",", ".").trim(),
      time: String(task.time || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "",
      state: task.state || "Da avviare",
    }));
  }
}

const baseOrderFlowPlanCoreTasks = typeof orderFlowPlan === "function" ? orderFlowPlan : null;
if (baseOrderFlowPlanCoreTasks) {
  orderFlowPlan = function orderFlowPlanCoreTasks() {
    baseOrderFlowPlanCoreTasks();
    return orderCoreTaskNormalizeAppPlan();
  };
}

const baseOrderFromQuoteV2EnsureTaskHoursCore = typeof orderFromQuoteV2EnsureTaskHours === "function" ? orderFromQuoteV2EnsureTaskHours : null;
if (baseOrderFromQuoteV2EnsureTaskHoursCore) {
  orderFromQuoteV2EnsureTaskHours = function orderFromQuoteV2EnsureCoreTaskHours() {
    const plan = orderCoreTaskNormalizePlan(baseOrderFromQuoteV2EnsureTaskHoursCore());
    appState.newOrderTaskPlan = plan.map((task) => {
      if (task.workHours === undefined) task.workHours = task.estimatedHours || "";
      return task;
    });
    return appState.newOrderTaskPlan;
  };
}

const baseOrderTaskCompletenessCurrentPlanCore = typeof orderTaskCompletenessCurrentPlan === "function" ? orderTaskCompletenessCurrentPlan : null;
if (baseOrderTaskCompletenessCurrentPlanCore) {
  orderTaskCompletenessCurrentPlan = function orderTaskCompletenessCurrentCorePlan() {
    return orderCoreTaskNormalizePlan(baseOrderTaskCompletenessCurrentPlanCore());
  };
}

const baseOrderTaskCompletenessFallbackPlanCore = typeof orderTaskCompletenessFallbackPlan === "function" ? orderTaskCompletenessFallbackPlan : null;
if (baseOrderTaskCompletenessFallbackPlanCore) {
  orderTaskCompletenessFallbackPlan = function orderTaskCompletenessFallbackCorePlan(orderId) {
    return orderCoreTaskNormalizePlan(baseOrderTaskCompletenessFallbackPlanCore(orderId));
  };
}

const baseOrderDetailEditDraftForCoreTasks = typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor : null;
if (baseOrderDetailEditDraftForCoreTasks) {
  orderDetailEditDraftFor = function orderDetailEditDraftForCoreTasks(order) {
    const draft = baseOrderDetailEditDraftForCoreTasks(order);
    if (draft && Array.isArray(draft.tasks)) draft.tasks = orderCoreTaskNormalizeTasks(draft.tasks);
    return draft;
  };
}

const baseSaveDraftOrderCoreTasks = saveDraftOrder;
saveDraftOrder = async function saveDraftOrderCoreTasks() {
  orderCoreTaskNormalizeAppPlan();
  await baseSaveDraftOrderCoreTasks();
  orderCoreTaskNormalizeCurrentOrder();
};

const baseRenderAppOrderCoreTasks = renderApp;
renderApp = function renderAppOrderCoreTasks() {
  if (appState.currentView === "order-create") orderCoreTaskNormalizeAppPlan();
  if (appState.currentView === "order-detail") orderCoreTaskNormalizeCurrentOrder();
  baseRenderAppOrderCoreTasks();
};

orderCoreTaskNormalizeAppPlan();
if (document.getElementById("app")?.innerHTML) renderApp();
