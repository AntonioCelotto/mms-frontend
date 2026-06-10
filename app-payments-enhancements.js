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
  if (!appState.billingDraft || typeof appState.billingDraft !== "object") {
    appState.billingDraft = {};
  }
  if (!appState.billingLoadedClientId) {
    appState.billingLoadedClientId = null;
  }
  if (!appState.billingClient || typeof appState.billingClient !== "object") {
    appState.billingClient = null;
  }
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

function getPaymentClientFromSelectedOrder() {
  const order = getSelectedOrder();
  return appData.clients.find((client) => client.name === order?.client) || appState.billingClient || null;
}

function emptyBillingDraft(client) {
  return BILLING_FIELDS.reduce((draft, [field]) => {
    draft[field] = client?.[field] || "";
    return draft;
  }, {});
}

async function fetchBillingClientFromSelectedOrder() {
  const order = getSelectedOrder();
  const knownClient = appData.clients.find((client) => client.name === order?.client && client.id);
  if (knownClient) return knownClient;

  const dbOrderId = Number(order?.db_id || order?.id);
  if (!dbOrderId) return null;
  const orderRows = await paymentRequest(`/rest/v1/orders?select=id,client_id&id=eq.${dbOrderId}&limit=1`);
  const rawOrder = Array.isArray(orderRows) ? orderRows[0] : null;
  if (!rawOrder?.client_id) return null;

  const fields = ["id", "name", "email", "phone", "payment_terms", ...BILLING_FIELDS.map(([field]) => field)].join(",");
  const clientRows = await paymentRequest(`/rest/v1/clients?select=${fields}&id=eq.${rawOrder.client_id}&limit=1`);
  const client = Array.isArray(clientRows) ? clientRows[0] : null;
  if (client) {
    appState.billingClient = client;
  }
  return client;
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
      "ID pagamento",
      "Ordine",
      "Cliente",
      "Ragione sociale",
      "Partita IVA",
      "Codice fiscale",
      "Indirizzo",
      "Citta'",
      "CAP",
      "Paese",
      "SDI",
      "PEC",
      "Tipo pagamento",
      "Importo",
      "Scadenza",
      "Data pagamento",
      "Stato",
      "Note",
      "Data registrazione",
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
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
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

function renderPaymentRows() {
  if (!appData.payments.length) {
    return `<tr><td colspan="7"><div class="empty-state">Nessun pagamento registrato.</div></td></tr>`;
  }
  return appData.payments
    .map(
      (payment) => `
        <tr>
          <td>#${payment.orderId}</td>
          <td>${payment.client}</td>
          <td>${payment.mode}</td>
          <td>${payment.due}</td>
          <td><span class="table-status ${getStatusClass(payment.state)}">${payment.state}</span></td>
          <td>${payment.detail}</td>
          <td><button class="mini-btn" data-detail="${payment.orderId}">Apri ordine</button></td>
        </tr>
      `
    )
    .join("");
}

renderPayments = function renderPaymentsEnhanced() {
  ensurePaymentState();
  const order = getSelectedOrder();
  const client = getPaymentClientFromSelectedOrder();
  const draft = appState.billingDraft || emptyBillingDraft(client);

  return `
    <section class="view ${appState.currentView === "payments" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Pagamenti e fatturazione</h2>
          <p>Gestione acconti, saldi, scadenze e dati fiscali da condividere con il commercialista.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">Ordine selezionato: #${order?.id || "-"}</div>
          <button class="action-pill" data-action="export-payments">Scarica per commercialista</button>
        </div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Registro pagamenti</h3>
                <p>Acconti, saldi e scadenze collegati agli ordini.</p>
              </div>
              <button class="action-pill" data-action="register-payment">Registra saldo ordine #${order?.id || "-"}</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Ordine</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Scadenza</th>
                  <th>Stato</th>
                  <th>Note</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>${renderPaymentRows()}</tbody>
            </table>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Dati fatturazione cliente</h3>
                <p>${client ? `Cliente collegato: ${client.name}` : "Dati cliente in caricamento."}</p>
              </div>
              <button class="action-pill" data-action="save-billing">Salva fatturazione</button>
            </div>
            <div class="form-grid">
              ${BILLING_FIELDS.map(
                ([field, label]) => `
                  <div class="field ${field === "billing_address" ? "span-2" : ""}">
                    <label>${label}</label>
                    <input class="field-value" data-billing-field="${field}" value="${draft[field] || ""}" />
                  </div>
                `
              ).join("")}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
};

const baseNavigatePaymentsEnhancements = navigate;
navigate = function navigatePaymentsEnhancements(view, orderId) {
  baseNavigatePaymentsEnhancements(view, orderId);
  if (view === "payments") {
    loadBillingForSelectedClient().then(() => renderApp()).catch(() => {});
  }
};

const baseRenderAppPaymentsEnhancements = renderApp;
renderApp = function renderAppPaymentsEnhancements() {
  baseRenderAppPaymentsEnhancements();
  if (appState.currentView === "payments") {
    loadBillingForSelectedClient().catch(() => {});
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

  document.querySelectorAll("[data-billing-field]").forEach((input) => {
    input.addEventListener("input", (event) => {
      ensurePaymentState();
      appState.billingDraft[event.target.dataset.billingField] = event.target.value;
    });
  });
};

ensurePaymentState();
