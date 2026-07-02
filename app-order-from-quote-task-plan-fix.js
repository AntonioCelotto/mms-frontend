(function () {
  let orderCreateAccountsRefreshDone = false;
  let orderCreateAccountsRefreshPending = false;

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

  function refreshOrderCreateWhenAccountsLoad({ force = false } = {}) {
    if (!isOrderFromQuoteView()) return;
    if (orderCreateAccountsRefreshDone || orderCreateAccountsRefreshPending) return;
    if (typeof taskAssignmentLoadSupabaseAccounts !== "function") return;
    orderCreateAccountsRefreshPending = true;
    taskAssignmentLoadSupabaseAccounts(force)
      .then(() => {
        orderCreateAccountsRefreshDone = true;
        if (isOrderFromQuoteView()) renderApp();
      })
      .catch(() => {})
      .finally(() => {
        orderCreateAccountsRefreshPending = false;
      });
  }

  const baseTaskAssignmentRawAccountsOrderCreate =
    typeof taskAssignmentRawAccounts === "function" ? taskAssignmentRawAccounts : null;
  if (baseTaskAssignmentRawAccountsOrderCreate) {
    taskAssignmentRawAccounts = function taskAssignmentRawAccountsWithOrderCreate() {
      const accounts = baseTaskAssignmentRawAccountsOrderCreate();
      if (isOrderFromQuoteView() && (!Array.isArray(accounts) || !accounts.length)) {
        refreshOrderCreateWhenAccountsLoad();
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

  refreshOrderCreateWhenAccountsLoad({ force: true });
  if (document.getElementById("app")?.innerHTML) renderApp();
})();
