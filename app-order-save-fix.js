const DIRECT_SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
const DIRECT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";

function resetOrderFiltersForNewOrder() {
  appState.search = "";
  appState.filters = {
    department: "all",
    status: "all",
    payment: "all",
    priority: "all",
  };
}

function getCleanDraftMaterials() {
  return appState.draftMaterials.filter((item) => item.product_name && item.product_name.trim());
}

function resolveDraftDepartment() {
  const departmentMap = {
    "interno + controllo commercio": "Sartoria interna",
    interno: "Sartoria interna",
    esterno: "Sartoria esterna",
    commercio: "Commercio",
  };
  const raw = (appState.draftOrder.department || "").trim();
  const key = raw.toLowerCase();
  return departmentMap[key] || raw || "Sartoria interna";
}

async function readJsonResponse(response, fallbackMessage) {
  const raw = await response.text().catch(() => "");
  let payload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      payload = { detail: raw.slice(0, 240) };
    }
  }

  if (!response.ok) {
    const detail = payload.detail || payload.message || "";
    const message = payload.error || fallbackMessage;
    throw new Error(detail ? `${message}: ${detail}` : `${message} (HTTP ${response.status})`);
  }
  return payload;
}

async function createOrderDirectly(payload) {
  const response = await fetch(`${DIRECT_SUPABASE_URL}/rest/v1/rpc/create_order_atomic`, {
    method: "POST",
    headers: {
      apikey: DIRECT_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${DIRECT_SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "Creazione ordine non riuscita");
}

async function uploadPendingOrderAttachments(orderId, pendingAttachments) {
  if (!pendingAttachments.length) return [];
  if (typeof uploadAttachmentFile !== "function") {
    throw new Error("Upload allegati non disponibile");
  }

  const uploaded = [];
  for (const attachment of pendingAttachments) {
    const saved = await uploadAttachmentFile(orderId, attachment);
    if (saved) uploaded.push(saved);
  }
  return uploaded;
}

function clearPendingAttachmentUrls(pendingAttachments) {
  pendingAttachments.forEach((attachment) => {
    if (attachment.localUrl) URL.revokeObjectURL(attachment.localUrl);
  });
}

saveDraftOrder = async function saveDraftOrderConfirmed() {
  if (appState.busy) return;

  const client = (appState.draftOrder.client || "").trim();
  const category = (appState.draftOrder.category || "").trim();
  if (!client) {
    setFlashMessage("Inserisci almeno il cliente prima di salvare l'ordine");
    return;
  }

  const materials = getCleanDraftMaterials();
  const pendingAttachments = Array.isArray(appState.draftOrderAttachments) ? [...appState.draftOrderAttachments] : [];
  const department = resolveDraftDepartment();
  let createdOrderId = null;

  setBusy(true);
  try {
    const created = await createOrderDirectly({
      p_client_name: client,
      p_category: category || null,
      p_department_name: department,
      p_priority: appState.draftOrder.priority || "Standard",
      p_order_date: appState.draftOrder.orderDate || null,
      p_estimated_delivery_date: appState.draftOrder.estimatedDelivery || null,
      p_warehouse_linked: (appState.draftOrder.warehouseLink || "").toLowerCase().includes("magazzino"),
      p_client_visibility_note: "Cliente vede avanzamento base",
      p_internal_notes: appState.draftOrder.note || null,
      p_deposit_status: appState.draftOrder.deposit || null,
    });
    if (!created || !created.id) {
      throw new Error("Creazione ordine senza ID di conferma");
    }
    createdOrderId = created.id;

    if (materials.length) {
      const materialResponse = await fetch("/api/save-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: createdOrderId, materials }),
      });
      await readJsonResponse(materialResponse, "Salvataggio materiali non riuscito");
    }

    const uploaded = await uploadPendingOrderAttachments(createdOrderId, pendingAttachments);
    clearPendingAttachmentUrls(pendingAttachments);
    appState.draftOrderAttachments = [];

    await refreshBootstrap();
    resetOrderFiltersForNewOrder();
    appState.selectedOrderId = createdOrderId;
    appState.currentView = "orders";

    const orderVisible = appData.orders.some((order) => Number(order.id) === Number(createdOrderId));
    const suffix = uploaded.length ? ` con ${uploaded.length} allegati` : "";
    setFlashMessage(
      orderVisible
        ? `Ordine #${createdOrderId} salvato e visibile in Archivio Ordini${suffix}`
        : `Ordine #${createdOrderId} salvato, ma l'archivio non si e' aggiornato: ricarica la pagina`
    );
  } catch (error) {
    if (createdOrderId) {
      appState.currentView = "orders";
      resetOrderFiltersForNewOrder();
      setFlashMessage(`Ordine #${createdOrderId} creato, ma completamento non riuscito: ${error.message}`);
    } else {
      setFlashMessage(error.message || "Errore durante il salvataggio dell'ordine");
    }
  } finally {
    appState.busy = false;
    renderApp();
  }
};
