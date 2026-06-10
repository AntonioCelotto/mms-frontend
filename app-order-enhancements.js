const ORDER_CATEGORY_OPTIONS = [
  "Sartoria",
  "Commercio",
  "Campionario",
  "Riparazione",
  "Controllo qualita'",
  "Materiale cliente",
  "Personalizzazione",
  "Altro",
];

const ATTACHMENT_SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
const ATTACHMENT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";
const ATTACHMENT_STORAGE_BUCKET = "order-attachments";

const EMPTY_ORDER_DRAFT = {
  client: "",
  category: "",
  priority: "Standard",
  deposit: "",
  department: "",
  orderDate: "",
  estimatedDelivery: "",
  warehouseLink: "",
  note: "",
};

const EMPTY_MATERIAL_DRAFT = {
  product_name: "",
  source_type: "mms",
  delivery_status: "non_consegnato",
  warehouse_status_note: "",
  preorder_note: "",
};

function escapeOrderEnhancementHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAttachmentSize(size) {
  const numeric = Number(size || 0);
  if (!numeric) return "Dimensione n/d";
  return numeric >= 1048576 ? `${(numeric / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(numeric / 1024))} KB`;
}

function ensureOrderAttachmentState() {
  if (!Array.isArray(appState.draftOrderAttachments)) {
    appState.draftOrderAttachments = [];
  }
  if (!appState.orderAttachments || typeof appState.orderAttachments !== "object") {
    appState.orderAttachments = {};
  }
  if (!appState.loadedOrderAttachmentIds || typeof appState.loadedOrderAttachmentIds !== "object") {
    appState.loadedOrderAttachmentIds = {};
  }
  if (!appState.loadingOrderAttachmentIds || typeof appState.loadingOrderAttachmentIds !== "object") {
    appState.loadingOrderAttachmentIds = {};
  }
}

function getSelectedOrderDisplayId() {
  const order = getSelectedOrder();
  return Number(order?.id || appState.selectedOrderId);
}

function getSelectedOrderStorageId() {
  const order = getSelectedOrder();
  return Number(order?.db_id || order?.id || appState.selectedOrderId);
}

function resetNewOrderDraft() {
  ensureOrderAttachmentState();
  appState.draftOrderAttachments.forEach((attachment) => {
    if (attachment.localUrl) URL.revokeObjectURL(attachment.localUrl);
  });
  appState.draftOrder = { ...EMPTY_ORDER_DRAFT };
  appState.draftMaterials = [{ ...EMPTY_MATERIAL_DRAFT }];
  appState.draftOrderAttachments = [];
}

function attachmentUrl(attachment) {
  return attachment.url || attachment.localUrl || "";
}

function renderAttachmentCards(attachments, scope) {
  if (!attachments.length) {
    return `<div class="empty-state">Nessuna foto caricata per questo ${scope === "draft" ? "nuovo ordine" : "ordine"}.</div>`;
  }

  return `
    <div class="attachment-grid">
      ${attachments
        .map(
          (attachment, index) => `
        <div class="attachment-card">
          <button class="attachment-preview" data-attachment-open="${scope}" data-attachment-index="${index}" type="button">
            <img src="${attachmentUrl(attachment)}" alt="${escapeOrderEnhancementHtml(attachment.name)}" />
          </button>
          <div class="attachment-info">
            <strong>${escapeOrderEnhancementHtml(attachment.name)}</strong>
            <span>${attachment.sizeLabel || formatAttachmentSize(attachment.size)}</span>
          </div>
          <div class="pill-row attachment-actions">
            <button class="mini-btn" data-attachment-open="${scope}" data-attachment-index="${index}" type="button">Visualizza</button>
            <button class="mini-btn" data-attachment-download="${scope}" data-attachment-index="${index}" type="button">Scarica</button>
            ${scope === "draft" ? `<button class="mini-btn" data-attachment-remove="${index}" type="button">Rimuovi</button>` : ""}
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function getAttachmentList(scope) {
  ensureOrderAttachmentState();
  if (scope === "draft") return appState.draftOrderAttachments;
  return appState.orderAttachments[getSelectedOrderDisplayId()] || [];
}

function renderNewOrderAttachments() {
  ensureOrderAttachmentState();
  return `
    <div class="order-attachments-block">
      <div class="section-title">
        <div>
          <h3>Foto e allegati ordine</h3>
          <p>Carica immagini del capo, materiali, etichette o prove da collegare all'ordine.</p>
        </div>
        <div class="pill-row">
          <button class="action-pill" data-action="pick-order-photo" type="button">+ Foto</button>
          <input class="visually-hidden" data-order-photo-input type="file" accept="image/*" multiple />
        </div>
      </div>
      ${renderAttachmentCards(appState.draftOrderAttachments, "draft")}
    </div>
  `;
}

function renderOrderDetailAttachments() {
  const order = getSelectedOrder();
  const attachments = getAttachmentList("order");
  return `
    <div class="surface order-detail-attachments">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Foto e allegati ordine</h3>
            <p>File salvati e collegati all'ordine #${order.id}.</p>
          </div>
          <div class="pill-row">
            <div class="ghost-pill">${attachments.length} foto salvate</div>
            <button class="action-pill" data-action="pick-existing-order-photo" type="button">+ Foto</button>
            <input class="visually-hidden" data-existing-order-photo-input type="file" accept="image/*" multiple />
          </div>
        </div>
        ${renderAttachmentCards(attachments, "order")}
      </div>
    </div>
  `;
}

function enhanceDateInputs() {
  document.querySelectorAll("input[data-draft='orderDate'], input[data-draft='estimatedDelivery']").forEach((input) => {
    input.type = "date";
    input.placeholder = "Seleziona data";
  });
}

function enhanceCategorySelect() {
  const input = document.querySelector("input[data-draft='category']");
  if (!input || input.dataset.enhancedCategory === "true") return;

  const select = document.createElement("select");
  select.className = input.className || "filter-chip";
  select.dataset.draft = "category";
  select.dataset.enhancedCategory = "true";
  select.innerHTML = ["<option value=\"\">Seleziona categoria</option>"]
    .concat(
      ORDER_CATEGORY_OPTIONS.map(
        (category) => `<option value="${escapeOrderEnhancementHtml(category)}" ${appState.draftOrder.category === category ? "selected" : ""}>${escapeOrderEnhancementHtml(category)}</option>`
      )
    )
    .join("");
  select.addEventListener("change", (event) => {
    appState.draftOrder.category = event.target.value;
  });
  input.replaceWith(select);
}

function enhanceNewOrderView() {
  const section = document.querySelector("section.view.active input[data-draft='client']")?.closest("section.view");
  if (!section) return;

  enhanceDateInputs();
  enhanceCategorySelect();
  if (section.querySelector(".order-attachments-block")) return;

  const materialActions = section.querySelector("button[data-action='add-material']")?.closest(".pill-row");
  if (materialActions) {
    materialActions.insertAdjacentHTML("beforebegin", renderNewOrderAttachments());
  }
}

function enhanceOrderDetailView() {
  const section = document.querySelector("section.view.active .metric-band")?.closest("section.view");
  if (!section || section.querySelector(".order-detail-attachments")) return;

  const metricBand = section.querySelector(".metric-band");
  metricBand.insertAdjacentHTML("afterend", renderOrderDetailAttachments());
  loadPersistedOrderAttachments(getSelectedOrderStorageId(), false, getSelectedOrderDisplayId());
}

function safeAttachmentFileName(name) {
  const cleaned = String(name || "attachment")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return cleaned || "attachment";
}

function encodeStoragePath(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function buildAttachmentStoragePath(orderId, file) {
  const fileName = safeAttachmentFileName(file.name);
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `orders/${orderId}/${unique}-${fileName}`;
}

async function readAttachmentJson(response, fallbackMessage) {
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
    throw new Error(detail ? `${fallbackMessage}: ${detail}` : `${fallbackMessage} (HTTP ${response.status})`);
  }
  return payload;
}

async function uploadAttachmentObject(path, file) {
  const response = await fetch(
    `${ATTACHMENT_SUPABASE_URL}/storage/v1/object/${ATTACHMENT_STORAGE_BUCKET}/${encodeStoragePath(path)}`,
    {
      method: "POST",
      headers: {
        apikey: ATTACHMENT_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${ATTACHMENT_SUPABASE_ANON_KEY}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
      },
      body: file,
    }
  );
  await readAttachmentJson(response, "Upload file non riuscito");
}

async function insertAttachmentRow(orderId, attachment, path, publicUrl) {
  const response = await fetch(`${ATTACHMENT_SUPABASE_URL}/rest/v1/attachments`, {
    method: "POST",
    headers: {
      apikey: ATTACHMENT_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${ATTACHMENT_SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      order_id: orderId,
      file_type: "foto",
      file_name: safeAttachmentFileName(attachment.name),
      file_url: publicUrl,
      storage_bucket: ATTACHMENT_STORAGE_BUCKET,
      storage_path: path,
      mime_type: attachment.type || "application/octet-stream",
      file_size: attachment.size || 0,
      notes: "Caricato dalla scheda ordine",
    }),
  });
  const payload = await readAttachmentJson(response, "Registrazione allegato non riuscita");
  return Array.isArray(payload) ? payload[0] : payload;
}

async function uploadAttachmentFile(orderId, attachment) {
  if (!attachment.file) return null;
  const path = buildAttachmentStoragePath(orderId, attachment.file);
  await uploadAttachmentObject(path, attachment.file);
  const publicUrl = `${ATTACHMENT_SUPABASE_URL}/storage/v1/object/public/${ATTACHMENT_STORAGE_BUCKET}/${encodeStoragePath(path)}`;
  const row = await insertAttachmentRow(orderId, attachment, path, publicUrl);
  return normalizePersistedAttachment({
    id: row?.id,
    name: row?.file_name || attachment.name,
    url: row?.file_url || publicUrl,
    mime_type: row?.mime_type || attachment.type,
    size: row?.file_size || attachment.size,
  });
}

function normalizePersistedAttachment(attachment) {
  return {
    id: attachment.id,
    name: attachment.name || "Allegato",
    url: attachment.url,
    type: attachment.mime_type || "",
    size: attachment.size || 0,
    sizeLabel: formatAttachmentSize(attachment.size),
    persisted: true,
  };
}

async function loadPersistedOrderAttachments(orderId, force = false, stateKey = orderId) {
  ensureOrderAttachmentState();
  if (!orderId || appState.loadingOrderAttachmentIds[stateKey]) return;
  if (!force && appState.loadedOrderAttachmentIds[stateKey]) return;

  appState.loadingOrderAttachmentIds[stateKey] = true;
  try {
    const response = await fetch(`/api/list-attachments?order_id=${encodeURIComponent(orderId)}`);
    if (!response.ok) return;
    const payload = await response.json();
    appState.orderAttachments[stateKey] = (payload.attachments || []).map(normalizePersistedAttachment);
    appState.loadedOrderAttachmentIds[stateKey] = true;
    renderApp();
  } finally {
    appState.loadingOrderAttachmentIds[stateKey] = false;
  }
}

async function uploadFilesToExistingOrder(files) {
  ensureOrderAttachmentState();
  const order = getSelectedOrder();
  const displayId = getSelectedOrderDisplayId();
  const storageId = getSelectedOrderStorageId();
  if (!order || !storageId || !files.length) return;

  setBusy(true);
  try {
    const uploaded = [];
    for (const file of files) {
      const saved = await uploadAttachmentFile(storageId, {
        name: file.name,
        size: file.size,
        sizeLabel: formatAttachmentSize(file.size),
        type: file.type,
        file,
      });
      if (saved) uploaded.push(saved);
    }

    const current = appState.orderAttachments[displayId] || [];
    appState.orderAttachments[displayId] = [...current, ...uploaded];
    appState.loadedOrderAttachmentIds[displayId] = true;
    if (Number.isFinite(Number(order.files))) {
      order.files = Number(order.files) + uploaded.length;
    } else {
      order.files = uploaded.length;
    }
    setFlashMessage(`${uploaded.length} foto aggiunte all'ordine #${displayId}`);
  } catch (error) {
    setFlashMessage(error.message || "Upload foto non riuscito");
  } finally {
    appState.busy = false;
    renderApp();
  }
}

function attachOrderEnhancementEvents() {
  const pickPhoto = document.querySelector("[data-action='pick-order-photo']");
  const photoInput = document.querySelector("[data-order-photo-input]");

  if (pickPhoto && photoInput) {
    pickPhoto.addEventListener("click", () => photoInput.click());
    photoInput.addEventListener("change", (event) => {
      ensureOrderAttachmentState();
      const files = Array.from(event.target.files || []);
      files.forEach((file) => {
        appState.draftOrderAttachments.push({
          name: file.name,
          size: file.size,
          sizeLabel: formatAttachmentSize(file.size),
          type: file.type,
          localUrl: URL.createObjectURL(file),
          file,
          persisted: false,
        });
      });
      event.target.value = "";
      renderApp();
    });
  }

  const pickExistingPhoto = document.querySelector("[data-action='pick-existing-order-photo']");
  const existingPhotoInput = document.querySelector("[data-existing-order-photo-input]");

  if (pickExistingPhoto && existingPhotoInput) {
    pickExistingPhoto.addEventListener("click", () => existingPhotoInput.click());
    existingPhotoInput.addEventListener("change", (event) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      uploadFilesToExistingOrder(files);
    });
  }

  document.querySelectorAll("[data-attachment-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const list = getAttachmentList(button.dataset.attachmentOpen);
      const attachment = list[Number(button.dataset.attachmentIndex)];
      const url = attachment ? attachmentUrl(attachment) : "";
      if (url) window.open(url, "_blank", "noopener");
    });
  });

  document.querySelectorAll("[data-attachment-download]").forEach((button) => {
    button.addEventListener("click", () => {
      const list = getAttachmentList(button.dataset.attachmentDownload);
      const attachment = list[Number(button.dataset.attachmentIndex)];
      const url = attachment ? attachmentUrl(attachment) : "";
      if (!attachment || !url) return;

      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  });

  document.querySelectorAll("[data-attachment-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.attachmentRemove);
      const [removed] = appState.draftOrderAttachments.splice(index, 1);
      if (removed?.localUrl) URL.revokeObjectURL(removed.localUrl);
      renderApp();
    });
  });
}

const baseNavigateOrderEnhancements = navigate;
navigate = function navigateOrderEnhancements(view, orderId) {
  const wasInNewOrder = appState.currentView === "new-order";
  if (view === "new-order" && !wasInNewOrder) {
    resetNewOrderDraft();
  }
  baseNavigateOrderEnhancements(view, orderId);
};

const baseSaveDraftOrderEnhancements = saveDraftOrder;
saveDraftOrder = async function saveDraftOrderWithAttachments() {
  ensureOrderAttachmentState();
  const pendingAttachments = [...appState.draftOrderAttachments];
  await baseSaveDraftOrderEnhancements();

  if (appState.currentView === "order-detail" && appState.selectedOrderId && pendingAttachments.length) {
    try {
      const uploaded = [];
      for (const attachment of pendingAttachments) {
        const saved = await uploadAttachmentFile(getSelectedOrderStorageId(), attachment);
        if (saved) uploaded.push(saved);
      }
      pendingAttachments.forEach((attachment) => {
        if (attachment.localUrl) URL.revokeObjectURL(attachment.localUrl);
      });
      appState.draftOrderAttachments = [];
      appState.orderAttachments[getSelectedOrderDisplayId()] = uploaded;
      appState.loadedOrderAttachmentIds[getSelectedOrderDisplayId()] = true;
      setFlashMessage(`Ordine #${getSelectedOrderDisplayId()} salvato con ${uploaded.length} allegati`);
    } catch (error) {
      setFlashMessage(error.message || "Ordine salvato, ma upload allegati non riuscito");
    }
  }
};

const baseRenderAppOrderEnhancements = renderApp;
renderApp = function renderAppOrderEnhancements() {
  baseRenderAppOrderEnhancements();
  ensureOrderAttachmentState();
  enhanceDateInputs();
  enhanceCategorySelect();
  enhanceNewOrderView();
  enhanceOrderDetailView();
  attachOrderEnhancementEvents();
};

ensureOrderAttachmentState();
