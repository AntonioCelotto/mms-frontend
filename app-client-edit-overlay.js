const CLIENT_OVERLAY_SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
const CLIENT_OVERLAY_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";
const CLIENT_OVERLAY_FIELDS = [
  ["name", "Nome / brand"],
  ["email", "Email"],
  ["phone", "Cellulare / telefono"],
  ["payment_terms", "Condizioni pagamento"],
  ["billing_vat_number", "Partita IVA"],
  ["billing_tax_code", "Codice fiscale"],
  ["billing_address", "Indirizzo fatturazione"],
  ["billing_city", "Citta'"],
  ["billing_zip", "CAP"],
  ["billing_sdi", "Codice SDI"],
  ["billing_pec", "PEC"],
  ["notes", "Note cliente"],
];

function clientOverlayEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clientOverlayState() {
  if (!appState.clientOverlayDraft) appState.clientOverlayDraft = {};
  return appState.clientOverlayDraft;
}

function clientOverlayAllClients() {
  if (typeof clientsFallbackState === "function") return clientsFallbackState().clients || [];
  if (Array.isArray(appState.realClients)) return appState.realClients;
  return [];
}

function clientOverlaySelectedClient() {
  const clients = clientOverlayAllClients();
  if (typeof clientsFallbackState === "function") {
    const state = clientsFallbackState();
    return clients.find((client) => Number(client.id) === Number(state.selectedClientId)) || clients[0] || null;
  }
  return clients.find((client) => Number(client.id) === Number(appState.selectedClientId)) || clients[0] || null;
}

function clientOverlaySetSelectedClient(clientId) {
  if (typeof clientsFallbackState === "function") {
    clientsFallbackState().selectedClientId = Number(clientId);
  }
  appState.selectedClientId = Number(clientId);
  appState.clientOverlayDraft = {};
}

function clientOverlayEnsureDraft(client) {
  const draft = clientOverlayState();
  if (!client?.id) return draft;
  if (draft.id !== client.id) {
    draft.id = client.id;
    CLIENT_OVERLAY_FIELDS.forEach(([field]) => {
      draft[field] = client[field] || "";
    });
  }
  return draft;
}

function clientOverlaySelector(client) {
  const clients = clientOverlayAllClients();
  if (!clients.length) return "";
  return `
    <div class="field span-2" style="margin-bottom:12px;">
      <label>Cliente da modificare</label>
      <select class="filter-chip" data-client-overlay-select>
        ${clients.map((item) => `<option value="${item.id}" ${Number(item.id) === Number(client?.id) ? "selected" : ""}>${clientOverlayEscape(item.name)}</option>`).join("")}
      </select>
    </div>
  `;
}

function clientOverlayMarkup() {
  const client = clientOverlaySelectedClient();
  const draft = clientOverlayEnsureDraft(client);
  if (!client) {
    return `<div class="surface-inner"><strong>Modifica cliente</strong><div class="empty-state">Seleziona un cliente dall'elenco per modificare la scheda.</div></div>`;
  }
  return `
    <div class="surface-inner">
      <div class="section-title">
        <div>
          <h3>Modifica cliente selezionato</h3>
          <p>${clientOverlayEscape(client.name)} - aggiorna contatti, cellulare, fatturazione e note.</p>
        </div>
        <button class="action-pill" data-client-overlay-save>Salva modifiche cliente</button>
      </div>
      ${clientOverlaySelector(client)}
      <div class="form-grid">
        ${CLIENT_OVERLAY_FIELDS.map(([field, label]) => `
          <div class="field ${field === "notes" || field === "billing_address" ? "span-2" : ""}">
            <label>${label}</label>
            ${field === "notes" ? `<textarea class="field-value" data-client-overlay-field="${field}" style="min-height:84px; align-items:flex-start; padding-top:12px;">${clientOverlayEscape(draft[field])}</textarea>` : `<input class="field-value" data-client-overlay-field="${field}" value="${clientOverlayEscape(draft[field])}" />`}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function clientOverlayFindSection() {
  const sections = Array.from(document.querySelectorAll("section.view"));
  return sections.find((section) => {
    const h2 = section.querySelector(".screen-header h2")?.textContent.trim().toLowerCase();
    return section.classList.contains("active") && h2 === "clienti";
  });
}

function clientOverlayMount() {
  const section = clientOverlayFindSection();
  if (!section) return;
  const existing = section.querySelector(".client-edit-overlay-module");
  if (existing) return;
  const header = section.querySelector(".screen-header");
  const module = document.createElement("div");
  module.className = "surface client-edit-overlay-module";
  module.style.margin = "16px 0";
  module.innerHTML = clientOverlayMarkup();
  if (header) header.insertAdjacentElement("afterend", module);
  else section.insertAdjacentElement("afterbegin", module);
  clientOverlayAttach();
}

function clientOverlayRefresh() {
  const module = document.querySelector(".client-edit-overlay-module");
  if (!module) return;
  module.innerHTML = clientOverlayMarkup();
  clientOverlayAttach();
}

async function clientOverlayRequest(path, options = {}) {
  const response = await fetch(`${CLIENT_OVERLAY_SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: CLIENT_OVERLAY_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CLIENT_OVERLAY_SUPABASE_ANON_KEY}`,
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

async function clientOverlaySave() {
  const draft = clientOverlayState();
  if (!draft.id) {
    setFlashMessage("Seleziona un cliente prima di salvare");
    return;
  }
  const body = {};
  CLIENT_OVERLAY_FIELDS.forEach(([field]) => {
    body[field] = draft[field] || null;
  });
  setBusy(true);
  try {
    const rows = await clientOverlayRequest(`/rest/v1/clients?id=eq.${Number(draft.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    const updated = Array.isArray(rows) ? rows[0] : null;
    if (updated && typeof clientsFallbackState === "function") {
      const state = clientsFallbackState();
      const index = state.clients.findIndex((client) => Number(client.id) === Number(updated.id));
      if (index >= 0) state.clients[index] = { ...state.clients[index], ...updated };
      state.selectedClientId = updated.id;
    }
    appState.clientOverlayDraft = { id: updated?.id || draft.id };
    CLIENT_OVERLAY_FIELDS.forEach(([field]) => {
      appState.clientOverlayDraft[field] = updated?.[field] || body[field] || "";
    });
    setFlashMessage("Scheda cliente aggiornata");
  } catch (error) {
    setFlashMessage(`Salvataggio cliente non riuscito: ${error.message}`);
  } finally {
    appState.busy = false;
    renderApp();
  }
}

function clientOverlayAttach() {
  document.querySelectorAll("[data-client-overlay-select]").forEach((select) => {
    select.onchange = (event) => {
      clientOverlaySetSelectedClient(event.target.value);
      clientOverlayRefresh();
      renderApp();
    };
  });
  document.querySelectorAll("[data-client-overlay-field]").forEach((input) => {
    const handler = (event) => {
      clientOverlayState()[event.target.dataset.clientOverlayField] = event.target.value;
    };
    input.oninput = handler;
    input.onchange = handler;
  });
  document.querySelectorAll("[data-client-overlay-save]").forEach((button) => {
    button.onclick = () => {
      if (!appState.busy) clientOverlaySave();
    };
  });
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-clients-fallback-select]")) {
    window.setTimeout(() => {
      appState.clientOverlayDraft = {};
      clientOverlayRefresh();
    }, 80);
  }
});

const baseRenderAppClientOverlay = renderApp;
renderApp = function renderAppWithClientOverlay() {
  baseRenderAppClientOverlay();
  clientOverlayMount();
};

window.setInterval(clientOverlayMount, 700);
clientOverlayMount();