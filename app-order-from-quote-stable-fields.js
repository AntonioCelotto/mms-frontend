function orderFromQuoteStableDraft() {
  return appState.orderFromQuoteDraft || null;
}

function orderFromQuoteStableSync() {
  if (typeof orderFromQuoteV2SyncDraft === "function") orderFromQuoteV2SyncDraft();
  else if (typeof orderFromQuoteSyncDraft === "function") orderFromQuoteSyncDraft();
}

function orderFromQuoteStablePaymentRows() {
  if (typeof orderFromQuoteV2PaymentRows === "function") return orderFromQuoteV2PaymentRows();
  const draft = orderFromQuoteStableDraft();
  if (!draft) return [];
  if (!Array.isArray(draft.payments)) draft.payments = [];
  return draft.payments;
}

function orderFromQuoteStableTaskPlan() {
  if (typeof orderFromQuoteV2EnsureTaskHours === "function") return orderFromQuoteV2EnsureTaskHours();
  if (typeof orderFlowPlan === "function") return orderFlowPlan();
  return [];
}

function orderFromQuoteStableHandleField(target) {
  const draft = orderFromQuoteStableDraft();
  if (!draft) return false;

  if (target.matches("[data-order-from-quote-field]")) {
    draft[target.dataset.orderFromQuoteField] = target.value;
    orderFromQuoteStableSync();
    return true;
  }

  if (target.matches("[data-order-from-quote-payment-field]")) {
    const row = orderFromQuoteStablePaymentRows()[Number(target.dataset.orderFromQuotePaymentIndex)];
    if (!row) return true;
    row[target.dataset.orderFromQuotePaymentField] = target.value;
    orderFromQuoteStableSync();
    return true;
  }

  if (target.matches("[data-order-from-quote-material-field]")) {
    const material = draft.materials?.[Number(target.dataset.orderFromQuoteMaterialIndex)];
    if (!material) return true;
    material[target.dataset.orderFromQuoteMaterialField] = target.value;
    orderFromQuoteStableSync();
    return true;
  }

  if (target.matches("[data-order-flow-plan-field]")) {
    const plan = orderFromQuoteStableTaskPlan();
    const item = plan[Number(target.dataset.orderFlowPlanIndex)];
    if (!item) return true;
    const field = target.dataset.orderFlowPlanField;
    item[field] = field === "enabled" ? target.checked : target.value;
    return true;
  }

  return false;
}

function orderFromQuoteStableHandleClick(target) {
  const draft = orderFromQuoteStableDraft();
  if (!draft) return false;

  const addPayment = target.closest("[data-order-from-quote-add-payment]");
  if (addPayment) {
    orderFromQuoteStablePaymentRows().push({ type: "Acconto", amount: "", date: "", note: "" });
    orderFromQuoteStableSync();
    renderApp();
    return true;
  }

  const removePayment = target.closest("[data-order-from-quote-remove-payment]");
  if (removePayment) {
    const rows = orderFromQuoteStablePaymentRows();
    if (rows.length <= 1) rows.splice(0, rows.length, { type: "Acconto", amount: "", date: "", note: "" });
    else rows.splice(Number(removePayment.dataset.orderFromQuoteRemovePayment), 1);
    orderFromQuoteStableSync();
    renderApp();
    return true;
  }

  const addMaterial = target.closest("[data-order-from-quote-add-material]");
  if (addMaterial) {
    if (!Array.isArray(draft.materials)) draft.materials = [];
    draft.materials.push({ ...EMPTY_MATERIAL_DRAFT, quantity_required: "1" });
    orderFromQuoteStableSync();
    renderApp();
    return true;
  }

  const removeMaterial = target.closest("[data-order-from-quote-remove-material]");
  if (removeMaterial) {
    if (!Array.isArray(draft.materials)) draft.materials = [];
    if (draft.materials.length <= 1) draft.materials = [{ ...EMPTY_MATERIAL_DRAFT, quantity_required: "1" }];
    else draft.materials.splice(Number(removeMaterial.dataset.orderFromQuoteRemoveMaterial), 1);
    orderFromQuoteStableSync();
    renderApp();
    return true;
  }

  return false;
}

if (!window.__orderFromQuoteStableFields) {
  window.__orderFromQuoteStableFields = true;
  document.addEventListener(
    "input",
    (event) => {
      if (orderFromQuoteStableHandleField(event.target)) event.stopImmediatePropagation();
    },
    true
  );
  document.addEventListener(
    "change",
    (event) => {
      if (orderFromQuoteStableHandleField(event.target)) event.stopImmediatePropagation();
    },
    true
  );
  document.addEventListener(
    "click",
    (event) => {
      if (orderFromQuoteStableHandleClick(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
}
