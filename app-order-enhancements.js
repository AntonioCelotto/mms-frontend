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
    .replace(/"/g, "&quot;")
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
  const order = getSelectedOrder();
  return appState.orderAttachments[order.id] || [];
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
          <div class="ghost-pill">${attachments.length} foto salvate</div>
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

  const order = getSelectedOrder();
  const metricBand = section.querySelector(".metric-band");
  metricBand.insertAdjacentHTML("afterend", renderOrderDetailAttachments());
  loadPersistedOrderAttachments(order.id);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Lettura file non riuscita"));
    reader.readAsDataURL(file);
  });
}

async function uploadAttachmentFile(orderId, attachment) {
  if (!attachment.file) return null;
  const dataUrl = await readFileAsDataUrl(attachment.file);
  const response = await fetch("/api/upload-attachment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: orderId,
      file_name: attachment.name,
      file_type: attachment.type,
      data: dataUrl,
    }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Upload allegato non riuscito");
  }
  const payload = await response.json();
  return normalizePersistedAttachment(payload.attachment);
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

async function loadPersistedOrderAttachments(orderId, force = false) {
  ensureOrderAttachmentState();
  if (!orderId || appState.loadingOrderAttachmentIds[orderId]) return;
  if (!force && appState.loadedOrderAttachmentIds[orderId]) return;

  appState.loadingOrderAttachmentIds[orderId] = true;
  try {
    const response = await fetch(`/api/list-attachments?order_id=${encodeURIComponent(orderId)}`);
    if (!response.ok) return;
    const payload = await response.json();
    appState.orderAttachments[orderId] = (payload.attachments || []).map(normalizePersistedAttachment);
    appState.loadedOrderAttachmentIds[orderId] = true;
    renderApp();
  } finally {
    appState.loadingOrderAttachmentIds[orderId] = false;
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
        const saved = await uploadAttachmentFile(appState.selectedOrderId, attachment);
        if (saved) uploaded.push(saved);
      }
      pendingAttachments.forEach((attachment) => {
        if (attachment.localUrl) URL.revokeObjectURL(attachment.localUrl);
      });
      appState.draftOrderAttachments = [];
      appState.orderAttachments[appState.selectedOrderId] = uploaded;
      appState.loadedOrderAttachmentIds[appState.selectedOrderId] = true;
      setFlashMessage(`Ordine #${appState.selectedOrderId} salvato con ${uploaded.length} allegati`);
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
