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
const ATTACHMENT_REFRESH_MARGIN_MS = 60000;
const attachmentLoadPromises = new Map();
const attachmentLoadRetryAfter = new Map();
const attachmentImageRetries = new Set();
let attachmentRefreshTimer = null;

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

function attachmentExpiresAt(attachment) {
  try {
    const url = new URL(attachmentUrl(attachment));
    if (url.origin !== ATTACHMENT_SUPABASE_URL || !url.pathname.startsWith("/storage/v1/object/sign/")) return null;
    // Decode only to schedule renewal, never to authorize access. The existing
    // list endpoint still validates the user and their access to the order.
    const token = url.searchParams.get("token") || "";
    const part = (token.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/");
    const expiry = Number(JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "="))).exp);
    return Number.isFinite(expiry) && expiry > 0 ? expiry * 1000 : 0;
  } catch (error) {
    return attachmentUrl(attachment).startsWith(`${ATTACHMENT_SUPABASE_URL}/storage/v1/object/sign/`) ? 0 : null;
  }
}

function attachmentNeedsRefresh(attachment) {
  const expiry = attachmentExpiresAt(attachment);
  return expiry !== null && expiry <= Date.now() + ATTACHMENT_REFRESH_MARGIN_MS;
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
            <img ${attachmentNeedsRefresh(attachment) ? "" : `src="${escapeOrderEnhancementHtml(attachmentUrl(attachment))}"`} data-attachment-image="${scope}" data-attachment-index="${index}" alt="${escapeOrderEnhancementHtml(attachment.name)}" />
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
            <div class="ghost-pill" data-order-attachment-count>${attachments.length} foto salvate</div>
            <button class="action-pill" data-action="pick-existing-order-photo" type="button">+ Foto</button>
            <input class="visually-hidden" data-existing-order-photo-input type="file" accept="image/*" multiple />
          </div>
        </div>
        <p data-order-attachment-message role="status" hidden></p>
        <div data-order-attachment-gallery>${renderAttachmentCards(attachments, "order")}</div>
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
  loadPersistedOrderAttachments(getSelectedOrderStorageId(), false, getSelectedOrderDisplayId()).catch(() => {});
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
  if (response.status === 413) {
    throw new Error("La foto è troppo grande per il caricamento. Riprova con una foto più piccola.");
  }
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

function attachmentFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Lettura del file non riuscita"));
    reader.readAsDataURL(file);
  });
}

async function prepareOrderPhoto(attachment) {
  let data = attachment.file
    ? await attachmentFileDataUrl(attachment.file)
    : String(attachment.dataUrl || attachment.url || attachment.localUrl || "");
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,/i.exec(data);
  if (!match) throw new Error("Formato foto non supportato. Usa JPG, PNG, WebP o GIF.");
  let type = match[1].toLowerCase();
  let name = safeAttachmentFileName(attachment.name || attachment.file?.name);
  // Base64 increases the request size by one third. Keep the complete JSON
  // below Vercel's 4.5 MB limit, while preserving smaller originals unchanged.
  const maxDataLength = 4 * 1024 * 1024;
  if (data.length > maxDataLength) {
    const photo = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Impossibile leggere la foto. Riprova con un'immagine JPG o PNG."));
      image.src = data;
    });
    const width = photo.naturalWidth || photo.width;
    const height = photo.naturalHeight || photo.height;
    if (!width || !height) throw new Error("La foto non contiene un'immagine valida.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Il browser non può preparare la foto. Riprova con una foto più piccola.");
    let scale = Math.min(1, 2560 / Math.max(width, height));
    for (let attempt = 0; attempt < 4; attempt += 1) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(photo, 0, 0, canvas.width, canvas.height);
      data = canvas.toDataURL("image/jpeg", 0.85 - attempt * 0.1);
      if (data.startsWith("data:image/jpeg;base64,") && data.length <= maxDataLength) break;
      scale *= 0.75;
    }
    if (!data.startsWith("data:image/jpeg;base64,") || data.length > maxDataLength) {
      throw new Error("La foto è troppo grande. Riprova con una foto più piccola.");
    }
    type = "image/jpeg";
    name = name.replace(/\.[^.]+$/, "") + ".jpg";
  }
  return { data, type, name };
}

async function uploadAttachmentFile(orderId, attachment) {
  // Photos inherited from a quote carry a data URL instead of a File.
  // Upload that original image to the private order bucket too.
  const { data, type, name } = await prepareOrderPhoto(attachment);
  const response = await fetch("/api/upload-attachment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: orderId,
      file_name: name,
      file_type: type,
      data,
    }),
  });
  const payload = await readAttachmentJson(response, "Upload file non riuscito");
  const row = payload?.attachment || {};
  return normalizePersistedAttachment({
    id: row.id,
    name: row.name || name,
    url: row.url || "",
    mime_type: row.mime_type || type,
    size: row.size || attachment.size,
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
  if (!orderId) return [];
  if (attachmentLoadPromises.has(stateKey)) return attachmentLoadPromises.get(stateKey);
  const current = appState.orderAttachments[stateKey] || [];
  if (!force && appState.loadedOrderAttachmentIds[stateKey] &&
      !current.some((item) => attachmentNeedsRefresh(item) || (item.fromQuote && !item.persisted))) return current;
  if (!force && Date.now() < (attachmentLoadRetryAfter.get(stateKey) || 0)) return current;

  appState.loadingOrderAttachmentIds[stateKey] = true;
  const request = (async () => {
    try {
      const response = await fetch(`/api/list-attachments?order_id=${encodeURIComponent(orderId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Impossibile aggiornare i collegamenti delle foto. Riprova tra poco.");
      const payload = await response.json();
      if (!Array.isArray(payload.attachments)) throw new Error("Elenco allegati non valido");
      const persisted = payload.attachments.map(normalizePersistedAttachment);
      if (persisted.some(attachmentNeedsRefresh)) throw new Error("Collegamento foto non disponibile. Riprova tra poco.");
      const pending = (appState.orderAttachments[stateKey] || []).filter((item) => item.fromQuote && !item.persisted);
      appState.orderAttachments[stateKey] = [...persisted, ...pending.filter((item) =>
        !persisted.some((saved) => saved.name === item.name && Number(saved.size) === Number(item.size)))];
      appState.loadedOrderAttachmentIds[stateKey] = true;
      attachmentLoadRetryAfter.delete(stateKey);
      updateOrderAttachmentGallery(stateKey);
      return appState.orderAttachments[stateKey];
    } catch (error) {
      // Keep the archive and unsaved fields intact; never loop on a failed link.
      attachmentLoadRetryAfter.set(stateKey, Date.now() + 60000);
      throw error;
    } finally {
      appState.loadingOrderAttachmentIds[stateKey] = false;
      attachmentLoadPromises.delete(stateKey);
      scheduleAttachmentRefresh();
    }
  })();
  attachmentLoadPromises.set(stateKey, request);
  return request;
}

function updateOrderAttachmentGallery(stateKey) {
  if (appState.currentView !== "order-detail" || Number(getSelectedOrderDisplayId()) !== Number(stateKey)) return;
  const gallery = document.querySelector("[data-order-attachment-gallery]");
  if (!gallery) return;
  const attachments = appState.orderAttachments[stateKey] || [];
  gallery.innerHTML = renderAttachmentCards(attachments, "order");
  const count = document.querySelector("[data-order-attachment-count]");
  if (count) count.textContent = `${attachments.length} foto salvate`;
  const message = document.querySelector("[data-order-attachment-message]");
  if (message) message.hidden = true;
  attachAttachmentCardEvents(gallery);
}

function scheduleAttachmentRefresh() {
  if (typeof setTimeout !== "function") return;
  clearTimeout(attachmentRefreshTimer);
  if (appState.currentView !== "order-detail" || document.hidden) return;
  const stateKey = getSelectedOrderDisplayId();
  if (attachmentLoadPromises.has(stateKey) || attachmentLoadRetryAfter.has(stateKey)) return;
  const expiries = (appState.orderAttachments[stateKey] || []).map(attachmentExpiresAt).filter((value) => value !== null);
  if (!expiries.length) return;
  const orderId = getSelectedOrderStorageId();
  const delay = Math.min(...expiries) - Date.now() - ATTACHMENT_REFRESH_MARGIN_MS;
  // Invalid/already expired URLs are handled by the normal loader or a click.
  if (delay <= 0) return;
  attachmentRefreshTimer = setTimeout(() => {
    if (appState.currentView === "order-detail" && getSelectedOrderDisplayId() === stateKey) {
      loadPersistedOrderAttachments(orderId, false, stateKey).catch(() => {});
    }
  }, Math.min(delay, 2147483647));
}

async function freshOrderAttachment(attachment, scope, stateKey, orderId) {
  const failedPreview = attachmentImageRetries.has(`${stateKey}:${attachment.id}`);
  if (scope === "draft" || (!attachmentNeedsRefresh(attachment) && !failedPreview)) return attachment;
  const list = await loadPersistedOrderAttachments(orderId, true, stateKey);
  const fresh = list.find((item) => String(item.id) === String(attachment.id));
  if (!fresh || attachmentNeedsRefresh(fresh)) throw new Error("Collegamento foto non disponibile. Riprova tra poco.");
  return fresh;
}

async function uploadFilesToExistingOrder(files) {
  ensureOrderAttachmentState();
  const order = getSelectedOrder();
  const displayId = getSelectedOrderDisplayId();
  const storageId = getSelectedOrderStorageId();
  if (!order || !storageId || !files.length) return;

  setBusy(true);
  let uploadedCount = 0;
  try {
    for (const file of files) {
      const saved = await uploadAttachmentFile(storageId, {
        name: file.name,
        size: file.size,
        sizeLabel: formatAttachmentSize(file.size),
        type: file.type,
        file,
      });
      if (saved) {
        // Keep each confirmed upload even if a later file fails.
        const current = appState.orderAttachments[displayId] || [];
        appState.orderAttachments[displayId] = [...current, saved];
        appState.loadedOrderAttachmentIds[displayId] = true;
        order.files = (Number(order.files) || 0) + 1;
        uploadedCount += 1;
      }
    }
    setFlashMessage(`${uploadedCount} foto aggiunte all'ordine #${displayId}`);
  } catch (error) {
    const savedMessage = uploadedCount ? `${uploadedCount} foto già salvate. ` : "";
    setFlashMessage(savedMessage + (error.message || "Upload foto non riuscito"));
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

  attachAttachmentCardEvents();
  scheduleAttachmentRefresh();
}

function attachAttachmentCardEvents(root = document) {
  root.querySelectorAll("[data-attachment-open], [data-attachment-download]").forEach((button) => {
    if (button.dataset.attachmentBound) return;
    button.dataset.attachmentBound = "true";
    button.addEventListener("click", async () => {
      const scope = button.dataset.attachmentOpen || button.dataset.attachmentDownload;
      const list = getAttachmentList(scope);
      const attachment = list[Number(button.dataset.attachmentIndex)];
      if (!attachment) return;
      const stateKey = getSelectedOrderDisplayId();
      const orderId = getSelectedOrderStorageId();
      // Open synchronously so renewal does not trigger the popup blocker.
      const popup = button.dataset.attachmentOpen ? window.open("", "_blank") : null;
      if (popup) popup.opener = null;
      try {
        const fresh = await freshOrderAttachment(attachment, scope, stateKey, orderId);
        const url = attachmentUrl(fresh);
        if (!url) throw new Error("Collegamento foto non disponibile");
        if (button.dataset.attachmentOpen) {
          if (popup) popup.location.replace(url);
        } else {
          const link = document.createElement("a");
          link.href = url;
          link.download = fresh.name;
          document.body.appendChild(link);
          link.click();
          link.remove();
        }
      } catch (error) {
        if (popup) popup.close();
        const message = document.querySelector("[data-order-attachment-message]");
        if (message) {
          message.textContent = error.message || "Foto non disponibile. Riprova tra poco.";
          message.hidden = false;
        }
      }
    });
  });

  root.querySelectorAll("[data-attachment-image='order']").forEach((image) => {
    if (image.dataset.attachmentBound) return;
    image.dataset.attachmentBound = "true";
    const stateKey = getSelectedOrderDisplayId();
    const orderId = getSelectedOrderStorageId();
    const attachment = (appState.orderAttachments[stateKey] || [])[Number(image.dataset.attachmentIndex)];
    if (!attachment?.persisted) return;
    const key = `${stateKey}:${attachment.id}`;
    image.addEventListener("load", () => attachmentImageRetries.delete(key));
    image.addEventListener("error", () => {
      if (attachmentImageRetries.has(key)) {
        image.alt = "Foto temporaneamente non disponibile. Premi Visualizza per riprovare.";
        return;
      }
      attachmentImageRetries.add(key);
      loadPersistedOrderAttachments(orderId, true, stateKey).catch(() => {
        image.alt = "Foto temporaneamente non disponibile. Riprova tra poco.";
      });
    });
  });

  root.querySelectorAll("[data-attachment-remove]").forEach((button) => {
    if (button.dataset.attachmentBound) return;
    button.dataset.attachmentBound = "true";
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
if (typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => {
    scheduleAttachmentRefresh();
    if (!document.hidden && appState.currentView === "order-detail") {
      loadPersistedOrderAttachments(getSelectedOrderStorageId(), false, getSelectedOrderDisplayId()).catch(() => {});
    }
  });
}
