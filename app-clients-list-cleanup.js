(function () {
  function isClientsView() {
    const active = document.querySelector("section.view.active");
    const title = active?.querySelector(".screen-header h2")?.textContent.trim().toLowerCase();
    return appState.currentView === "clients" || title === "clienti";
  }

  function shouldRemovePanel(panel) {
    const text = panel.textContent || "";
    return (
      panel.classList.contains("client-edit-overlay-module") ||
      panel.classList.contains("clients-edit-panel") ||
      text.includes("Modifica cliente selezionato") ||
      text.includes("Modifica scheda cliente")
    );
  }

  function removeClientsEditPanels() {
    if (!isClientsView()) return;
    document.querySelectorAll(".client-edit-overlay-module, .clients-edit-panel, section.view.active .surface").forEach((panel) => {
      if (shouldRemovePanel(panel)) panel.remove();
    });
  }

  function renderClientsNewClientPanel() {
    return `
      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Nuovo cliente</h3>
              <p>Inserisci il cliente una volta sola, poi lo selezioni nei preventivi e negli ordini.</p>
            </div>
            <button class="action-pill" data-action="save-new-client">${appState.busy ? "Salvataggio..." : "Salva nuovo cliente"}</button>
          </div>
          <div class="form-grid">
            <div class="field"><label>Nome / brand</label><input class="field-value" data-new-client-field="name" value="${escapeClientHtml(appState.newClientDraft.name)}" /></div>
            <div class="field"><label>Email</label><input class="field-value" data-new-client-field="email" value="${escapeClientHtml(appState.newClientDraft.email)}" /></div>
            <div class="field"><label>Telefono</label><input class="field-value" data-new-client-field="phone" value="${escapeClientHtml(appState.newClientDraft.phone)}" /></div>
            <div class="field"><label>Condizioni pagamento</label><input class="field-value" data-new-client-field="payment_terms" value="${escapeClientHtml(appState.newClientDraft.payment_terms)}" placeholder="es. Acconto + saldo" /></div>
            <div class="field span-2"><label>Note</label><textarea class="field-value" data-new-client-field="notes" style="min-height:84px; align-items:flex-start; padding-top:12px;">${escapeClientHtml(appState.newClientDraft.notes)}</textarea></div>
          </div>
        </div>
      </div>
    `;
  }

  function renderClientsListPanel(clients, selected) {
    return `
      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Elenco clienti</h3>
              <p>Cerca e apri la scheda cliente.</p>
            </div>
            <input class="filter-chip" data-clients-search value="${escapeClientHtml(appState.clientsSearch)}" placeholder="Cerca cliente, mail o P.IVA" />
          </div>
          <table>
            <thead><tr><th>Cliente</th><th>Contatto</th><th>Ordini</th><th>Azioni</th></tr></thead>
            <tbody>
              ${clients.length ? clients.map((client) => {
                const count = getClientOrders(client).length;
                return `
                  <tr class="${Number(selected?.id) === Number(client.id) ? "clickable-row" : ""}">
                    <td><strong>${escapeClientHtml(client.name)}</strong><div class="muted">${escapeClientHtml(client.payment_terms || "Condizioni da definire")}</div></td>
                    <td>${escapeClientHtml(client.email || "-")}<br /><span class="muted">${escapeClientHtml(client.phone || "")}</span></td>
                    <td>${count}</td>
                    <td><button class="mini-btn" data-select-client="${client.id}">Apri scheda</button></td>
                  </tr>
                `;
              }).join("") : `<tr><td colspan="4"><div class="empty-state">Nessun cliente trovato.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderClientsDetailPanel(selected, orders, payments) {
    return `
      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Scheda cliente${selected ? ` - ${escapeClientHtml(selected.name)}` : ""}</h3>
              <p>Dati fiscali, ordini e movimenti amministrativi collegati.</p>
            </div>
            ${selected ? `<button class="action-pill" data-client-new-order="${escapeClientHtml(selected.name)}">Nuovo ordine cliente</button>` : ""}
          </div>
          ${selected ? renderSelectedClientDetail(selected, orders, payments) : `<div class="empty-state">Seleziona un cliente per aprire la scheda.</div>`}
        </div>
      </div>
    `;
  }

  if (typeof renderClientsRegistry === "function") {
    renderClientsRegistry = function renderClientsRegistryCleanLayout() {
      ensureClientsState();
      const query = appState.clientsSearch.trim().toLowerCase();
      const clients = appState.realClients.filter((client) => {
        const haystack = `${client.name || ""} ${client.email || ""} ${client.phone || ""} ${client.billing_vat_number || ""}`.toLowerCase();
        return !query || haystack.includes(query);
      });
      const selected = getSelectedClientRecord();
      const selectedOrders = getClientOrders(selected);
      const selectedPayments = getClientPayments(selected);

      return `
        <section class="view ${appState.currentView === "clients" ? "active" : ""}">
          <div class="screen-header">
            <div>
              <h2>Clienti</h2>
              <p>Anagrafica clienti, dati fatturazione, ordini collegati e storico pagamenti.</p>
            </div>
            <div class="screen-actions">
              <div class="ghost-pill">${appState.realClients.length} clienti salvati</div>
            </div>
          </div>

          ${renderClientsNewClientPanel()}

          <div class="layout-2">
            ${renderClientsListPanel(clients, selected)}
            ${renderClientsDetailPanel(selected, selectedOrders, selectedPayments)}
          </div>
        </section>
      `;
    };
  }

  if (typeof clientOverlayMount === "function") {
    clientOverlayMount = function clientOverlayMountDisabledOnClientsList() {
      removeClientsEditPanels();
    };
  }

  if (typeof clientOverlayRefresh === "function") {
    clientOverlayRefresh = function clientOverlayRefreshDisabledOnClientsList() {
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

  const observer = new MutationObserver(() => removeClientsEditPanels());
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", (event) => {
    const openClient = event.target.closest("[data-select-client], [data-clients-fallback-select]");
    if (!openClient || !isClientsView()) return;
    window.setTimeout(removeClientsEditPanels, 0);
  }, true);

  removeClientsEditPanels();
})();
