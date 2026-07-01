(function () {
  const LOCAL_SEARCH_VIEWS = {
    quotes: {
      title: "Cerca preventivi",
      placeholder: "Cerca numero, cliente, stato o categoria",
    },
    payments: {
      title: "Cerca pagamenti",
      placeholder: "Cerca ordine, cliente, stato o scadenza",
    },
    accounts: {
      title: "Cerca account",
      placeholder: "Cerca nome, mail, ruolo o competenza",
    },
  };

  function searchState() {
    if (!appState.searchButtons) {
      appState.searchButtons = {
        global: appState.search || "",
        calendar: appState.calendarFilters?.orderQuery || "",
        clients: appState.clientsSearch || "",
        quotes: "",
        payments: "",
        accounts: "",
      };
    }
    return appState.searchButtons;
  }

  function searchEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensureSearchStyles() {
    if (document.getElementById("search-filter-unification-styles")) return;
    const style = document.createElement("style");
    style.id = "search-filter-unification-styles";
    style.textContent = `
      .search-action-row{display:flex;gap:8px;align-items:center;min-width:0}
      .search-action-row .filter-chip,.search-action-row input{min-width:0;flex:1}
      .search-action-row .action-pill{white-space:nowrap}
      .search-unified-panel{margin-bottom:16px}
      .search-unified-panel .filter-row{grid-template-columns:minmax(220px,1fr) auto}
      .search-filter-hidden{display:none!important}
      @media(max-width:760px){.search-action-row,.search-unified-panel .filter-row{display:grid;grid-template-columns:1fr}.search-action-row .action-pill{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function applySearch(kind) {
    const state = searchState();
    if (kind === "global") {
      appState.search = state.global || "";
      renderApp();
      return;
    }
    if (kind === "calendar") {
      if (!appState.calendarFilters) appState.calendarFilters = {};
      appState.calendarFilters.orderQuery = state.calendar || "";
      renderApp();
      return;
    }
    if (kind === "clients") {
      appState.clientsSearch = state.clients || "";
      renderApp();
      return;
    }
    state[kind] = state[kind] || "";
    applyLocalSearch(kind);
  }

  function localSearchTargets(section) {
    return Array.from(section.querySelectorAll("tbody tr, .ledger-row, .feed-row")).filter(
      (node) => !node.closest(".search-unified-panel")
    );
  }

  function applyLocalSearch(kind) {
    const section = document.querySelector(`section.view.${kind}.active`) || document.querySelector("section.view.active");
    if (!section) return;
    const query = (searchState()[kind] || "").trim().toLowerCase();
    localSearchTargets(section).forEach((node) => {
      const text = node.textContent.toLowerCase();
      node.classList.toggle("search-filter-hidden", !!query && !text.includes(query));
    });
  }

  function enhanceGlobalSearch() {
    const input = document.getElementById("global-search");
    if (!input) return;
    const state = searchState();
    input.value = state.global ?? appState.search ?? "";
    const label = input.closest("label");
    if (!label || label.classList.contains("search-action-row")) return;
    label.classList.add("search-action-row");
    const button = document.createElement("button");
    button.className = "action-pill";
    button.type = "button";
    button.dataset.searchApply = "global";
    button.textContent = "Cerca";
    label.appendChild(button);
  }

  function enhanceCalendarSearch() {
    const input = document.querySelector("[data-calendar-search='orderQuery']");
    if (!input) return;
    input.value = searchState().calendar ?? appState.calendarFilters?.orderQuery ?? "";
    if (input.parentElement?.classList.contains("search-action-row")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "search-action-row";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    const button = document.createElement("button");
    button.className = "action-pill";
    button.type = "button";
    button.dataset.searchApply = "calendar";
    button.textContent = "Cerca";
    wrapper.appendChild(button);
  }

  function enhanceClientsSearch() {
    const input = document.querySelector("[data-clients-search]");
    if (!input) return;
    input.value = searchState().clients ?? appState.clientsSearch ?? "";
    if (input.parentElement?.classList.contains("search-action-row")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "search-action-row";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    const button = document.createElement("button");
    button.className = "action-pill";
    button.type = "button";
    button.dataset.searchApply = "clients";
    button.textContent = "Cerca";
    wrapper.appendChild(button);
  }

  function localSearchPanel(kind) {
    const config = LOCAL_SEARCH_VIEWS[kind];
    if (!config) return "";
    return `
      <div class="surface search-unified-panel" data-local-search-panel="${kind}">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>${searchEscape(config.title)}</h3>
              <p>Scrivi il testo e premi Cerca per filtrare l'elenco.</p>
            </div>
          </div>
          <div class="filter-row">
            <input class="filter-chip" data-local-search-input="${kind}" value="${searchEscape(searchState()[kind] || "")}" placeholder="${searchEscape(config.placeholder)}" />
            <button class="action-pill" data-search-apply="${kind}" type="button">Cerca</button>
          </div>
        </div>
      </div>
    `;
  }

  function enhanceLocalSearch(kind) {
    const config = LOCAL_SEARCH_VIEWS[kind];
    if (!config || appState.currentView !== kind) return;
    const section = document.querySelector(`section.view.${kind}.active`) || document.querySelector("section.view.active");
    if (!section || section.querySelector(`[data-local-search-panel='${kind}']`)) {
      applyLocalSearch(kind);
      return;
    }
    const header = section.querySelector(".screen-header");
    if (!header) return;
    header.insertAdjacentHTML("afterend", localSearchPanel(kind));
    applyLocalSearch(kind);
  }

  function enhanceSearchUi() {
    ensureSearchStyles();
    enhanceGlobalSearch();
    enhanceCalendarSearch();
    enhanceClientsSearch();
    Object.keys(LOCAL_SEARCH_VIEWS).forEach(enhanceLocalSearch);
  }

  function managedInputKind(target) {
    if (target.id === "global-search") return "global";
    if (target.matches("[data-calendar-search='orderQuery']")) return "calendar";
    if (target.matches("[data-clients-search]")) return "clients";
    if (target.matches("[data-local-search-input]")) return target.dataset.localSearchInput;
    return "";
  }

  document.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const kind = managedInputKind(target);
      if (!kind) return;
      event.stopImmediatePropagation();
      searchState()[kind] = target.value;
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || event.key !== "Enter") return;
      const kind = managedInputKind(target);
      if (!kind) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      searchState()[kind] = target.value;
      applySearch(kind);
    },
    true
  );

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-search-apply]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const kind = button.dataset.searchApply;
    const input =
      kind === "global"
        ? document.getElementById("global-search")
        : kind === "calendar"
          ? document.querySelector("[data-calendar-search='orderQuery']")
          : kind === "clients"
            ? document.querySelector("[data-clients-search]")
            : document.querySelector(`[data-local-search-input='${kind}']`);
    if (input) searchState()[kind] = input.value;
    applySearch(kind);
  });

  const baseRenderAppSearchUnification = renderApp;
  renderApp = function renderAppSearchUnification() {
    baseRenderAppSearchUnification();
    enhanceSearchUi();
  };

  if (document.getElementById("app")?.innerHTML) {
    enhanceSearchUi();
  }
})();
