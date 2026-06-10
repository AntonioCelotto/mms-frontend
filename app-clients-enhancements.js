const CLIENTS_SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
const CLIENTS_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk".replace("eyJpc3MiOiJIUzI1Ni", "eyJpc3MiOiJzdXBhYmFzZS");

const CLIENT_BILLING_FIELDS = typeof BILLING_FIELDS !== "undefined" ? BILLING_FIELDS : [
  ["billing_company_name", "Ragione sociale"],
  ["billing_vat_number", "Partita IVA"],
  ["billing_tax_code", "Codice fiscale"],
  ["billing_address", "Indirizzo fatturazione"],
  ["billing_city", "Citta'"],
  ["billing_zip", "CAP"],
  ["billing_country", "Paese"],
  ["billing_sdi", "Codice SDI"],
  ["billing_pec", "PEC"],
];

function ensureClientsState() {
  if (!appState.clientsSearch) appState.clientsSearch = "";
  if (!appState.selectedClientId) appState.selectedClientId = null;
  if (!appState.clientsLoaded) appState.clientsLoaded = false;
  if (!Array.isArray(appState.realClients)) appState.realClients = [];
  if (!Array.isArray(appState.realClientOrders)) appState.realClientOrders = [];
  if (!Array.isArray(appState.realClientPayments)) appState.realClientPayments = [];
  if (!appState.newClientDraft || typeof appState.newClientDraft !== "object") {
    appState.newClientDraft = { name: "", email: "", phone: "", payment_terms: "", notes: "" };
  }
}

function clientsHeaders(extra = {}) {
  return {
    apikey: CLIENTS_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${CLIENTS_SUPABASE_ANON_KEY}`,
    ...extra,
  };
}

async function clientsRequest(path, options = {}) {
  const response = await fetch(`${CLIENTS_SUPABASE_URL}${path}`, {
    ...options,
    headers: clientsHeaders(options.headers || {}),
  });
  const raw = await response.text().catch(() => "");
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      payload = { detail: raw.slice(0, 240) };
    }
  }
  if (!response.ok) {
    const detail = payload?.detail || payload?.message || payload?.error || "";
    throw new Error(detail || `Richiesta non riuscita (${response.status})`);
  }
  return payload;
}

function escapeClientHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clientBillingSelect() {
  return ["id", "name", "email", "phone", "payment_terms", "notes", "visibility_enabled", ...CLIENT_BILLING_FIELDS.map(([field]) => field)].join(",");
}

async function loadClientsRegistry(force = false) {
  ensureClientsState();
  if (!force && appState.clientsLoaded) return;

  const [clients, orders, payments] = await Promise.all([
    clientsRequest(`/rest/v1/clients?select=${clientBillingSelect()}&order=name.asc`),
    clientsRequest("/rest/v1/orders?select=id,order_number,client_id,category,status,priority,order_date,estimated_delivery_date,internal_notes&order=id.desc"),
    clientsRequest("/rest/v1/payments?select=id,order_id,payment_type,amount,due_date,paid_date,status,notes,created_at&order=created_at.desc"),
  ]);

  appState.realClients = Array.isArray(clients) ? clients : [];
  appState.realClientOrders = Array.isArray(orders) ? orders : [];
  appState.realClientPayments = Array.isArray(payments) ? payments : [];
  appState.clientsLoaded = true;

  if (!appState.selectedClientId && appState.realClients.length) {
    const selectedOrder = getSelectedOrder?.();
    const selected = appState.realClients.find((client) => client.name === selectedOrder?.client) || appState.realClients[0];
    appState.selectedClientId = selected.id;
  }

  syncAppDataClients();
}

function syncAppDataClients() {
  if (!appState.realClients.length) return;
  const ordersByClient = new Map();
  appState.realClientOrders.forEach((order) => {
    const key = Number(order.client_id);
    if (!ordersByClient.has(key)) ordersByClient.set(key, []);
    ordersByClient.get(key).push(Number(order.order_number || order.id));
  });

  appData.clients = appState.realClients.map((client) => ({
    ...client,
    name: client.name,
    email: client.email || "",
    phone: client.phone || "",
    paymentRule: client.payment_terms || "",
    note: client.notes || "",
    visibilityEnabled: !!client.visibility_enabled,
    trust: "Cliente attivo",
    workType: client.payment_terms || "Condizioni da definire",
    orders: ordersByClient.get(Number(client.id)) || [],
    tags: [client.payment_terms || "Condizioni pagamento da definire"],
  }));
}

function getSelectedClientRecord() {
  ensureClientsState();
  return appState.realClients.find((client) => Number(client.id) === Number(appState.selectedClientId)) || appState.realClients[0] || null;
}

function getClientOrders(client) {
  if (!client) return [];
  return appState.realClientOrders.filter((order) => Number(order.client_id) === Number(client.id));
}

function getClientPayments(client) {
  const orderIds = new Set(getClientOrders(client).map((order) => Number(order.id)));
  return appState.realClientPayments.filter((payment) => orderIds.has(Number(payment.order_id)));
}

function paymentLabel(value) {
  const labels = { acconto: "Acconto", saldo: "Saldo", scadenza: "Scadenza", da_pagare: "Da pagare", pagato: "Pagato", scaduto: "Scaduto", autorizzato: "Autorizzato" };
  return labels[value] || String(value || "").replace(/_/g, " ");
}

function renderClientsRegistry() {
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
          <button class="action-pill" data-action="save-new-client">Salva nuovo cliente</button>
        </div>
      </div>

      <div class="layout-2">
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
              <thead>
                <tr><th>Cliente</th><th>Contatto</th><th>Ordini</th><th>Azioni</th></tr>
              </thead>
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

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Nuovo cliente</h3>
                <p>Crealo prima, poi lo selezioni nel nuovo ordine.</p>
              </div>
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
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Scheda cliente${selected ? ` - ${escapeClientHtml(selected.name)}` : ""}</h3>
              <p>Dati fiscali, ordini e movimenti amministrativi collegati.</p>
            </div>
            ${selected ? `<button class="action-pill" data-client-new-order="${escapeClientHtml(selected.name)}">Nuovo ordine cliente</button>` : ""}
          </div>
          ${selected ? renderSelectedClientDetail(selected, selectedOrders, selectedPayments) : `<div class="empty-state">Seleziona un cliente per aprire la scheda.</div>`}
        </div>
      </div>
    </section>
  `;
}

function renderSelectedClientDetail(client, orders, payments) {
  return `
    <div class="layout-2">
      <div>
        <div class="profile-lines">
          <div class="line"><div class="muted">Email</div><div>${escapeClientHtml(client.email || "-")}</div></div>
          <div class="line"><div class="muted">Telefono</div><div>${escapeClientHtml(client.phone || "-")}</div></div>
          <div class="line"><div class="muted">Pagamento</div><div>${escapeClientHtml(client.payment_terms || "Da definire")}</div></div>
          <div class="line"><div class="muted">Note</div><div>${escapeClientHtml(client.notes || "Nessuna nota")}</div></div>
          ${CLIENT_BILLING_FIELDS.map(([field, label]) => `<div class="line"><div class="muted">${label}</div><div>${escapeClientHtml(client[field] || "-")}</div></div>`).join("")}
        </div>
      </div>
      <div style="display:grid; gap:16px;">
        <div>
          <div class="section-title"><div><h3>Ordini collegati</h3><p>${orders.length} ordini per questo cliente.</p></div></div>
          <table>
            <thead><tr><th>Ordine</th><th>Categoria</th><th>Stato</th><th>Consegna</th><th></th></tr></thead>
            <tbody>${orders.length ? orders.map((order) => `
              <tr>
                <td>#${escapeClientHtml(order.order_number || order.id)}</td>
                <td>${escapeClientHtml(order.category || "-")}</td>
                <td><span class="table-status ${getStatusClass(String(order.status || ""))}">${escapeClientHtml(String(order.status || "").replace(/_/g, " "))}</span></td>
                <td>${escapeClientHtml(order.estimated_delivery_date || "-")}</td>
                <td><button class="mini-btn" data-detail="${escapeClientHtml(order.order_number || order.id)}">Apri</button></td>
              </tr>
            `).join("") : `<tr><td colspan="5"><div class="empty-state">Nessun ordine collegato.</div></td></tr>`}</tbody>
          </table>
        </div>
        <div>
          <div class="section-title"><div><h3>Pagamenti cliente</h3><p>Acconti, saldi e scadenze degli ordini collegati.</p></div></div>
          <table>
            <thead><tr><th>Tipo</th><th>Importo</th><th>Scadenza</th><th>Stato</th><th>Note</th></tr></thead>
            <tbody>${payments.length ? payments.map((payment) => `
              <tr>
                <td>${paymentLabel(payment.payment_type)}</td>
                <td>${payment.amount ?? ""}</td>
                <td>${escapeClientHtml(payment.due_date || "-")}</td>
                <td><span class="table-status ${getStatusClass(paymentLabel(payment.status))}">${paymentLabel(payment.status)}</span></td>
                <td>${escapeClientHtml(payment.notes || "")}</td>
              </tr>
            `).join("") : `<tr><td colspan="5"><div class="empty-state">Nessun pagamento collegato.</div></td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function saveNewClientDraft() {
  ensureClientsState();
  const name = appState.newClientDraft.name.trim();
  if (!name) {
    setFlashMessage("Inserisci il nome cliente");
    return;
  }
  setBusy(true);
  try {
    const rows = await clientsRequest("/rest/v1/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        name,
        email: appState.newClientDraft.email || null,
        phone: appState.newClientDraft.phone || null,
        payment_terms: appState.newClientDraft.payment_terms || null,
        notes: appState.newClientDraft.notes || null,
      }),
    });
    const created = Array.isArray(rows) ? rows[0] : null;
    appState.newClientDraft = { name: "", email: "", phone: "", payment_terms: "", notes: "" };
    appState.clientsLoaded = false;
    await loadClientsRegistry(true);
    if (created?.id) appState.selectedClientId = created.id;
    setFlashMessage(`Cliente ${name} salvato`);
  } catch (error) {
    setFlashMessage(`Creazione cliente non riuscita: ${error.message}`);
  } finally {
    appState.busy = false;
    renderApp();
  }
}

function enhanceClientSelectorInNewOrder() {
  ensureClientsState();
  const input = document.querySelector("section.view.active input[data-draft='client']");
  if (!input || input.dataset.clientSelectorEnhanced === "true") return;

  const wrapper = document.createElement("div");
  wrapper.style.display = "grid";
  wrapper.style.gap = "8px";

  const select = document.createElement("select");
  select.className = input.className || "filter-chip";
  select.dataset.draftClientSelect = "true";
  const current = appState.draftOrder.client || "";
  select.innerHTML = [
    `<option value="">Seleziona cliente</option>`,
    ...appState.realClients.map((client) => `<option value="${escapeClientHtml(client.name)}" ${client.name === current ? "selected" : ""}>${escapeClientHtml(client.name)}</option>`),
    `<option value="__new__" ${current && !appState.realClients.some((client) => client.name === current) ? "selected" : ""}>+ Nuovo cliente / nome libero</option>`,
  ].join("");

  const freeInput = document.createElement("input");
  freeInput.className = input.className || "field-value";
  freeInput.dataset.draft = "client";
  freeInput.placeholder = "Scrivi nuovo cliente";
  freeInput.value = current && !appState.realClients.some((client) => client.name === current) ? current : "";
  freeInput.style.display = select.value === "__new__" ? "" : "none";

  select.addEventListener("change", (event) => {
    if (event.target.value === "__new__") {
      freeInput.style.display = "";
      appState.draftOrder.client = freeInput.value;
      freeInput.focus();
      return;
    }
    freeInput.style.display = "none";
    appState.draftOrder.client = event.target.value;
  });
  freeInput.addEventListener("input", (event) => {
    appState.draftOrder.client = event.target.value;
  });

  wrapper.appendChild(select);
  wrapper.appendChild(freeInput);
  input.replaceWith(wrapper);
}

const baseRenderLayoutClientsEnhancements = renderLayout;
renderLayout = function renderLayoutWithClients() {
  ensureClientsState();
  return baseRenderLayoutClientsEnhancements()
    .replace(
      `{ id: "client", label: "Scheda cliente", caption: "Storico, regole e contesto cliente" },`,
      `{ id: "clients", label: "Clienti", caption: "Anagrafiche, ordini e pagamenti" },\n    { id: "client", label: "Scheda cliente", caption: "Storico, regole e contesto cliente" },`
    )
    .replace("${renderInventory()}", "${renderClientsRegistry()}${renderInventory()}");
};

const baseRenderOrderDetailClientsEnhancements = renderOrderDetail;
renderOrderDetail = function renderOrderDetailWithClientBox() {
  const order = getSelectedOrder();
  const client = appState.realClients.find((item) => item.name === order?.client);
  const clientBox = `
    <div style="height:16px"></div>
    <div class="surface">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Cliente collegato</h3>
            <p>${escapeClientHtml(order?.client || "Cliente non definito")}</p>
          </div>
          <button class="action-pill" data-open-client-from-order="${client?.id || ""}" data-client-name="${escapeClientHtml(order?.client || "")}">Apri scheda cliente</button>
        </div>
      </div>
    </div>
  `;
  return baseRenderOrderDetailClientsEnhancements().replace("</section>", `${clientBox}</section>`);
};

const baseNavigateClientsEnhancements = navigate;
navigate = function navigateClientsEnhancements(view, orderId) {
  baseNavigateClientsEnhancements(view, orderId);
  if (view === "clients" || view === "new-order" || view === "order-detail") {
    loadClientsRegistry().then(() => renderApp()).catch(() => {});
  }
};

const baseRenderAppClientsEnhancements = renderApp;
renderApp = function renderAppClientsEnhancements() {
  baseRenderAppClientsEnhancements();
  ensureClientsState();
  if ((appState.currentView === "clients" || appState.currentView === "new-order" || appState.currentView === "order-detail") && !appState.clientsLoaded) {
    loadClientsRegistry().then(() => renderApp()).catch(() => {});
  }
  if (appState.currentView === "new-order") enhanceClientSelectorInNewOrder();
};

const baseAttachEventsClientsEnhancements = attachEvents;
attachEvents = function attachEventsClientsEnhancements() {
  baseAttachEventsClientsEnhancements();

  document.querySelectorAll("[data-select-client]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.selectedClientId = Number(button.dataset.selectClient);
      renderApp();
    });
  });

  document.querySelectorAll("[data-open-client-from-order]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.openClientFromOrder);
      const name = button.dataset.clientName;
      const byName = appState.realClients.find((client) => client.name === name);
      appState.selectedClientId = id || byName?.id || appState.selectedClientId;
      navigate("clients");
    });
  });

  document.querySelectorAll("[data-client-new-order]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.draftOrder.client = button.dataset.clientNewOrder;
      navigate("new-order");
    });
  });

  document.querySelectorAll("[data-clients-search]").forEach((input) => {
    input.addEventListener("input", (event) => {
      appState.clientsSearch = event.target.value;
      renderApp();
    });
  });

  document.querySelectorAll("[data-new-client-field]").forEach((input) => {
    const handler = (event) => {
      appState.newClientDraft[event.target.dataset.newClientField] = event.target.value;
    };
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });

  document.querySelectorAll("[data-action='save-new-client']").forEach((button) => {
    button.addEventListener("click", () => {
      if (!appState.busy) saveNewClientDraft();
    });
  });
};

ensureClientsState();