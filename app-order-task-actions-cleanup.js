function orderTaskActionsCleanupStyles() {
  if (document.getElementById("order-task-actions-cleanup-styles")) return;
  const style = document.createElement("style");
  style.id = "order-task-actions-cleanup-styles";
  style.textContent = `
    .task-list button[data-task-update] {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

const baseRenderAppOrderTaskActionsCleanup = renderApp;
renderApp = function renderAppOrderTaskActionsCleanup() {
  orderTaskActionsCleanupStyles();
  baseRenderAppOrderTaskActionsCleanup();
};

if (document.getElementById("app")?.innerHTML) renderApp();
