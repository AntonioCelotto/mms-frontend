function injectClientsNavigation() {
  const nav = document.querySelector(".nav");
  if (!nav) return;

  const oldClientButton = nav.querySelector("[data-nav='client']");
  const existingClientsButton = nav.querySelector("[data-nav='clients']");
  const button = existingClientsButton || oldClientButton || document.createElement("button");

  button.dataset.nav = "clients";
  button.className = appState.currentView === "clients" ? "active" : "";
  button.innerHTML = "<strong>Clienti</strong><span>Anagrafiche, ordini e pagamenti</span>";

  if (!existingClientsButton && !oldClientButton) {
    const before = nav.querySelector("[data-nav='inventory']");
    if (before) nav.insertBefore(button, before);
    else nav.appendChild(button);
  }
}

function injectClientsView() {
  const workspace = document.querySelector(".workspace");
  if (!workspace || workspace.querySelector("section[data-clients-registry='true']")) return;
  if (typeof renderClientsRegistry !== "function") return;

  const holder = document.createElement("div");
  holder.innerHTML = renderClientsRegistry().replace("<section", "<section data-clients-registry=\"true\"");
  const clientsSection = holder.firstElementChild;
  const oldClientSection = Array.from(workspace.querySelectorAll("section.view")).find((section) =>
    section.textContent.includes("Scheda cliente")
  );
  const inventorySection = Array.from(workspace.querySelectorAll("section.view")).find((section) =>
    section.textContent.includes("Magazzino e preordini")
  );

  if (oldClientSection) workspace.insertBefore(clientsSection, oldClientSection);
  else if (inventorySection) workspace.insertBefore(clientsSection, inventorySection);
  else workspace.appendChild(clientsSection);
}

function attachClientsDomEvents() {
  document.querySelectorAll("[data-nav='clients']").forEach((button) => {
    button.onclick = () => navigate("clients");
  });

  document.querySelectorAll("section[data-clients-registry='true'] [data-detail]").forEach((button) => {
    button.onclick = () => navigate("order-detail", Number(button.dataset.detail));
  });

  document.querySelectorAll("[data-select-client]").forEach((button) => {
    button.onclick = () => {
      appState.selectedClientId = Number(button.dataset.selectClient);
      renderApp();
    };
  });

  document.querySelectorAll("[data-open-client-from-order]").forEach((button) => {
    button.onclick = () => {
      const id = Number(button.dataset.openClientFromOrder);
      const name = button.dataset.clientName;
      const byName = appState.realClients.find((client) => client.name === name);
      appState.selectedClientId = id || byName?.id || appState.selectedClientId;
      navigate("clients");
    };
  });

  document.querySelectorAll("[data-client-new-order]").forEach((button) => {
    button.onclick = () => {
      appState.draftOrder.client = button.dataset.clientNewOrder;
      navigate("new-order");
    };
  });

  document.querySelectorAll("[data-clients-search]").forEach((input) => {
    input.oninput = (event) => {
      appState.clientsSearch = event.target.value;
      renderApp();
    };
  });

  document.querySelectorAll("[data-new-client-field]").forEach((input) => {
    const handler = (event) => {
      appState.newClientDraft[event.target.dataset.newClientField] = event.target.value;
    };
    input.oninput = handler;
    input.onchange = handler;
  });

  document.querySelectorAll("[data-action='save-new-client']").forEach((button) => {
    button.onclick = () => {
      if (!appState.busy && typeof saveNewClientDraft === "function") saveNewClientDraft();
    };
  });
}

const baseRenderAppClientsDomFix = renderApp;
renderApp = function renderAppWithClientsDomFix() {
  baseRenderAppClientsDomFix();
  injectClientsNavigation();
  injectClientsView();
  attachClientsDomEvents();
  if (appState.currentView === "clients" && typeof loadClientsRegistry === "function" && !appState.clientsLoaded) {
    loadClientsRegistry().then(() => renderApp()).catch((error) => setFlashMessage(`Clienti non caricati: ${error.message}`));
  }
};

renderApp();