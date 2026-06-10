const PAYMENTS_SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
const PAYMENTS_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";

const BILLING_FIELDS = [
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

function ensurePaymentState() {
  if (!appState.billingDraft || typeof appState.billingDraft !== "object") appState.billingDraft = {};
  if (!appState.billingLoadedClientId) appState.billingLoadedClientId = null;
  if (!appState.billingClient || typeof appState.billingClient !== "object") appState.billingClient = null;
  if (!appState.paymentDraft || typeof appState.paymentDraft !== "object") resetPaymentDraft(false);
  if (!Array.isArray(appState.selectedOrderPayments)) appState.selectedOrderPayments = [];
  if (!appState.paymentOrderId) appState.paymentOrderId = appState.selectedOrderId;
}

function resetPaymentDraft(shouldRender = true) {
  appState.paymentDraft = {
    id: "",
    payment_type: "acconto",
    amount: "",
    due_date: "",
    paid_date: "",
    status: "da_pagare",
    notes: "",
  };
  if (shouldRender) renderApp();
}

function paymentHeaders(extra = {}) {
  return {
    apikey: PAYMENTS_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${PAYMENTS_SUPABASE_ANON_KEY}`,
    ...extra,
  };
}

async function paymentRequest(path, options = {}) {
  const response = await fetch(`${PAYMENTS_SUPABASE_URL}${path}`, {
    ...options,
    headers: paymentHeaders(options.headers || {}),
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

function escapePaymentValue(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizePaymentLabel(value) {
  const labels = {
    acconto: "Acconto",
    saldo: "Saldo",
    scadenza: "Scadenza",
    da_pagare: "Da pagare",
    pagato: "Pagato",
    scaduto: "Scaduto",
    autorizzato: "Autorizzato",
  };
  return labels[value] || String(value || "").replace(/_/g, " ");
}

function getPaymentOrderId(order = getPaymentSelectedOrder()) {
  return Number(order?.db_id || order?.id || appState.selectedOrderId);
}

function getPaymentSelectedOrder() {
  ensurePaymentState();
  return appData.orders.find((order) => Number(order.id) === Number(appState.paymentOrderId)) || getSelectedOrder();
}

function getPaymentClientFromSelectedOrder() {
  const order = getPaymentSelectedOrder();
  return appData.clients.find((client) => client.name === order?.client) || appState.billingClient || null;
}

function emptyBillingDraft(client) {
  return BILLING_FIELDS.reduce((draft, [field]) => {
    draft[field] = client?.[field] || "";
    return draft;
  }, {});
}

async function fetchBillingClientFromSelectedOrder() {
  const order = getPaymentSelectedOrder();
  const knownClient = appData.clients.find((client) => client.name === order?.client && client.id);
  if (knownClient && BILLING_FIELDS.some(([field]) => Object.prototype.hasOwnProperty.call(knownClient, field))) return knownClient;

  const dbOrderId = getPaymentOrderId(order);
  if (!dbOrderId) return knownClient || null;
  const orderRows = await paymentRequest(`/rest/v1/orders?select=id,client_id&id=eq.${dbOrderId}&limit=1`);
  const rawOrder = Array.isArray(orderRows) ? orderRows[0] : null;
  if (!rawOrder?.client_id) return knownClient || null;

  const fields = ["id", "name", "email", "phone", "payment_terms", ...BILLING_FIELDS.map(([field]) => field)].join(",");
  const clientRows = await paymentRequest(`/rest/v1/clients?select=${fields}&id=eq.${rawOrder.client_id}&limit=1`);
  const client = Array.isArray(clientRows) ? clientRows[0] : null;
  if (client) appState.billingClient = client;
  return client || knownClient || null;
}

async function loadBillingForSelectedClient(force = false) {
  ensurePaymentState();
  const client = await fetchBillingClientFromSelectedOrder();
  if (!client?.id) return;
  if (!force && appState.billingLoadedClientId === client.id) return;

  const fields = ["id", "name", ...BILLING_FIELDS.map(([field]) => field)].join(",");
  const rows = await paymentRequest(`/rest/v1/clients?select=${fields}&id=eq.${client.id}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  const billingClient = row || client;
  appState.billingClient = billingClient;
  appState.billingDraft = emptyBillingDraft(billingClient);
  appState.billingLoadedClientId = client.id;
}

async function loadPaymentsForSelectedOrder(force = false) {
  ensurePaymentState();
  const order = getPaymentSelectedOrder();
  const dbOrderId = getPaymentOrderId(order);
  if (!dbOrderId) return;
  if (!force && appState.paymentLoadedOrderDbId === dbOrderId) return;

  const rows = await paymentRequest(
    `/rest/v1/payments?select=id,order_id,payment_type,amount,due_date,paid_date,status,notes,created_at&order_id=eq.${dbOrderId}&order=created_at.desc`
  );
  appState.selectedOrderPayments = Array.isArray(rows) ? rows : [];
  appState.paymentLoadedOrderDbId = dbOrderId;
}

function csvValue(value) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvValue).join(";")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportPaymentsForAccountant() {
  setBusy(true);
  try {
    const query = new URLSearchParams({
      select: "id,order_id,payment_type,amount,due_date,paid_date,status,notes,created_at",
      order: "created_at.desc",
    });
    const [payments, orders, clients] = await Promise.all([
      paymentRequest(`/rest/v1/payments?${query.toString()}`),
      paymentRequest("/rest/v1/orders?select=id,order_number,client_id,category,order_date,estimated_delivery_date&order=id.desc"),
      paymentRequest(`/rest/v1/clients?select=id,name,email,phone,payment_terms,${BILLING_FIELDS.map(([field]) => field).join(",")}`),
    ]);

    const ordersById = new Map((orders || []).map((order) => [Number(order.id), order]));
    const clientsById = new Map((clients || []).map((client) => [Number(client.id), client]));
    const rows = [[
      "ID pagamento", "Ordine", "Cliente", "Ragione sociale", "Partita IVA", "Codice fiscale", "Indirizzo", "Citta'", "CAP", "Paese", "SDI", "PEC", "Tipo pagamento", "Importo", "Scadenza", "Data pagamento", "Stato", "Note", "Data registrazione",
    ]];

    (payments || []).forEach((payment) => {
      const order = ordersById.get(Number(payment.order_id)) || {};
      const client = clientsById.get(Number(order.client_id)) || {};
      rows.push([
        payment.id,
        order.order_number || payment.order_id,
        client.name || "",
        client.billing_company_name || client.name || "",
        client.billing_vat_number || "",
        client.billing_tax_code || "",
        client.billing_address || "",
        client.billing_city || "",
        client.billing_zip || "",
        client.billing_country || "",
        client.billing_sdi || "",
        client.billing_pec || "",
        payment.payment_type || "",
        payment.amount ?? "",
        payment.due_date || "",
        payment.paid_date || "",
        payment.status || "",
        payment.notes || "",
        payment.created_at || "",
      ]);
    });

    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`pagamenti-commercialista-${today}.csv`, rows);
    setFlashMessage("Export pagamenti scaricato");
  } catch (error) {
    setFlashMessage(`Export pagamenti non riuscito: ${error.message}`);
  } finally {
    appState.busy = false;
    renderApp();
  }
}

async function saveBillingForSelectedClient() {
  ensurePaymentState();
  const client = await fetchBillingClientFromSelectedOrder();
  if (!client?.id) {
    setFlashMessage("Cliente non disponibile per la fatturazione");
    return;
  }

  setBusy(true);
  try {
    const body = {};
    BILLING_FIELDS.forEach(([field]) => {
      body[field] = appState.billingDraft[field] || null;
    });
    const rows = await paymentRequest(`/rest/v1/clients?id=eq.${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    const updated = Array.isArray(rows) ? rows[0] : null;
    if (updated) {
      Object.assign(client, updated);
      appState.billingClient = updated;
      appState.billingDraft = emptyBillingDraft(updated);
      appState.billingLoadedClientId = client.id;
    }
    setFlashMessage("Dati fatturazione cliente salvati");
  } catch (error) {
    setFlashMessage(`Salvataggio fatturazione non riuscito: ${error.message}`);
  } finally {
    appState.busy = false;
    renderApp();
  }
}

async function savePaymentDraftForSelectedOrder() {
  ensurePaymentState();
  const order = getPaymentSelectedOrder();
  const dbOrderId = getPaymentOrderId(order);
  if (!dbOrderId) {
    setFlashMessage("Seleziona un ordine prima di registrare il pagamento");
    return;
  }

  const draft = appState.paymentDraft;
  const amount = String(draft.amount || "").replace(",", ".").trim();
  const body = {
    order_id: dbOrderId,
    payment_type: draft.payment_type || "acconto",
    amount: amount ? Number(amount) : null,
    due_date: draft.due_date || null,
    paid_date: draft.paid_date || null,
    status: draft.status || "da_pagare",
    notes: draft.notes || null,
  };

  setBusy(true);
  try {
    if (draft.id) {
      await paymentRequest(`/rest/v1/payments?id=eq.${Number(draft.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(body),
      });
      setFlashMessage(`Pagamento ordine #${order.id} aggiornato`);
    } else {
      await paymentRequest("/rest/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(body),
      });
      setFlashMessage(`Pagamento ordine #${order.id} registrato`);
    }
    resetPaymentDraft(false);
    appState.paymentLoadedOrderDbId = null;
    await loadPaymentsForSelectedOrder(true);
    await refreshBootstrap().catch(() => {});
  } catch (error) {
    setFlashMessage(`Salvataggio pagamento non riuscito: ${error.message}`);
  } finally {
    appState.busy = false;
    renderApp();
  }
}

function editPaymentDraft(paymentId) {
  ensurePaymentState();
  const payment = appState.selectedOrderPayments.find((item) => Number(item.id) === Number(paymentId));
  if (!payment) return;
  appState.paymentDraft = {
    id: payment.id,
    payment_type: payment.payment_type || "acconto",
    amount: payment.amount ?? "",
    due_date: payment.due_date || "",
    paid_date: payment.paid_date || "",
    status: payment.status || "da_pagare",
    notes: payment.notes || "",
  };
  renderApp();
}

function renderOrderSelector(order) {
  return `
    <select class="filter-chip" data-payment-order style="min-width:220px;">
      ${appData.orders.map((item) => `
        <option value="${item.id}" ${Number(item.id) === Number(order?.id) ? "selected" : ""}>#${item.id} - ${escapePaymentValue(item.client)}</option>
      `).join("")}
    </select>
  `;
}

function renderSelectedPaymentRows() {
  const rows = appState.selectedOrderPayments || [];
  if (!rows.length) {
    return `<tr><td colspan="7"><div class="empty-state">Nessun movimento registrato per questo ordine.</div></td></tr>`;
  }
  return rows.map((payment) => `
    <tr>
      <td>${normalizePaymentLabel(payment.payment_type)}</td>
      <td>${payment.amount ?? ""}</td>
      <td>${payment.due_date || "-"}</td>
      <td>${payment.paid_date || "-"}</td>
      <td><span class="table-status ${getStatusClass(normalizePaymentLabel(payment.status))}">${normalizePaymentLabel(payment.status)}</span></td>
      <td>${escapePaymentValue(payment.notes || "")}</td>
      <td><button class="mini-btn" data-edit-payment="${payment.id}">Modifica</button></td>
    </tr>
  `).join("");
}

function renderBillingForm(client, draft, compact = false) {
  return `
    <div class="surface">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Dati fatturazione cliente</h3>
            <p>${client ? `Cliente collegato: ${escapePaymentValue(client.name)}` : "Apri o seleziona un ordine per caricare il cliente."}</p>
          </div>
          <button class="action-pill" data-action="save-billing">Salva fatturazione</button>
        </div>
        <div class="form-grid">
          ${BILLING_FIELDS.map(([field, label]) => `
            <div class="field ${field === "billing_address" ? "span-2" : ""}">
              <label>${label}</label>
              <input class="field-value" data-billing-field="${field}" value="${escapePaymentValue(draft[field] || "")}" />
            </div>
          `).join("")}
        </div>
        ${compact ? `<div style="height:12px"></div><button class="mini-btn" data-open-payments="${getPaymentSelectedOrder()?.id || appState.selectedOrderId}">Apri scheda pagamenti ordine</button>` : ""}
      </div>
    </div>
  `;
}

renderPayments = function renderPaymentsEnhanced() {
  ensurePaymentState();
  const order = getPaymentSelectedOrder();
  const client = getPaymentClientFromSelectedOrder();
  const draft = appState.billingDraft || emptyBillingDraft(client);
  const paymentDraft = appState.paymentDraft;

  return `
    <section class="view ${appState.currentView === "payments" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Pagamenti e fatturazione</h2>
          <p>Scegli un ordine, registra acconti o saldo e scarica il file per il commercialista.</p>
        </div>
        <div class="screen-actions">
          ${renderOrderSelector(order)}
          <button class="action-pill" data-action="export-payments">Scarica per commercialista</button>
        </div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Scheda pagamenti ordine #${order?.id || "-"}</h3>
                <p>${order ? `${escapePaymentValue(order.client)} - stato pagamento: ${escapePaymentValue(order.payment)}` : "Seleziona un ordine."}</p>
              </div>
              <button class="mini-btn" data-new-payment>Nuovo movimento</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Importo</th>
                  <th>Scadenza</th>
                  <th>Pagato il</th>
                  <th>Stato</th>
                  <th>Note</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>${renderSelectedPaymentRows()}</tbody>
            </table>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>${paymentDraft.id ? "Modifica movimento" : "Aggiungi pagamento"}</h3>
                <p>Registra acconto, saldo o una scadenza amministrativa.</p>
              </div>
              <button class="action-pill" data-action="save-payment-draft">${paymentDraft.id ? "Aggiorna" : "Salva pagamento"}</button>
            </div>
            <div class="form-grid">
              <div class="field">
                <label>Tipo</label>
                <select class="filter-chip" data-payment-field="payment_type">
                  ${["acconto", "saldo", "scadenza"].map((value) => `<option value="${value}" ${paymentDraft.payment_type === value ? "selected" : ""}>${normalizePaymentLabel(value)}</option>`).join("")}
                </select>
              </div>
              <div class="field">
                <label>Importo</label>
                <input class="field-value" data-payment-field="amount" inputmode="decimal" value="${escapePaymentValue(paymentDraft.amount)}" placeholder="es. 250" />
              </div>
              <div class="field">
                <label>Scadenza</label>
                <input class="field-value" type="date" data-payment-field="due_date" value="${escapePaymentValue(paymentDraft.due_date)}" />
              </div>
              <div class="field">
                <label>Data pagamento</label>
                <input class="field-value" type="date" data-payment-field="paid_date" value="${escapePaymentValue(paymentDraft.paid_date)}" />
              </div>
              <div class="field">
                <label>Stato</label>
                <select class="filter-chip" data-payment-field="status">
                  ${["da_pagare", "pagato", "scaduto", "autorizzato"].map((value) => `<option value="${value}" ${paymentDraft.status === value ? "selected" : ""}>${normalizePaymentLabel(value)}</option>`).join("")}
                </select>
              </div>
              <div class="field span-2">
                <label>Note</label>
                <textarea class="field-value" data-payment-field="notes" style="min-height:86px; align-items:flex-start; padding-top:12px;">${escapePaymentValue(paymentDraft.notes)}</textarea>
              </div>
            </div>
          </div>
        </div>
      </div>

      ${renderBillingForm(client, draft)}
    </section>
  `;
};

const baseRenderOrderDetailPaymentsEnhancements = renderOrderDetail;
renderOrderDetail = function renderOrderDetailWithBilling() {
  ensurePaymentState();
  const order = getSelectedOrder();
  appState.paymentOrderId = order?.id || appState.paymentOrderId;
  const client = getPaymentClientFromSelectedOrder();
  const draft = appState.billingDraft || emptyBillingDraft(client);
  const billingBlock = `
    <div style="height:16px"></div>
    ${renderBillingForm(client, draft, true)}
  `;
  return baseRenderOrderDetailPaymentsEnhancements().replace("</section>", `${billingBlock}</section>`);
};

const baseNavigatePaymentsEnhancements = navigate;
navigate = function navigatePaymentsEnhancements(view, orderId) {
  if (view === "payments" && orderId) appState.paymentOrderId = orderId;
  baseNavigatePaymentsEnhancements(view, orderId);
  if (view === "payments" || view === "order-detail") {
    Promise.all([loadBillingForSelectedClient(true), loadPaymentsForSelectedOrder(true)])
      .then(() => renderApp())
      .catch(() => {});
  }
};

const baseRenderAppPaymentsEnhancements = renderApp;
renderApp = function renderAppPaymentsEnhancements() {
  baseRenderAppPaymentsEnhancements();
  if (appState.currentView === "payments" || appState.currentView === "order-detail") {
    loadBillingForSelectedClient().catch(() => {});
    if (appState.currentView === "payments") loadPaymentsForSelectedOrder().catch(() => {});
  }
};

const baseAttachEventsPaymentsEnhancements = attachEvents;
attachEvents = function attachEventsPaymentsEnhancements() {
  baseAttachEventsPaymentsEnhancements();

  document.querySelectorAll("[data-action='export-payments']").forEach((button) => {
    button.addEventListener("click", () => exportPaymentsForAccountant());
  });

  document.querySelectorAll("[data-action='save-billing']").forEach((button) => {
    button.addEventListener("click", () => saveBillingForSelectedClient());
  });

  document.querySelectorAll("[data-action='save-payment-draft']").forEach((button) => {
    button.addEventListener("click", () => savePaymentDraftForSelectedOrder());
  });

  document.querySelectorAll("[data-new-payment]").forEach((button) => {
    button.addEventListener("click", () => resetPaymentDraft(true));
  });

  document.querySelectorAll("[data-edit-payment]").forEach((button) => {
    button.addEventListener("click", (event) => editPaymentDraft(event.currentTarget.dataset.editPayment));
  });

  document.querySelectorAll("[data-open-payments]").forEach((button) => {
    button.addEventListener("click", (event) => navigate("payments", Number(event.currentTarget.dataset.openPayments)));
  });

  document.querySelectorAll("[data-payment-order]").forEach((select) => {
    select.addEventListener("change", (event) => {
      appState.paymentOrderId = Number(event.target.value);
      appState.selectedOrderId = Number(event.target.value);
      appState.paymentLoadedOrderDbId = null;
      appState.billingLoadedClientId = null;
      resetPaymentDraft(false);
      Promise.all([loadBillingForSelectedClient(true), loadPaymentsForSelectedOrder(true)])
        .then(() => renderApp())
        .catch((error) => setFlashMessage(`Caricamento ordine non riuscito: ${error.message}`));
    });
  });

  document.querySelectorAll("[data-billing-field]").forEach((input) => {
    input.addEventListener("input", (event) => {
      ensurePaymentState();
      appState.billingDraft[event.target.dataset.billingField] = event.target.value;
    });
  });

  document.querySelectorAll("[data-payment-field]").forEach((input) => {
    input.addEventListener("input", (event) => {
      ensurePaymentState();
      appState.paymentDraft[event.target.dataset.paymentField] = event.target.value;
    });
    input.addEventListener("change", (event) => {
      ensurePaymentState();
      appState.paymentDraft[event.target.dataset.paymentField] = event.target.value;
    });
  });
};

ensurePaymentState();