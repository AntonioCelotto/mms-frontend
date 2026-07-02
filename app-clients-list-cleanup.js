(function () {
  function isClientsView() {
    const active = document.querySelector("section.view.active");
    const title = active?.querySelector(".screen-header h2")?.textContent.trim().toLowerCase();
    return appState.currentView === "clients" || title === "clienti";
  }

  function removeClientsEditPanels() {
    if (!isClientsView()) return;
    document.querySelectorAll(".client-edit-overlay-module, .clients-edit-panel").forEach((panel) => panel.remove());
  }

  if (typeof clientOverlayMount === "function") {
    clientOverlayMount = function clientOverlayMountDisabledOnClientsList() {
      removeClientsEditPanels();
    };
  }

  if (typeof injectClientEditPanel === "function") {
    injectClientEditPanel = function injectClientEditPanelDisabledOnClientsList() {
      removeClientsEditPanels();
    };
  }

  const baseRenderAppClientsListCleanup = renderApp;
  renderApp = function renderAppClientsListCleanup() {
    baseRenderAppClientsListCleanup();
    removeClientsEditPanels();
  };

  document.addEventListener("click", (event) => {
    const openClient = event.target.closest("[data-select-client], [data-clients-fallback-select]");
    if (!openClient || !isClientsView()) return;
    window.setTimeout(removeClientsEditPanels, 0);
  }, true);

  removeClientsEditPanels();
})();
