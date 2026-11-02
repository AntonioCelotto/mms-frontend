// Order-only, recoverable photo removal. Never edit the quote or Storage blob.
const orderPhotoTrashState = new Map();
const orderPhotoMutationLocks = new Set();

function canManageOrderPhotos() {
  const profile = window.mmsAuthProfile;
  return !!profile && profile.is_active !== false && ["admin", "commerce"].includes(profile.access_profile);
}

function rememberOrderPhotoTrash(payload, stateKey) {
  orderPhotoTrashState.set(Number(stateKey), {
    deleted: Array.isArray(payload.deleted_attachments) ? payload.deleted_attachments : [],
    hiddenNames: Array.isArray(payload.hidden_photo_names) ? payload.hidden_photo_names : [],
  });
}

async function invalidateOrderPhotoGalleries() {
  // The order visibility trigger changes the existing live-sync marker.
  // Refresh only the gallery, never a form the operator may be editing.
  appState.loadedOrderAttachmentIds = {};
  if (appState.currentView !== "order-detail") return;
  const stateKey = getSelectedOrderDisplayId();
  const orderId = getSelectedOrderStorageId();
  if (orderPhotoMutationLocks.has(stateKey)) return;
  if (attachmentLoadPromises.has(stateKey)) await attachmentLoadPromises.get(stateKey);
  await loadPersistedOrderAttachments(orderId, true, stateKey);
}

function isOrderPhotoHidden(photo, stateKey) {
  // Pending local previews inherited from quotes must not resurrect a removed
  // order photo. Persisted IDs stay independent even for duplicate filenames.
  if (photo.persisted) return false;
  const names = orderPhotoTrashState.get(Number(stateKey))?.hiddenNames || [];
  const name = safeAttachmentFileName(photo.name);
  const jpegName = name.replace(/\.[^.]+$/, "") + ".jpg";
  return names.includes(name) || names.includes(jpegName);
}

function renderOrderPhotoDeleteButton(photo) {
  if (!canManageOrderPhotos() || !photo.persisted || !photo.id) return "";
  return `<button class="mini-btn danger" data-order-photo-delete="${escapeOrderEnhancementHtml(photo.id)}" type="button">Cancella</button>`;
}

function renderOrderPhotoTrash() {
  if (!canManageOrderPhotos()) return "";
  const deleted = orderPhotoTrashState.get(Number(getSelectedOrderDisplayId()))?.deleted || [];
  if (!deleted.length) return "";
  return `<details class="order-photo-trash"><summary>Foto eliminate (${deleted.length})</summary>
    <p>Le foto sono recuperabili. Gli originali dei preventivi non vengono modificati.</p>
    ${deleted.map((photo) => `<div class="order-photo-trash-row"><span>${escapeOrderEnhancementHtml(photo.name)}</span>
      <button class="mini-btn" data-order-photo-restore="${escapeOrderEnhancementHtml(photo.id)}" type="button">Ripristina</button></div>`).join("")}</details>`;
}

function updateOrderPhotoTrash(stateKey) {
  if (Number(getSelectedOrderDisplayId()) !== Number(stateKey)) return;
  const target = document.querySelector("[data-order-photo-trash]");
  if (target) target.innerHTML = renderOrderPhotoTrash();
  attachOrderPhotoTrashEvents();
}

function orderPhotoMessage(stateKey, text) {
  if (Number(getSelectedOrderDisplayId()) !== Number(stateKey)) return;
  const target = document.querySelector("[data-order-attachment-message]");
  if (target) { target.textContent = text; target.hidden = false; }
}

function confirmOrderPhotoRemoval(photo) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "order-photo-confirm";
    dialog.setAttribute("aria-labelledby", "order-photo-confirm-title");
    dialog.innerHTML = `<h3 id="order-photo-confirm-title">Cancellare questa foto dall'ordine?</h3>
      <img src="${escapeOrderEnhancementHtml(attachmentUrl(photo))}" alt="${escapeOrderEnhancementHtml(photo.name)}">
      <p>${escapeOrderEnhancementHtml(photo.name)}</p>
      <p>Potrai recuperarla da “Foto eliminate”. Il preventivo originale resta invariato.</p>
      <div class="pill-row"><button class="mini-btn" data-photo-cancel type="button" autofocus>Annulla</button>
      <button class="mini-btn danger" data-photo-confirm type="button">Cancella foto</button></div>`;
    let done = false;
    const finish = (confirmed) => {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      resolve(confirmed);
    };
    dialog.querySelector("[data-photo-cancel]").addEventListener("click", () => finish(false));
    dialog.querySelector("[data-photo-confirm]").addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
    dialog.addEventListener("close", () => finish(false));
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

async function changeOrderPhotoVisibility(id, action) {
  if (!canManageOrderPhotos()) return;
  const stateKey = getSelectedOrderDisplayId();
  const orderId = getSelectedOrderStorageId();
  if (orderPhotoMutationLocks.has(stateKey)) return;
  const list = action === "delete" ? getAttachmentList("order") : (orderPhotoTrashState.get(Number(stateKey))?.deleted || []);
  const photo = list.find((item) => String(item.id) === String(id));
  if (!photo) return;
  orderPhotoMutationLocks.add(stateKey);
  let saved = false;
  try {
    if (action === "delete") {
      const fresh = await freshOrderAttachment(photo, "order", stateKey, orderId);
      if (!await confirmOrderPhotoRemoval(fresh)) return;
    }
    // Drain a pre-existing renewal so it cannot reinsert a deleted photo after
    // the mutation completes. A subsequent fresh list is the source of truth.
    if (attachmentLoadPromises.has(stateKey)) await attachmentLoadPromises.get(stateKey);
    const response = await fetch("/api/update-attachment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId, attachment_id: photo.id, action,
        expected_deleted_at: action === "restore" ? photo.deleted_at : undefined }),
    });
    const result = await readAttachmentJson(response, "Aggiornamento foto non riuscito");
    saved = true;
    if (action === "delete") {
      const state = orderPhotoTrashState.get(Number(stateKey)) || { deleted: [], hiddenNames: [] };
      state.deleted = [...state.deleted.filter((item) => String(item.id) !== String(photo.id)), result.attachment];
      state.hiddenNames = [...new Set([...state.hiddenNames, photo.name])];
      orderPhotoTrashState.set(Number(stateKey), state);
      appState.orderAttachments[stateKey] = (appState.orderAttachments[stateKey] || []).filter((item) =>
        String(item.id) !== String(photo.id) && !isOrderPhotoHidden(item, stateKey));
    }
    const order = appData.orders?.find((item) => Number(item.id) === Number(stateKey));
    if (order && Number.isInteger(result.active_count)) order.files = result.active_count;
    appState.loadedOrderAttachmentIds[stateKey] = false;
    updateOrderAttachmentGallery(stateKey);
    await loadPersistedOrderAttachments(orderId, true, stateKey);
    orderPhotoMessage(stateKey, action === "delete" ? "Foto eliminata. Puoi recuperarla da Foto eliminate." : "Foto ripristinata.");
  } catch (error) {
    // On a lost response the server may already have saved: never automatically
    // repeat a write or resurrect local photos. The next open reloads the list.
    appState.loadedOrderAttachmentIds[stateKey] = false;
    orderPhotoMessage(stateKey, saved ? "Modifica salvata. Riapri l'ordine per aggiornare l'elenco foto." : (error.message || "Operazione non riuscita. Riapri l'ordine e riprova."));
  } finally {
    orderPhotoMutationLocks.delete(stateKey);
  }
}

function attachOrderPhotoTrashEvents() {
  document.querySelectorAll("[data-order-photo-delete], [data-order-photo-restore]").forEach((button) => {
    if (button.dataset.photoTrashBound) return;
    button.dataset.photoTrashBound = "true";
    button.addEventListener("click", async () => {
      const action = button.dataset.orderPhotoDelete ? "delete" : "restore";
      button.disabled = true;
      try { await changeOrderPhotoVisibility(button.dataset.orderPhotoDelete || button.dataset.orderPhotoRestore, action); }
      finally { button.disabled = false; }
    });
  });
}
