const baseTaskAssignmentMissingPlanItemsSaveUnblock =
  typeof taskAssignmentMissingPlanItems === "function" ? taskAssignmentMissingPlanItems : null;

if (baseTaskAssignmentMissingPlanItemsSaveUnblock) {
  taskAssignmentMissingPlanItems = function taskAssignmentMissingPlanItemsSaveUnblock() {
    const isOrderFromQuote = appState.currentView === "order-create" || !!appState.orderFromQuoteDraft;
    if (isOrderFromQuote) return [];
    return baseTaskAssignmentMissingPlanItemsSaveUnblock();
  };
}

function orderTaskSaveUnblockNote() {
  if (appState.currentView !== "order-create") return;
  const section = document.querySelector("section.view.active");
  if (!section || section.querySelector("[data-order-task-save-unblock-note]")) return;
  const taskTitle = Array.from(section.querySelectorAll(".section-title h3")).find((node) =>
    node.textContent.trim().toLowerCase().includes("task per organizzare")
  );
  const panel = taskTitle?.closest(".surface")?.querySelector(".surface-inner");
  if (!panel) return;
  panel.insertAdjacentHTML(
    "beforeend",
    `<div class="empty-state" data-order-task-save-unblock-note style="margin-top:12px;">Puoi salvare l'ordine anche senza assegnare subito tutti i task. Le assegnazioni restano modificabili da Scheda ordine e Calendario.</div>`
  );
}

const baseRenderAppOrderTaskSaveUnblock = renderApp;
renderApp = function renderAppOrderTaskSaveUnblock() {
  baseRenderAppOrderTaskSaveUnblock();
  orderTaskSaveUnblockNote();
};

if (document.getElementById("app")?.innerHTML) renderApp();
