const CLIENT_EDIT_SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
const CLIENT_EDIT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";
const CLIENT_EDIT_FIELDS = [
  ["name", "Nome / brand"],
  ["email", "Email"],
  ["phone", "Cellulare / telefono"],
  ["payment_terms", "Condizioni pagamento"],
  ["notes", "Note cliente"],
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

function clientEditState() {
  if (!appState.clientEditDraft) appState.clientEditDraft = {};
  return appState.clientEditDraft;
}

function selectedClientForEdit() {
  if (typeof clientsFallbackState === "function") {
    const state = clientsFallbackState();
    return state.clients.find((client) => Number(client.id) === Number(state.selectedClientId)) || state.clients[0] || null;
  }
  if (typeof getSelectedClientRecord === "function") return getSelectedClientRecord();
  return null;
}

function escapeClientEdit(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureClientEditDraft(client) {
  const draft = clientEditState();
  if (!client?.id) return draft;
  if (draft.id !== client.id) {
    draft.id = client.id;
    CLIENT_EDIT_FIELDS.forEach(([field]) => {
      draft[field] = client[field] || "";
    });
  }
  return draft;
}

function renderClientEditPanel() {
  const client = selectedClientForEdit();
  if (!client) {
    return `
      <div class="clients-edit-panel surface" style="margin:16px 0;">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Modifica scheda cliente</h3>
              <p>Seleziona un cliente dall'elenco per modificare contatti e dati fatturazione.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  const draft = ensureClientEditDraft(client);
  return `
    <div class="clients-edit-panel surface" style="margin:16px 0;">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Modifica scheda cliente</h3>
            <p>Aggiorna contatti, cellulare, condizioni pagamento e dati fatturazione.</p>
          </div>
          <button class="action-pill" data-client-edit-save>${appState.busy ? "Salvataggio..." : "Salva modifiche cliente"}</button>
        </div>
        <div class="form-grid">
          ${CLIENT_EDIT_FIELDS.map(([field, label]) => `
            <div class="field ${field === "notes" || field === "billing_address" ? "span-2" : ""}">
              <label>${label}</label>
              ${field === "notes" ? `<textarea class="field-value" data-client-edit-field="${field}" style="min-height:84px; align-items:flex-start; padding-top:12px;">${escapeClientEdit(draft[field])}</textarea>` : `<input class="field-value" data-client-edit-field="${field}" value="${escapeClientEdit(draft[field])}" />`}
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function findClientActiveSection() {
  const active = document.querySelector("section.view.active");
  if (!active) return null;
  if (appState.currentView === "client" || appState.currentView === "clients") return active;
  const heading = active.querySelector(".screen-header h2")?.textContent.trim().toLowerCase();
  return heading === "clienti" ? active : null;
}

function injectClientEditPanel() {
  const active = findClientActiveSection();
  if (!active || active.querySelector(".clients-edit-panel")) return;

  const screenHeader = active.querySelector(".screen-header");
  if (screenHeader) {
    screenHeader.insertAdjacentHTML("afterend", renderClientEditPanel());
  } else {
    active.insertAdjacentHTML("afterbegin", renderClientEditPanel());
  }
  attachClientEditEvents();
  document.querySelectorAll(".empty-state").forEach((node) => {
    if (node.textContent.trim() === "Nessun pagamento collegato.") {
      node.textContent = "Nessun pagamento registrato sugli ordini di questo cliente.";
    }
  });
}

async function clientEditRequest(path, options = {}) {
  const response = await fetch(`${CLIENT_EDIT_SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: CLIENT_EDIT_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CLIENT_EDIT_SUPABASE_ANON_KEY}`,
      ...(options.headers || {}),
    },
  });
  const raw = await response.text().catch(() => "");
  let payload = null;
  if (raw) {
    try { payload = JSON.parse(raw); } catch (error) { payload = { detail: raw.slice(0, 240) }; }
  }
  if (!response.ok) throw new Error(payload?.message || payload?.detail || `Richiesta non riuscita (${response.status})`);
  return payload;
}

async function saveClientEditDraft() {
  const draft = clientEditState();
  if (!draft.id) {
    setFlashMessage("Seleziona un cliente prima di salvare");
    return;
  }
  const body = {};
  CLIENT_EDIT_FIELDS.forEach(([field]) => {
    body[field] = draft[field] || null;
  });
  setBusy(true);
  try {
    const rows = await clientEditRequest(`/rest/v1/clients?id=eq.${Number(draft.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    const updated = Array.isArray(rows) ? rows[0] : null;
    if (updated) {
      if (typeof clientsFallbackState === "function") {
        const state = clientsFallbackState();
        const index = state.clients.findIndex((client) => Number(client.id) === Number(updated.id));
        if (index >= 0) state.clients[index] = { ...state.clients[index], ...updated };
      }
      if (Array.isArray(appState.realClients)) {
        const realIndex = appState.realClients.findIndex((client) => Number(client.id) === Number(updated.id));
        if (realIndex >= 0) appState.realClients[realIndex] = { ...appState.realClients[realIndex], ...updated };
      }
      appState.clientEditDraft = { id: updated.id };
      CLIENT_EDIT_FIELDS.forEach(([field]) => { appState.clientEditDraft[field] = updated[field] || ""; });
    }
    setFlashMessage("Scheda cliente aggiornata");
  } catch (error) {
    setFlashMessage(`Salvataggio cliente non riuscito: ${error.message}`);
  } finally {
    appState.busy = false;
    renderApp();
  }
}

function attachClientEditEvents() {
  document.querySelectorAll("[data-client-edit-field]").forEach((input) => {
    const handler = (event) => {
      clientEditState()[event.target.dataset.clientEditField] = event.target.value;
    };
    input.oninput = handler;
    input.onchange = handler;
  });
  document.querySelectorAll("[data-client-edit-save]").forEach((button) => {
    button.onclick = () => {
      if (!appState.busy) saveClientEditDraft();
    };
  });
}

const baseRenderAppClientEditFix = renderApp;
renderApp = function renderAppWithClientEditFix() {
  baseRenderAppClientEditFix();
  injectClientEditPanel();
};

injectClientEditPanel();