const ORDER_DETAIL_EDIT_STORAGE_KEY = "mms_order_detail_edits_v1";

function orderDetailEditEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function orderDetailEditEnsureState() {
  if (!appState.orderDetailEdits || typeof appState.orderDetailEdits !== "object") {
    appState.orderDetailEdits = {};
  }
  if (!appState.orderQuoteSourceByOrderId || typeof appState.orderQuoteSourceByOrderId !== "object") {
    appState.orderQuoteSourceByOrderId = {};
  }
}

function orderDetailEditEnsureStyles() {
  if (document.getElementById("order-detail-edit-styles")) return;
  const style = document.createElement("style");
  style.id = "order-detail-edit-styles";
  style.textContent = `
    .order-detail-edit-panel { margin-top: 16px; }
    .order-detail-edit-section { margin-top: 22px; }
    .order-detail-edit-scroll { overflow-x: auto; }
    .order-detail-edit-scroll table { min-width: 860px; }
    .order-detail-edit-task {
      grid-template-columns: minmax(170px, 1.15fr) minmax(130px, 0.85fr) minmax(170px, 1fr) minmax(150px, 0.9fr) minmax(110px, 0.65fr) minmax(140px, 0.8fr) auto;
      align-items: end;
    }
    .order-detail-edit-task label {
      display: block;
      margin-bottom: 6px;
    }
    @media (max-width: 1320px) {
      .order-detail-edit-task {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;
  document.head.appendChild(style);
}

function orderDetailEditReadStored() {
  try {
    return JSON.parse(localStorage.getItem(ORDER_DETAIL_EDIT_STORAGE_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function orderDetailEditWriteStored(orderId, draft) {
  try {
    const stored = orderDetailEditReadStored();
    stored[orderId] = draft;
    localStorage.setItem(ORDER_DETAIL_EDIT_STORAGE_KEY, JSON.stringify(stored));
  } catch (error) {
    console.warn("Salvataggio locale ordine non disponibile", error);
  }
}

function orderDetailEditFormatPayment(rows) {
  const summary = (Array.isArray(rows) ? rows : [])
    .filter((row) => row.type || row.amount || row.date || row.note)
    .map((row) => `${row.type || "Pagamento"} ${row.amount || ""}${row.date ? ` (${row.date})` : ""}`.trim())
    .join(" - ");
  return summary || "Da definire";
}

function orderDetailEditParsePayments(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "Da Pagare" || raw === "Non pagato") {
    return [{ type: "Acconto", amount: "", date: "", note: "" }];
  }
  return raw.split(/\s+-\s+/).filter(Boolean).map((part) => ({
    type: part.toLowerCase().includes("saldo") ? "Saldo" : "Acconto",
    amount: part.replace(/^(Acconto|Saldo)\s*/i, "").replace(/\s*\([^)]*\)\s*$/, ""),
    date: (part.match(/\(([^)]*)\)/) || [])[1] || "",
    note: "",
  }));
}

function orderDetailEditMaterialToDraft(material) {
  return {
    product_name: material.product_name || material.material || "",
    quantity_required: material.quantity_required || "1",
    source_type: String(material.source_type || material.source || "").toLowerCase().includes("cliente") ? "cliente" : "mms",
    delivery_status: String(material.delivery_status || material.delivery || "").toLowerCase().includes("consegnato") &&
      !String(material.delivery_status || material.delivery || "").toLowerCase().includes("non")
      ? "consegnato"
      : "non_consegnato",
    warehouse_status_note: material.warehouse_status_note || material.warehouse || "",
    preorder_note: material.preorder_note || material.preorder || "",
  };
}

function orderDetailEditMaterialFromDraft(material) {
  return {
    material: material.product_name || "Materiale",
    source: material.source_type === "cliente" ? "Cliente" : "MMS",
    warehouse: material.warehouse_status_note || "Inserimento manuale",
    delivery: material.delivery_status === "consegnato" ? "Consegnato" : "Non consegnato",
    preorder: material.preorder_note || "Nessun preordine",
    product_name: material.product_name || "",
    source_type: material.source_type || "mms",
    delivery_status: material.delivery_status || "non_consegnato",
    warehouse_status_note: material.warehouse_status_note || "",
    preorder_note: material.preorder_note || "",
    quantity_required: material.quantity_required || "1",
  };
}

function orderDetailEditTaskToDraft(task) {
  return {
    id: task.id || "",
    name: task.name || task.task_name || "",
    phase: task.phase || task.task_phase || "",
    team: task.team || "",
    hours: String(task.hours || "").replace(" h", "").trim(),
    time: task.time || "",
    state: task.state || "Da avviare",
  };
}

function orderDetailEditTaskFromDraft(task) {
  const cleanHours = String(task.hours || "").trim();
  return {
    id: task.id || "",
    name: task.name || "Nuovo task",
    phase: task.phase || "Lavorazione",
    team: task.team || "Da assegnare",
    hours: cleanHours ? `${cleanHours.replace(".", ",")} h` : "0,0 h",
    time: task.time || "Da pianificare",
    state: task.state || "Da avviare",
  };
}

function orderDetailEditDraftFor(order) {
  orderDetailEditEnsureState();
  const orderId = Number(order?.id || appState.selectedOrderId);
  if (!orderId) return null;

  if (!appState.orderDetailEdits[orderId]) {
    const stored = orderDetailEditReadStored()[orderId];
    appState.orderDetailEdits[orderId] = stored || {
      client: order.client || "",
      category: order.category || "",
      department: order.department || "",
      priority: order.priority || "Standard",
      status: order.status || "Da avviare",
      orderDate: order.orderDate || "",
      estimatedDelivery: order.estimatedDelivery || order.eta || "",
      customerWindow: order.customerWindow || "",
      notes: order.notes || order.summary || "",
      payments: orderDetailEditParsePayments(order.payment),
      materials: (appData.orderMaterials?.[orderId] || []).map(orderDetailEditMaterialToDraft),
      tasks: (appData.orderTasks?.[orderId] || []).map(orderDetailEditTaskToDraft),
    };
  }

  const draft = appState.orderDetailEdits[orderId];
  if (!Array.isArray(draft.payments) || !draft.payments.length) draft.payments = [{ type: "Acconto", amount: "", date: "", note: "" }];
  if (!Array.isArray(draft.materials) || !draft.materials.length) draft.materials = [{ product_name: "", quantity_required: "1", source_type: "mms", delivery_status: "non_consegnato", warehouse_status_note: "", preorder_note: "" }];
  if (!Array.isArray(draft.tasks)) draft.tasks = [];
  return draft;
}

function orderDetailEditApplyStoredToOrders() {
  const stored = orderDetailEditReadStored();
  if (!appData?.orders) return;
  appData.orders.forEach((order) => {
    const draft = stored[Number(order.id)];
    if (!draft) return;
    order.client = draft.client || order.client;
    order.category = draft.category || order.category;
    order.department = draft.department || order.department;
    order.priority = draft.priority || order.priority;
    order.status = draft.status || order.status;
    order.orderDate = draft.orderDate || order.orderDate;
    order.estimatedDelivery = draft.estimatedDelivery || order.estimatedDelivery;
    order.eta = draft.estimatedDelivery || order.eta;
    order.customerWindow = draft.customerWindow || order.customerWindow;
    order.notes = draft.notes || order.notes;
    order.summary = draft.notes || order.summary;
    order.payment = orderDetailEditFormatPayment(draft.payments);
    if (!appData.orderMaterials) appData.orderMaterials = {};
    if (!appData.orderTasks) appData.orderTasks = {};
    appData.orderMaterials[Number(order.id)] = (draft.materials || []).map(orderDetailEditMaterialFromDraft);
    appData.orderTasks[Number(order.id)] = (draft.tasks || []).map(orderDetailEditTaskFromDraft);
  });
}

function orderDetailEditPaymentRows(rows) {
  return rows.map((row, index) => `
    <tr>
      <td>
        <select class="filter-chip" data-order-detail-payment-index="${index}" data-order-detail-payment-field="type">
          ${["Acconto", "Saldo"].map((type) => `<option value="${type}" ${row.type === type ? "selected" : ""}>${type}</option>`).join("")}
        </select>
      </td>
      <td><input class="field-value" data-order-detail-payment-index="${index}" data-order-detail-payment-field="amount" value="${orderDetailEditEscape(row.amount)}" placeholder="0,00" /></td>
      <td><input class="field-value" type="date" data-order-detail-payment-index="${index}" data-order-detail-payment-field="date" value="${orderDetailEditEscape(row.date)}" /></td>
      <td><input class="field-value" data-order-detail-payment-index="${index}" data-order-detail-payment-field="note" value="${orderDetailEditEscape(row.note)}" placeholder="nota pagamento" /></td>
      <td><button class="mini-btn" data-order-detail-remove-payment="${index}" type="button">Rimuovi</button></td>
    </tr>
  `).join("");
}

function orderDetailEditMaterialRows(rows) {
  return rows.map((row, index) => `
    <tr>
      <td><input class="field-value" data-order-detail-material-index="${index}" data-order-detail-material-field="product_name" value="${orderDetailEditEscape(row.product_name)}" /></td>
      <td><input class="field-value" data-order-detail-material-index="${index}" data-order-detail-material-field="quantity_required" value="${orderDetailEditEscape(row.quantity_required)}" /></td>
      <td>
        <select class="filter-chip" data-order-detail-material-index="${index}" data-order-detail-material-field="source_type">
          <option value="mms" ${row.source_type === "mms" ? "selected" : ""}>MMS</option>
          <option value="cliente" ${row.source_type === "cliente" ? "selected" : ""}>Cliente</option>
        </select>
      </td>
      <td>
        <select class="filter-chip" data-order-detail-material-index="${index}" data-order-detail-material-field="delivery_status">
          <option value="non_consegnato" ${row.delivery_status !== "consegnato" ? "selected" : ""}>Non consegnato</option>
          <option value="consegnato" ${row.delivery_status === "consegnato" ? "selected" : ""}>Consegnato</option>
        </select>
      </td>
      <td><input class="field-value" data-order-detail-material-index="${index}" data-order-detail-material-field="warehouse_status_note" value="${orderDetailEditEscape(row.warehouse_status_note)}" /></td>
      <td><input class="field-value" data-order-detail-material-index="${index}" data-order-detail-material-field="preorder_note" value="${orderDetailEditEscape(row.preorder_note)}" /></td>
      <td><button class="mini-btn" data-order-detail-remove-material="${index}" type="button">Rimuovi</button></td>
    </tr>
  `).join("");
}

function orderDetailEditTaskRows(rows) {
  if (!rows.length) return `<div class="empty-state">Nessun task ancora inserito. Usa + Task per organizzare il lavoro.</div>`;
  return rows.map((row, index) => `
    <div class="task-item order-detail-edit-task">
      <div>
        <label class="muted">Task</label>
        <input class="field-value" data-order-detail-task-index="${index}" data-order-detail-task-field="name" value="${orderDetailEditEscape(row.name)}" />
      </div>
      <div>
        <label class="muted">Fase</label>
        <input class="field-value" data-order-detail-task-index="${index}" data-order-detail-task-field="phase" value="${orderDetailEditEscape(row.phase)}" />
      </div>
      <div>
        <label class="muted">Assegnazione</label>
        <input class="field-value" data-order-detail-task-index="${index}" data-order-detail-task-field="team" value="${orderDetailEditEscape(row.team)}" />
      </div>
      <div>
        <label class="muted">Data consegna task</label>
        <input class="field-value" type="date" data-order-detail-task-index="${index}" data-order-detail-task-field="time" value="${orderDetailEditEscape(row.time)}" />
      </div>
      <div>
        <label class="muted">Ore lavoro</label>
        <input class="field-value" type="number" min="0" step="0.5" data-order-detail-task-index="${index}" data-order-detail-task-field="hours" value="${orderDetailEditEscape(row.hours)}" />
      </div>
      <div>
        <label class="muted">Stato</label>
        <select class="filter-chip" data-order-detail-task-index="${index}" data-order-detail-task-field="state">
          ${["Da avviare", "In corso", "Completato", "Da confermare", "Stand by"].map((state) => `<option value="${state}" ${row.state === state ? "selected" : ""}>${state}</option>`).join("")}
        </select>
      </div>
      <div><button class="mini-btn" data-order-detail-remove-task="${index}" type="button">Rimuovi</button></div>
    </div>
  `).join("");
}

function orderDetailEditMarkup() {
  const order = getSelectedOrder();
  const draft = orderDetailEditDraftFor(order);
  if (!order || !draft) return "";

  return `
    <div class="surface order-detail-edit-panel">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Modifica ordine</h3>
            <p>Quando riapri l'ordine puoi aggiornare dati, pagamenti, materiali, foto e task operativi.</p>
          </div>
          <button class="action-pill" data-order-detail-save type="button">Salva modifiche ordine</button>
        </div>

        <div class="form-grid">
          <div class="field"><label>Cliente / brand</label><input class="field-value" data-order-detail-field="client" value="${orderDetailEditEscape(draft.client)}" /></div>
          <div class="field"><label>Categoria</label><input class="field-value" data-order-detail-field="category" value="${orderDetailEditEscape(draft.category)}" /></div>
          <div class="field"><label>Reparto</label><input class="field-value" data-order-detail-field="department" value="${orderDetailEditEscape(draft.department)}" /></div>
          <div class="field"><label>Priorita'</label><select class="filter-chip" data-order-detail-field="priority"><option value="Standard" ${draft.priority !== "Express" ? "selected" : ""}>Standard</option><option value="Express" ${draft.priority === "Express" ? "selected" : ""}>Express</option></select></div>
          <div class="field"><label>Stato ordine</label><input class="field-value" data-order-detail-field="status" value="${orderDetailEditEscape(draft.status)}" /></div>
          <div class="field"><label>Data ordine</label><input class="field-value" type="date" data-order-detail-field="orderDate" value="${orderDetailEditEscape(draft.orderDate)}" /></div>
          <div class="field"><label>Data stimata</label><input class="field-value" type="date" data-order-detail-field="estimatedDelivery" value="${orderDetailEditEscape(draft.estimatedDelivery)}" /></div>
          <div class="field"><label>Consegna cliente</label><input class="field-value" type="date" data-order-detail-field="customerWindow" value="${orderDetailEditEscape(draft.customerWindow)}" /></div>
          <div class="field span-2"><label>Note ordine</label><textarea class="field-value" data-order-detail-field="notes" style="min-height:86px;">${orderDetailEditEscape(draft.notes)}</textarea></div>
        </div>

        <div class="order-detail-edit-section">
          <div class="section-title">
            <div><h3>Pagamenti ordine</h3><p>Aggiungi acconti multipli o saldo finale.</p></div>
            <button class="mini-btn" data-order-detail-add-payment type="button">+ Pagamento</button>
          </div>
          <div class="order-detail-edit-scroll">
            <table>
              <thead><tr><th>Tipo</th><th>Importo</th><th>Data</th><th>Nota</th><th></th></tr></thead>
              <tbody>${orderDetailEditPaymentRows(draft.payments)}</tbody>
            </table>
          </div>
        </div>

        <div class="order-detail-edit-section">
          <div class="section-title">
            <div><h3>Materiali ordine</h3><p>Puoi correggere i materiali riportati dal preventivo o aggiungerne altri.</p></div>
            <button class="mini-btn" data-order-detail-add-material type="button">+ Materiale</button>
          </div>
          <div class="order-detail-edit-scroll">
            <table>
              <thead><tr><th>Materiale</th><th>Quantita'</th><th>Origine</th><th>Stato</th><th>Magazzino</th><th>Nota</th><th></th></tr></thead>
              <tbody>${orderDetailEditMaterialRows(draft.materials)}</tbody>
            </table>
          </div>
        </div>

        <div class="order-detail-edit-section">
          <div class="section-title">
            <div><h3>Task ordine</h3><p>Le ore indicano quanto tempo serve a realizzare il task.</p></div>
            <button class="mini-btn" data-order-detail-add-task type="button">+ Task</button>
          </div>
          <div class="task-list">${orderDetailEditTaskRows(draft.tasks)}</div>
        </div>
      </div>
    </div>
  `;
}

function orderDetailEditMount() {
  if (appState.currentView !== "order-detail") return;
  const section = document.querySelector("section.view.active");
  if (!section || section.querySelector(".order-detail-edit-panel")) return;
  const metricBand = section.querySelector(".metric-band");
  if (metricBand) metricBand.insertAdjacentHTML("afterend", orderDetailEditMarkup());
}

function orderDetailEditCurrentDraft() {
  const order = getSelectedOrder();
  return orderDetailEditDraftFor(order);
}

function orderDetailEditHandleField(target) {
  const draft = orderDetailEditCurrentDraft();
  if (!draft) return false;

  if (target.matches("[data-order-detail-field]")) {
    draft[target.dataset.orderDetailField] = target.value;
    return true;
  }
  if (target.matches("[data-order-detail-payment-field]")) {
    const row = draft.payments[Number(target.dataset.orderDetailPaymentIndex)];
    if (row) row[target.dataset.orderDetailPaymentField] = target.value;
    return true;
  }
  if (target.matches("[data-order-detail-material-field]")) {
    const row = draft.materials[Number(target.dataset.orderDetailMaterialIndex)];
    if (row) row[target.dataset.orderDetailMaterialField] = target.value;
    return true;
  }
  if (target.matches("[data-order-detail-task-field]")) {
    const row = draft.tasks[Number(target.dataset.orderDetailTaskIndex)];
    if (row) row[target.dataset.orderDetailTaskField] = target.value;
    return true;
  }
  return false;
}

function orderDetailEditSave() {
  const order = getSelectedOrder();
  const draft = orderDetailEditDraftFor(order);
  if (!order || !draft) return;
  const orderId = Number(order.id);

  Object.assign(order, {
    client: draft.client || order.client,
    category: draft.category || order.category,
    department: draft.department || order.department,
    priority: draft.priority || order.priority,
    status: draft.status || order.status,
    payment: orderDetailEditFormatPayment(draft.payments),
    eta: draft.estimatedDelivery || order.eta,
    orderDate: draft.orderDate || order.orderDate,
    estimatedDelivery: draft.estimatedDelivery || order.estimatedDelivery,
    customerWindow: draft.customerWindow || order.customerWindow,
    notes: draft.notes || order.notes,
    summary: draft.notes || order.summary,
  });
  if (!appData.orderMaterials) appData.orderMaterials = {};
  if (!appData.orderTasks) appData.orderTasks = {};
  appData.orderMaterials[orderId] = draft.materials.map(orderDetailEditMaterialFromDraft);
  appData.orderTasks[orderId] = draft.tasks.map(orderDetailEditTaskFromDraft);
  orderDetailEditWriteStored(orderId, draft);
  setFlashMessage(`Modifiche ordine #${orderId} salvate nella scheda`);
}

function orderDetailEditHandleClick(target) {
  const draft = orderDetailEditCurrentDraft();
  if (!draft) return false;

  if (target.closest("[data-order-detail-add-payment]")) {
    draft.payments.push({ type: "Acconto", amount: "", date: "", note: "" });
    renderApp();
    return true;
  }
  const removePayment = target.closest("[data-order-detail-remove-payment]");
  if (removePayment) {
    if (draft.payments.length <= 1) draft.payments.splice(0, draft.payments.length, { type: "Acconto", amount: "", date: "", note: "" });
    else draft.payments.splice(Number(removePayment.dataset.orderDetailRemovePayment), 1);
    renderApp();
    return true;
  }
  if (target.closest("[data-order-detail-add-material]")) {
    draft.materials.push({ product_name: "", quantity_required: "1", source_type: "mms", delivery_status: "non_consegnato", warehouse_status_note: "", preorder_note: "" });
    renderApp();
    return true;
  }
  const removeMaterial = target.closest("[data-order-detail-remove-material]");
  if (removeMaterial) {
    if (draft.materials.length <= 1) draft.materials.splice(0, draft.materials.length, { product_name: "", quantity_required: "1", source_type: "mms", delivery_status: "non_consegnato", warehouse_status_note: "", preorder_note: "" });
    else draft.materials.splice(Number(removeMaterial.dataset.orderDetailRemoveMaterial), 1);
    renderApp();
    return true;
  }
  if (target.closest("[data-order-detail-add-task]")) {
    draft.tasks.push({ name: "", phase: "", team: "", hours: "", time: "", state: "Da avviare" });
    renderApp();
    return true;
  }
  const removeTask = target.closest("[data-order-detail-remove-task]");
  if (removeTask) {
    draft.tasks.splice(Number(removeTask.dataset.orderDetailRemoveTask), 1);
    renderApp();
    return true;
  }
  if (target.closest("[data-order-detail-save]")) {
    orderDetailEditSave();
    return true;
  }
  return false;
}

function orderDetailEditPhotoAttachment(photo, index) {
  const url = photo?.dataUrl || photo?.url || photo?.localUrl || "";
  if (!url) return null;
  return {
    name: photo.name || `Foto preventivo ${index + 1}`,
    size: photo.size || 0,
    sizeLabel: typeof formatAttachmentSize === "function" ? formatAttachmentSize(photo.size || 0) : "",
    type: photo.type || "image/jpeg",
    localUrl: url,
    url,
    persisted: false,
    fromQuote: true,
  };
}

function orderDetailEditQuoteForOrder(order) {
  const quoteId = order?.sourceQuoteId || appState.orderQuoteSourceByOrderId?.[Number(order?.id)] || appState.orderFromQuoteDraft?.quote?.id || appState.selectedQuoteId;
  if (quoteId && typeof quoteListFind === "function") {
    const quote = quoteListFind(quoteId);
    if (quote) return quote;
  }
  return appState.orderFromQuoteDraft?.quote || null;
}

function orderDetailEditAttachQuotePhotos(order, quote, fallbackAttachments = []) {
  if (!order || typeof ensureOrderAttachmentState !== "function") return;
  ensureOrderAttachmentState();
  const displayId = Number(order.id);
  const photos = Array.isArray(quote?.photos) ? quote.photos : [];
  const converted = photos.map(orderDetailEditPhotoAttachment).filter(Boolean);
  const fallback = (fallbackAttachments || []).filter((attachment) => attachment?.localUrl || attachment?.url);
  const candidates = converted.length ? converted : fallback;
  if (!candidates.length) return;

  const current = appState.orderAttachments[displayId] || [];
  const merged = [...current];
  candidates.forEach((attachment) => {
    const exists = merged.some((item) => (item.name || "") === (attachment.name || "") && (item.url || item.localUrl || "") === (attachment.url || attachment.localUrl || ""));
    if (!exists) merged.push(attachment);
  });
  appState.orderAttachments[displayId] = merged;
  appState.loadedOrderAttachmentIds[displayId] = true;
  order.files = Math.max(Number(order.files || 0), merged.length);
  if (quote?.id) appState.orderQuoteSourceByOrderId[displayId] = quote.id;
}

function orderDetailEditApplyQuotePhotos() {
  if (!appData?.orders) return;
  const order = getSelectedOrder?.();
  if (!order) return;
  if (appState.currentView !== "order-detail" && !order.sourceQuoteId) return;
  const quote = orderDetailEditQuoteForOrder(order);
  orderDetailEditAttachQuotePhotos(order, quote);
}

if (typeof upsertOrderPreviewFromQuote === "function") {
  const baseUpsertOrderPreviewFromQuoteDetailEdit = upsertOrderPreviewFromQuote;
  upsertOrderPreviewFromQuote = function upsertOrderPreviewFromQuoteWithPhotos(quote) {
    baseUpsertOrderPreviewFromQuoteDetailEdit(quote);
    const previewId = typeof orderQuotePreviewId === "function" ? orderQuotePreviewId(quote) : null;
    const order = appData.orders.find((item) => Number(item.id) === Number(previewId));
    orderDetailEditAttachQuotePhotos(order, quote);
  };
}

const baseSaveDraftOrderDetailEdit = saveDraftOrder;
saveDraftOrder = async function saveDraftOrderWithDetailEditBridge() {
  const quote = appState.orderFromQuoteDraft?.quote || null;
  const pendingAttachments = Array.isArray(appState.draftOrderAttachments) ? appState.draftOrderAttachments.map((item) => ({ ...item })) : [];
  await baseSaveDraftOrderDetailEdit();
  const order = getSelectedOrder?.();
  if (order && quote) {
    orderDetailEditAttachQuotePhotos(order, quote, pendingAttachments);
    renderApp();
  }
};

if (!window.__orderDetailEditHandlers) {
  window.__orderDetailEditHandlers = true;
  document.addEventListener("input", (event) => {
    if (orderDetailEditHandleField(event.target)) event.stopImmediatePropagation();
  }, true);
  document.addEventListener("change", (event) => {
    if (orderDetailEditHandleField(event.target)) event.stopImmediatePropagation();
  }, true);
  document.addEventListener("click", (event) => {
    if (orderDetailEditHandleClick(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

const baseRenderAppOrderDetailEdit = renderApp;
renderApp = function renderAppOrderDetailEdit() {
  orderDetailEditEnsureState();
  orderDetailEditEnsureStyles();
  orderDetailEditApplyStoredToOrders();
  orderDetailEditApplyQuotePhotos();
  baseRenderAppOrderDetailEdit();
  orderDetailEditMount();
};

orderDetailEditEnsureState();
if (document.getElementById("app")?.innerHTML) renderApp();
