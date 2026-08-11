(function () {
  function normalize(value) {
    return String(value ?? "")
      .trim()
      .toLocaleLowerCase("it-IT");
  }

  function filterInventorySelect(input) {
    const row = input.closest("td");
    const select = row?.querySelector("[data-quote-inventory-pick]");
    if (!select) return;
    const query = normalize(input.value);
    let visibleCount = 0;

    Array.from(select.options).forEach((option, index) => {
      if (index === 0 || option.selected) {
        option.hidden = false;
        option.disabled = false;
        return;
      }
      const matches = !query || normalize(option.textContent).includes(query);
      option.hidden = !matches;
      option.disabled = !matches;
      if (matches) visibleCount += 1;
    });

    const emptyLabel = select.querySelector("[data-search-empty]");
    if (emptyLabel) emptyLabel.remove();
    if (query && visibleCount === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Nessun risultato";
      option.disabled = true;
      option.dataset.searchEmpty = "true";
      select.appendChild(option);
    }
  }

  function mountInventorySearch() {
    if (appState.currentView !== "new-order") return;
    document.querySelectorAll("[data-quote-inventory-pick]").forEach((select) => {
      const parent = select.parentElement;
      if (!parent || parent.querySelector("[data-quote-inventory-search]")) return;
      const input = document.createElement("input");
      input.type = "search";
      input.className = "field-value quote-inventory-search";
      input.placeholder = "Cerca in magazzino per nome o codice";
      input.setAttribute("aria-label", "Cerca materiale o articolo in magazzino");
      input.dataset.quoteInventorySearch = "true";
      parent.insertBefore(input, select);
    });
  }

  function ensureStyles() {
    if (document.getElementById("quote-inventory-search-styles")) return;
    const style = document.createElement("style");
    style.id = "quote-inventory-search-styles";
    style.textContent = `
      .quote-inventory-search{width:100%;margin-bottom:8px;min-width:220px}
      .quote-inventory-search + [data-quote-inventory-pick]{width:100%}
      @media (max-width:760px){.quote-inventory-search{min-width:180px}}
    `;
    document.head.appendChild(style);
  }

  const baseRenderApp = renderApp;
  renderApp = function renderAppWithInventorySearch() {
    baseRenderApp();
    ensureStyles();
    mountInventorySearch();
  };

  document.addEventListener("input", (event) => {
    const input = event.target.closest?.("[data-quote-inventory-search]");
    if (input) filterInventorySelect(input);
  });

  document.addEventListener("search", (event) => {
    const input = event.target.closest?.("[data-quote-inventory-search]");
    if (input) filterInventorySelect(input);
  });

  if (document.getElementById("app")?.innerHTML) {
    ensureStyles();
    mountInventorySearch();
  }
})();
