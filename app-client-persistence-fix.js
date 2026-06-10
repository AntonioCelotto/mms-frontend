const CLIENT_PERSIST_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
const CLIENT_PERSIST_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";
const CLIENT_PERSIST_FIELDS = [
  "name",
  "email",
  "phone",
  "payment_terms",
  "notes",
  "billing_company_name",
  "billing_vat_number",
  "billing_tax_code",
  "billing_address",
  "billing_city",
  "billing_zip",
  "billing_country",
  "billing_sdi",
  "billing_pec",
];

function clientPersistFallbackState() {
  return typeof clientsFallbackState === "function" ? clientsFallbackState() : null;
}

function clientPersistSelectedId(container) {
  const selectValue = container?.querySelector?.("[data-client-overlay-select]")?.value;
  const fallback = clientPersistFallbackState();
  return Number(selectValue || appState.selectedClientId || fallback?.selectedClientId || 0);
}

function clientPersistAllClients() {
  const fallback = clientPersistFallbackState();
  const clients = [];
  if (Array.isArray(appState.realClients)) clients.push(...appState.realClients);
  if (Array.isArray(fallback?.clients)) clients.push(...fallback.clients);
  return clients;
}

function clientPersistSelectedClient(container) {
  const selectedId = clientPersistSelectedId(container);
  const clients = clientPersistAllClients();
  return clients.find((client) => Number(client.id) === selectedId) || clients[0] || null;
}

function clientPersistPayload(container, button) {
  const payload = {};
  container.querySelectorAll("[data-client-overlay-field], [data-client-edit-field]").forEach((input) => {
    const field = input.dataset.clientOverlayField || input.dataset.clientEditField;
    if (CLIENT_PERSIST_FIELDS.includes(field)) payload[field] = input.value || null;
  });

  const quickField = button?.dataset?.quickClientSave;
  if (quickField && CLIENT_PERSIST_FIELDS.includes(quickField)) {
    const input = container.querySelector(`[data-quick-client-input='${quickField}']`) || document.querySelector(`[data-quick-client-input='${quickField}']`);
    payload[quickField] = input?.value || null;
  }

  return payload;
}

async function clientPersistRequest(clientId, payload) {
  const response = await fetch(`${CLIENT_PERSIST_URL}/rest/v1/clients?id=eq.${Number(clientId)}`, {
    method: "PATCH",
    headers: {
      apikey: CLIENT_PERSIST_KEY,
      Authorization: `Bearer ${CLIENT_PERSIST_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text().catch(() => "");
  let body = null;
  if (raw) {
    try { body = JSON.parse(raw); } catch (error) { body = { detail: raw.slice(0, 240) }; }
  }
  if (!response.ok) throw new Error(body?.message || body?.detail || `Richiesta non riuscita (${response.status})`);
  const updated = Array.isArray(body) ? body[0] : null;
  if (!updated?.id) throw new Error("Cliente non trovato o non aggiornato");
  return updated;
}

function clientPersistMerge(updated) {
  const fallback = clientPersistFallbackState();
  appState.selectedClientId = Number(updated.id);
  if (fallback) fallback.selectedClientId = Number(updated.id);

  if (Array.isArray(appState.realClients)) {
    const index = appState.realClients.findIndex((client) => Number(client.id) === Number(updated.id));
    if (index >= 0) appState.realClients[index] = { ...appState.realClients[index], ...updated };
    else appState.realClients.push(updated);
  }

  if (Array.isArray(fallback?.clients)) {
    const index = fallback.clients.findIndex((client) => Number(client.id) === Number(updated.id));
    if (index >= 0) fallback.clients[index] = { ...fallback.clients[index], ...updated };
    else fallback.clients.push(updated);
  }

  if (Array.isArray(appData?.clients)) {
    const index = appData.clients.findIndex((client) => Number(client.id) === Number(updated.id));
    const mapped = {
      ...updated,
      paymentRule: updated.payment_terms || "",
      note: updated.notes || "",
      visibilityEnabled: !!updated.visibility_enabled,
      workType: updated.payment_terms || "Condizioni da definire",
    };
    if (index >= 0) appData.clients[index] = { ...appData.clients[index], ...mapped };
  }

  appState.clientEditDraft = { id: updated.id };
  appState.clientOverlayDraft = { id: updated.id };
  CLIENT_PERSIST_FIELDS.forEach((field) => {
    appState.clientEditDraft[field] = updated[field] || "";
    appState.clientOverlayDraft[field] = updated[field] || "";
  });
}

async function clientPersistReload(updatedId) {
  const fallback = clientPersistFallbackState();
  if (typeof loadClientsRegistry === "function") {
    appState.clientsLoaded = false;
    await loadClientsRegistry(true).catch(() => {});
  }
  if (typeof loadClientsFallback === "function" && fallback) {
    fallback.loaded = false;
    await loadClientsFallback(true).catch(() => {});
  }
  appState.selectedClientId = Number(updatedId);
  if (fallback) fallback.selectedClientId = Number(updatedId);
}

async function clientPersistSave(event, button) {
  const container = button.closest(".client-edit-overlay-module, .clients-edit-panel, .profile-lines, section.view.active") || document;
  const client = clientPersistSelectedClient(container);
  if (!client?.id) {
    setFlashMessage("Seleziona un cliente prima di salvare");
    return;
  }
  const payload = clientPersistPayload(container, button);
  if (!Object.keys(payload).length) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  setBusy(true);
  try {
    const updated = await clientPersistRequest(client.id, payload);
    clientPersistMerge(updated);
    await clientPersistReload(updated.id);
    setFlashMessage("Scheda cliente aggiornata e salvata");
  } catch (error) {
    setFlashMessage(`Salvataggio cliente non riuscito: ${error.message}`);
  } finally {
    appState.busy = false;
    renderApp();
  }
}

document.addEventListener("click", (event) => {
  const selectButton = event.target.closest("[data-select-client], [data-clients-fallback-select]");
  if (selectButton) {
    const id = Number(selectButton.dataset.selectClient || selectButton.dataset.clientsFallbackSelect || 0);
    if (id) {
      appState.selectedClientId = id;
      const fallback = clientPersistFallbackState();
      if (fallback) fallback.selectedClientId = id;
    }
  }

  const saveButton = event.target.closest("[data-client-overlay-save], [data-client-edit-save], [data-quick-client-save]");
  if (saveButton) clientPersistSave(event, saveButton);
}, true);

document.addEventListener("change", (event) => {
  const select = event.target.closest("[data-client-overlay-select]");
  if (!select) return;
  const id = Number(select.value || 0);
  if (!id) return;
  appState.selectedClientId = id;
  const fallback = clientPersistFallbackState();
  if (fallback) fallback.selectedClientId = id;
}, true);
