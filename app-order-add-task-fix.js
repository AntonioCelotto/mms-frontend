(function () {
  if (typeof orderDetailEditHandleClick !== "function") return;

  const baseHandleClick = orderDetailEditHandleClick;
  orderDetailEditHandleClick = function orderDetailEditHandleClickAddTaskFix(target) {
    const addButton = target.closest?.("[data-order-detail-add-task]");
    if (!addButton) return baseHandleClick(target);

    const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
    const orderId = Number(order?.id || appState.selectedOrderId || 0);
    const draft = typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
    if (!orderId || !draft) return false;
    if (!Array.isArray(draft.tasks)) draft.tasks = [];

    const extraNumber = draft.tasks.filter((task) => !/^\d+$/.test(String(task.id || ""))).length + 1;
    draft.tasks.push({
      id: `local-task-${orderId}-extra-${Date.now()}-${extraNumber}`,
      name: `Nuova task ${extraNumber}`,
      phase: "altro",
      assignedUserId: "",
      team: "Da assegnare",
      hours: "",
      time: "",
      state: "Da avviare",
      localOnly: true,
    });

    if (typeof renderApp === "function") renderApp();
    return true;
  };
})();
