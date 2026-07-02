(function () {
  function isOrderFromQuoteView() {
    return appState.currentView === "order-create" || !!appState.orderFromQuoteDraft;
  }

  function ensureTaskPlan() {
    if (typeof orderFromQuoteV2EnsureTaskHours === "function") return orderFromQuoteV2EnsureTaskHours();
    if (typeof orderFlowPlan === "function") return orderFlowPlan();
    return [];
  }

  function attachOrderFromQuoteTaskPlanFix() {
    if (!isOrderFromQuoteView()) return;
    document.querySelectorAll("[data-order-flow-plan-field]").forEach((input) => {
      const handler = (event) => {
        const index = Number(event.target.dataset.orderFlowPlanIndex);
        const field = event.target.dataset.orderFlowPlanField;
        const plan = ensureTaskPlan();
        if (!plan[index]) return;
        plan[index][field] = field === "enabled" ? event.target.checked : event.target.value;
        if (field === "workHours") plan[index].estimatedHours = event.target.value;
      };
      input.addEventListener("input", handler);
      input.addEventListener("change", handler);
    });
  }

  function refreshOrderCreateWhenAccountsLoad() {
    if (!isOrderFromQuoteView()) return;
    if (typeof taskAssignmentLoadSupabaseAccounts !== "function") return;
    taskAssignmentLoadSupabaseAccounts(true)
      .then(() => {
        if (isOrderFromQuoteView()) renderApp();
      })
      .catch(() => {});
  }

  const baseTaskAssignmentRawAccountsOrderCreate =
    typeof taskAssignmentRawAccounts === "function" ? taskAssignmentRawAccounts : null;
  if (baseTaskAssignmentRawAccountsOrderCreate) {
    taskAssignmentRawAccounts = function taskAssignmentRawAccountsWithOrderCreate() {
      const accounts = baseTaskAssignmentRawAccountsOrderCreate();
      if (isOrderFromQuoteView() && typeof taskAssignmentLoadSupabaseAccounts === "function") {
        taskAssignmentLoadSupabaseAccounts().then(() => {
          if (isOrderFromQuoteView()) renderApp();
        }).catch(() => {});
      }
      return accounts;
    };
  }

  const baseOrderFlowApplyTaskPlanOrderCreate =
    typeof orderFlowApplyTaskPlan === "function" ? orderFlowApplyTaskPlan : null;
  if (baseOrderFlowApplyTaskPlanOrderCreate) {
    orderFlowApplyTaskPlan = async function orderFlowApplyTaskPlanFromQuoteFixed(order) {
      ensureTaskPlan();
      return baseOrderFlowApplyTaskPlanOrderCreate(order);
    };
  }

  const baseRenderAppOrderFromQuoteTaskPlanFix = renderApp;
  renderApp = function renderAppOrderFromQuoteTaskPlanFix() {
    baseRenderAppOrderFromQuoteTaskPlanFix();
    attachOrderFromQuoteTaskPlanFix();
  };

  refreshOrderCreateWhenAccountsLoad();
  if (document.getElementById("app")?.innerHTML) renderApp();
})();
