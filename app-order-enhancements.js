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

function ensureOrderAttachmentState() {
  if (!Array.isArray(appState.draftOrderAttachments)) {
    appState.draftOrderAttachments = [];
  }
  if (!appState.orderAttachments || typeof appState.orderAttachments !== "object") {
    appState.orderAttachments = {};
  }
}

function resetNewOrderDraft() {
  ensureOrderAttachmentState();
  appState.draftOrderAttachments.forEach((attachment) => URL.revokeObjectURL(attachment.url));
  appState.draftOrder = { ...EMPTY_ORDER_DRAFT };
  appState.draftMaterials = [{ ...EMPTY_MATERIAL_DRAFT }];
  appState.draftOrderAttachments = [];
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
            <img src="${attachment.url}" alt="${escapeOrderEnhancementHtml(attachment.name)}" />
          </button>
          <div class="attachment-info">
            <strong>${escapeOrderEnhancementHtml(attachment.name)}</strong>
            <span>${attachment.sizeLabel}</span>
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
            <p>File caricati durante la creazione dell'ordine #${order.id}.</p>
          </div>
          <div class="ghost-pill">${attachments.length} foto locali</div>
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

function enhanceNewOrderView() {
  const section = document.querySelector("section.view.active input[data-draft='client']")?.closest("section.view");
  if (!section || section.querySelector(".order-attachments-block")) return;

  enhanceDateInputs();
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
        const sizeLabel = file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
        appState.draftOrderAttachments.push({
          name: file.name,
          size: file.size,
          sizeLabel,
          type: file.type,
          url: URL.createObjectURL(file),
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
      if (attachment) window.open(attachment.url, "_blank", "noopener");
    });
  });

  document.querySelectorAll("[data-attachment-download]").forEach((button) => {
    button.addEventListener("click", () => {
      const list = getAttachmentList(button.dataset.attachmentDownload);
      const attachment = list[Number(button.dataset.attachmentIndex)];
      if (!attachment) return;

      const link = document.createElement("a");
      link.href = attachment.url;
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
      if (removed) URL.revokeObjectURL(removed.url);
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
    appState.orderAttachments[appState.selectedOrderId] = pendingAttachments;
    appState.draftOrderAttachments = [];
    renderApp();
  }
};

const baseRenderAppOrderEnhancements = renderApp;
renderApp = function renderAppOrderEnhancements() {
  baseRenderAppOrderEnhancements();
  ensureOrderAttachmentState();
  enhanceDateInputs();
  enhanceNewOrderView();
  enhanceOrderDetailView();
  attachOrderEnhancementEvents();
};

ensureOrderAttachmentState();
