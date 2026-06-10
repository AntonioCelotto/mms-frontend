const DEMO_COPY_REPLACEMENTS = new Map([
  ["Frontend reale - base app", "Gestionale operativo"],
  ["FRONTEND REALE - BASE APP", "GESTIONALE OPERATIVO"],
  ["Una base concreta per portare il prototipo dentro un'app navigabile e pronta da estendere.", "Ordini, planning, materiali, clienti e pagamenti in un unico ambiente operativo."],
  ["Base desktop funzionante con navigazione reale, dati simulati coerenti e schermate collegate tra loro.", "Ambiente operativo collegato ai dati del gestionale."],
  ["Stato sviluppo", "Stato ambiente"],
  ["La schermata che racconta il passaggio chiave: da preventivo confermato a ordine strutturato, classificato e pronto per il planning.", "Crea un ordine operativo partendo da dati cliente, materiali, reparto e scadenze."],
  ["La parte che nel foglio oggi non e' strutturata.", "Task generati per reparto e lavorazione."],
  ["Valore mostrato in demo", "Controlli operativi"],
  ["Qui si capisce il passaggio da foglio a sistema.", "Controlli utili per ridurre ricopiature e passaggi manuali."],
  ["La parte che rassicura il cliente.", "Elementi da validare prima dell'applicazione."],
  ["La demo rende chiaro chi puo' fare cosa.", "Regole operative per ruoli e accessi."],
  ["La demo mette in evidenza gli ordini da completare prima di promettere la consegna.", "Segnalazione operativa sugli ordini da completare prima di promettere la consegna."],
  ["Come l'AI aiuta senza decidere da sola.", "Supporto AI con approvazione operatore."],
  ["Supervisione umana obbligatoria", "Approvazione operatore"],
  ["Mai autonomia completa nelle prime release", "AI sempre controllata"],
  ["La base dell'app mostra AI assistiva, non sostitutiva, in linea con il documento tecnico.", "I suggerimenti AI restano tracciabili e approvati da un operatore."],
  ["Cosa il cliente deve percepire appena entra.", "Priorita' operative della giornata."],
  ["Dal foglio operativo a una cabina di regia unica per ordini, reparti e consegne.", "Cabina di regia per ordini, reparti e consegne."],
  ["Questa base front-end trasforma il processo attuale in un'app navigabile, con una sola fonte dati e viste dedicate per chi coordina, produce o controlla i pagamenti.", "Il gestionale organizza ordini, reparti, task, materiali e pagamenti con una sola fonte dati."],
  ["660 ordini storici rilevati", "Ordini caricati: aggiornamento in corso"],
  ["Ultimo aggiornamento 09:12", "Dati aggiornati"],
  ["Filtro: settimana corrente", "Filtro: periodo attivo"],
  ["Le lavorazioni che oggi spostano davvero il planning.", "Ordini da presidiare per avanzamento e consegne."],
  ["2 richiedono conferma da laboratorio esterno", "Ordini con priorita' da presidiare"],
  ["3 interni, 2 legati a fornitori esterni", "Ritardi da monitorare"],
  ["con media evasione di 4,2 giorni", "ordini completati nel periodo"],
  ["Wizard semplificato", "Inserimento operativo"],
  ["Crea task", "Prepara task"],
  ["Step 1", "Fase 1"],
  ["Step 2", "Fase 2"],
  ["Step 3", "Fase 3"],
  ["Step 4", "Fase 4"],
  ["Conferma preventivo", "Dati cliente"],
  ["Classifica righe", "Classificazione"],
  ["Genera task", "Task operativi"],
  ["Invia a planning", "Planning"],
  ["Niente ricopiature tra fogli", "Riduzione inserimenti doppi"],
  ["Un ordine nasce una volta sola e genera automaticamente la struttura operativa.", "L'ordine alimenta archivio, task, materiali e planning senza reinserimenti manuali."],
  ["Ogni reparto vede solo il suo", "Vista reparto ordinata"],
  ["La stessa base dati alimenta viste diverse senza duplicazione manuale.", "La stessa base dati alimenta viste diverse per coordinamento, produzione e amministrazione."],
  ["Conversazione guidata", "Analisi operativa"],
  ["Cosa approva l'operatore", "Controlli operatore"],
  ["Audit delle decisioni", "Tracciamento decisioni"],
  ["Preventivo #284", "Ordine selezionato"],
  ["Confidenza 87%", "Da verificare"],
  ["Durate iniziali", "Stime operative"],
  ["4 task creati", "Task proposti"],
  ["Cliente Portal", "Accesso cliente"],
  ["n/d", "Da completare"],
]);

const DEMO_ACCOUNT_MARKERS = ["cliente@portal.mms", "333 100200", "333 100210", "marta@stellatures.it", "nicola@mms.it", "rosmery@mms.it", "olga@mms.it", "samuele@mms.it", "admin@mms.it"];
const CLIENTS_FALLBACK_SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
const CLIENTS_FALLBACK_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";
const CLIENTS_FALLBACK_BILLING_FIELDS = [["billing_company_name", "Ragione sociale"], ["billing_vat_number", "Partita IVA"], ["billing_tax_code", "Codice fiscale"], ["billing_address", "Indirizzo fatturazione"], ["billing_city", "Citta'"], ["billing_zip", "CAP"], ["billing_country", "Paese"], ["billing_sdi", "Codice SDI"], ["billing_pec", "PEC"]];

function replaceDemoTextInNode(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    let value = node.nodeValue;
    DEMO_COPY_REPLACEMENTS.forEach((replacement, source) => { value = value.split(source).join(replacement); });
    node.nodeValue = value;
  });
}

function updateClientNavigation(root) {
  const button = root.querySelector("[data-nav='client']");
  if (!button) return;
  const strong = button.querySelector("strong");
  const span = button.querySelector("span");
  if (strong) strong.textContent = "Clienti";
  if (span) span.textContent = "Anagrafiche, ordini e pagamenti";
}

function updateOrderArchiveCount(root) {
  if (typeof appState === "undefined" || appState.currentView !== "orders") return;
  if (typeof appData === "undefined" || !Array.isArray(appData.orders)) return;
  const countText = `Ordini caricati: ${appData.orders.length}`;
  root.querySelectorAll(".ghost-pill").forEach((pill) => {
    const text = pill.textContent.trim();
    if (text === "Ordini caricati: aggiornamento in corso" || /ordini storici rilevati/i.test(text)) pill.textContent = countText;
  });
}

function hideVisibleDemoAccounts(root) {
  if (typeof appState === "undefined" || appState.currentView !== "accounts") return;
  root.querySelectorAll("tbody tr").forEach((row) => {
    const text = row.textContent.toLowerCase();
    if (DEMO_ACCOUNT_MARKERS.some((marker) => text.includes(marker.toLowerCase()))) row.remove();
  });
}

function removeDemoFallbackAccounts() {
  if (typeof fallbackAppData !== "undefined" && Array.isArray(fallbackAppData.accounts)) fallbackAppData.accounts = [];
  if (typeof getFallbackAssignableAccounts === "function") {
    getFallbackAssignableAccounts = function getNoDemoFallbackAccounts() { return []; };
  }
}

function clientsFallbackState() {
  if (!appState.clientsFallback) {
    appState.clientsFallback = { loaded: false, loading: false, search: "", selectedClientId: null, clients: [], orders: [], payments: [], newClient: { name: "", email: "", phone: "", payment_terms: "", notes: "" } };
  }
  return appState.clientsFallback;
}

function clientsFallbackHeaders(extra = {}) {
  return { apikey: CLIENTS_FALLBACK_SUPABASE_ANON_KEY, Authorization: `Bearer ${CLIENTS_FALLBACK_SUPABASE_ANON_KEY}`, ...extra };
}

async function clientsFallbackRequest(path, options = {}) {
  const response = await fetch(`${CLIENTS_FALLBACK_SUPABASE_URL}${path}`, { ...options, headers: clientsFallbackHeaders(options.headers || {}) });
  const raw = await response.text().catch(() => "");
  let payload = null;
  if (raw) {
    try { payload = JSON.parse(raw); } catch (error) { payload = { detail: raw.slice(0, 240) }; }
  }
  if (!response.ok) throw new Error(payload?.message || payload?.detail || `Richiesta non riuscita (${response.status})`);
  return payload;
}

function escapeClientsFallback(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function loadClientsFallback(force = false) {
  const state = clientsFallbackState();
  if (state.loading || (!force && state.loaded)) return false;
  state.loading = true;
  try {
    const billingFields = CLIENTS_FALLBACK_BILLING_FIELDS.map(([field]) => field).join(",");
    const [clients, orders, payments] = await Promise.all([
      clientsFallbackRequest(`/rest/v1/clients?select=id,name,email,phone,payment_terms,notes,visibility_enabled,${billingFields}&order=name.asc`),
      clientsFallbackRequest("/rest/v1/orders?select=id,order_number,client_id,category,status,priority,order_date,estimated_delivery_date,internal_notes&order=id.desc"),
      clientsFallbackRequest("/rest/v1/payments?select=id,order_id,payment_type,amount,due_date,paid_date,status,notes,created_at&order=created_at.desc"),
    ]);
    state.clients = Array.isArray(clients) ? clients : [];
    state.orders = Array.isArray(orders) ? orders : [];
    state.payments = Array.isArray(payments) ? payments : [];
    state.loaded = true;
    if (!state.selectedClientId && state.clients.length) state.selectedClientId = state.clients[0].id;
    return true;
  } catch (error) {
    setFlashMessage(`Clienti non caricati: ${error.message}`);
    return false;
  } finally {
    state.loading = false;
  }
}

function getClientsFallbackOrders(client) {
  const state = clientsFallbackState();
  if (!client) return [];
  return state.orders.filter((order) => Number(order.client_id) === Number(client.id));
}

function getClientsFallbackPayments(client) {
  const state = clientsFallbackState();
  const orderIds = new Set(getClientsFallbackOrders(client).map((order) => Number(order.id)));
  return state.payments.filter((payment) => orderIds.has(Number(payment.order_id)));
}

function clientsFallbackPaymentLabel(value) {
  const labels = { acconto: "Acconto", saldo: "Saldo", scadenza: "Scadenza", da_pagare: "Da pagare", pagato: "Pagato", scaduto: "Scaduto", autorizzato: "Autorizzato" };
  return labels[value] || String(value || "").replace(/_/g, " ");
}

function renderClientsFallbackTable() {
  const state = clientsFallbackState();
  const query = state.search.trim().toLowerCase();
  const clients = state.clients.filter((client) => `${client.name || ""} ${client.email || ""} ${client.phone || ""} ${client.billing_vat_number || ""}`.toLowerCase().includes(query));
  if (!state.loaded) return `<div class="empty-state">Caricamento clienti in corso...</div>`;
  if (!clients.length) return `<div class="empty-state">Nessun cliente trovato.</div>`;
  return `<table><thead><tr><th>Cliente</th><th>Contatto</th><th>Ordini</th><th>Azioni</th></tr></thead><tbody>${clients.map((client) => `<tr><td><strong>${escapeClientsFallback(client.name)}</strong><div class="muted">${escapeClientsFallback(client.payment_terms || "Condizioni da definire")}</div></td><td>${escapeClientsFallback(client.email || "-")}<br /><span class="muted">${escapeClientsFallback(client.phone || "")}</span></td><td>${getClientsFallbackOrders(client).length}</td><td><button class="mini-btn" data-clients-fallback-select="${client.id}">Apri scheda</button></td></tr>`).join("")}</tbody></table>`;
}

function renderClientsFallbackDetail() {
  const state = clientsFallbackState();
  const client = state.clients.find((item) => Number(item.id) === Number(state.selectedClientId)) || state.clients[0];
  if (!client) return `<div class="empty-state">Seleziona o crea un cliente.</div>`;
  const orders = getClientsFallbackOrders(client);
  const payments = getClientsFallbackPayments(client);
  const evasi = orders.filter((order) => String(order.status || "").includes("evaso"));
  const programma = orders.filter((order) => !String(order.status || "").includes("evaso"));
  return `<div class="layout-2"><div class="profile-lines"><div class="line"><div class="muted">Cliente</div><div>${escapeClientsFallback(client.name)}</div></div><div class="line"><div class="muted">Email</div><div>${escapeClientsFallback(client.email || "-")}</div></div><div class="line"><div class="muted">Telefono</div><div>${escapeClientsFallback(client.phone || "-")}</div></div><div class="line"><div class="muted">Pagamento</div><div>${escapeClientsFallback(client.payment_terms || "Da definire")}</div></div>${CLIENTS_FALLBACK_BILLING_FIELDS.map(([field, label]) => `<div class="line"><div class="muted">${label}</div><div>${escapeClientsFallback(client[field] || "-")}</div></div>`).join("")}</div><div style="display:grid; gap:16px;"><div class="metric-boxes"><div class="metric-box surface"><small>Ordini in programma</small><strong>${programma.length}</strong><span>Ordini aperti o da completare</span></div><div class="metric-box surface"><small>Ordini evasi</small><strong>${evasi.length}</strong><span>Storico completato</span></div><div class="metric-box surface"><small>Pagamenti</small><strong>${payments.length}</strong><span>Movimenti collegati</span></div></div><div><div class="section-title"><div><h3>Ordini collegati</h3><p>In programma ed evasi per questo cliente.</p></div></div><table><thead><tr><th>Ordine</th><th>Categoria</th><th>Stato</th><th>Consegna</th><th></th></tr></thead><tbody>${orders.length ? orders.map((order) => `<tr><td>#${escapeClientsFallback(order.order_number || order.id)}</td><td>${escapeClientsFallback(order.category || "-")}</td><td><span class="table-status ${getStatusClass(String(order.status || ""))}">${escapeClientsFallback(String(order.status || "").replace(/_/g, " "))}</span></td><td>${escapeClientsFallback(order.estimated_delivery_date || "-")}</td><td><button class="mini-btn" data-detail="${escapeClientsFallback(order.order_number || order.id)}">Apri ordine</button></td></tr>`).join("") : `<tr><td colspan="5"><div class="empty-state">Nessun ordine collegato.</div></td></tr>`}</tbody></table></div><div><div class="section-title"><div><h3>Pagamenti cliente</h3><p>Acconti, saldi e scadenze.</p></div></div><table><thead><tr><th>Tipo</th><th>Importo</th><th>Scadenza</th><th>Stato</th><th>Note</th></tr></thead><tbody>${payments.length ? payments.map((payment) => `<tr><td>${clientsFallbackPaymentLabel(payment.payment_type)}</td><td>${payment.amount ?? ""}</td><td>${escapeClientsFallback(payment.due_date || "-")}</td><td><span class="table-status ${getStatusClass(clientsFallbackPaymentLabel(payment.status))}">${clientsFallbackPaymentLabel(payment.status)}</span></td><td>${escapeClientsFallback(payment.notes || "")}</td></tr>`).join("") : `<tr><td colspan="5"><div class="empty-state">Nessun pagamento collegato.</div></td></tr>`}</tbody></table></div></div></div>`;
}

async function saveClientsFallbackNewClient() {
  const state = clientsFallbackState();
  const name = state.newClient.name.trim();
  if (!name) { setFlashMessage("Inserisci il nome cliente"); return; }
  setBusy(true);
  try {
    const rows = await clientsFallbackRequest("/rest/v1/clients", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ name, email: state.newClient.email || null, phone: state.newClient.phone || null, payment_terms: state.newClient.payment_terms || null, notes: state.newClient.notes || null }) });
    const created = Array.isArray(rows) ? rows[0] : null;
    state.newClient = { name: "", email: "", phone: "", payment_terms: "", notes: "" };
    state.loaded = false;
    await loadClientsFallback(true);
    if (created?.id) state.selectedClientId = created.id;
    setFlashMessage(`Cliente ${name} salvato`);
  } catch (error) {
    setFlashMessage(`Creazione cliente non riuscita: ${error.message}`);
  } finally {
    appState.busy = false;
    renderApp();
  }
}

function renderClientsFallback() {
  const state = clientsFallbackState();
  return `<section class="view ${appState.currentView === "client" ? "active" : ""}"><div class="screen-header"><div><h2>Clienti</h2><p>Anagrafica clienti, schede, ordini evasi, ordini in programma e pagamenti.</p></div><div class="screen-actions"><div class="ghost-pill">${state.loaded ? `${state.clients.length} clienti salvati` : "Caricamento clienti"}</div><button class="action-pill" data-clients-fallback-save>Salva nuovo cliente</button></div></div><div class="layout-2"><div class="surface"><div class="surface-inner"><div class="section-title"><div><h3>Elenco clienti</h3><p>Cerca e apri una scheda cliente.</p></div><input class="filter-chip" data-clients-fallback-search value="${escapeClientsFallback(state.search)}" placeholder="Cerca cliente" /></div>${renderClientsFallbackTable()}</div></div><div class="surface"><div class="surface-inner"><div class="section-title"><div><h3>Nuovo cliente</h3><p>Salva l'anagrafica prima di agganciarla a un ordine.</p></div></div><div class="form-grid"><div class="field"><label>Nome / brand</label><input class="field-value" data-clients-fallback-new="name" value="${escapeClientsFallback(state.newClient.name)}" /></div><div class="field"><label>Email</label><input class="field-value" data-clients-fallback-new="email" value="${escapeClientsFallback(state.newClient.email)}" /></div><div class="field"><label>Telefono</label><input class="field-value" data-clients-fallback-new="phone" value="${escapeClientsFallback(state.newClient.phone)}" /></div><div class="field"><label>Condizioni pagamento</label><input class="field-value" data-clients-fallback-new="payment_terms" value="${escapeClientsFallback(state.newClient.payment_terms)}" /></div><div class="field span-2"><label>Note</label><textarea class="field-value" data-clients-fallback-new="notes" style="min-height:84px; align-items:flex-start; padding-top:12px;">${escapeClientsFallback(state.newClient.notes)}</textarea></div></div></div></div></div><div class="surface"><div class="surface-inner"><div class="section-title"><div><h3>Scheda cliente</h3><p>Dati, ordini e pagamenti collegati.</p></div></div>${renderClientsFallbackDetail()}</div></div></section>`;
}

renderClient = function renderClientAsRegistry() { return renderClientsFallback(); };

function attachClientsFallbackEvents(root) {
  root.querySelectorAll("[data-clients-fallback-select]").forEach((button) => { button.onclick = () => { clientsFallbackState().selectedClientId = Number(button.dataset.clientsFallbackSelect); renderApp(); }; });
  root.querySelectorAll("[data-clients-fallback-search]").forEach((input) => { input.oninput = (event) => { clientsFallbackState().search = event.target.value; renderApp(); }; });
  root.querySelectorAll("[data-clients-fallback-new]").forEach((input) => { const handler = (event) => { clientsFallbackState().newClient[event.target.dataset.clientsFallbackNew] = event.target.value; }; input.oninput = handler; input.onchange = handler; });
  root.querySelectorAll("[data-clients-fallback-save]").forEach((button) => { button.onclick = () => saveClientsFallbackNewClient(); });
}

function applyDemoCleanup() {
  const root = document.getElementById("app");
  if (!root) return;
  replaceDemoTextInNode(root);
  updateClientNavigation(root);
  updateOrderArchiveCount(root);
  hideVisibleDemoAccounts(root);
  attachClientsFallbackEvents(root);
  const state = typeof appState !== "undefined" ? clientsFallbackState() : null;
  if (state && appState.currentView === "client" && !state.loaded && !state.loading) {
    loadClientsFallback().then((changed) => { if (changed) renderApp(); }).catch(() => {});
  }
}

removeDemoFallbackAccounts();

const baseRenderAppDemoCleanup = renderApp;
renderApp = function renderAppDemoCleanup() { baseRenderAppDemoCleanup(); applyDemoCleanup(); };

applyDemoCleanup();