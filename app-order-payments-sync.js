(function () {
  const AUTO_NOTE_PREFIXES = [
    "Da ordine:",
    "Da ordine da preventivo:",
    "Da scheda ordine:",
  ];

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function parsePaymentAmount(value) {
    const raw = normalizeText(value);
    if (!raw) return null;
    let cleaned = raw.replace(/[^\d,.-]/g, "");
    if (!cleaned) return null;
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma >= 0 && lastDot >= 0) {
      cleaned = lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
    } else if (lastComma >= 0) {
      cleaned = cleaned.replace(",", ".");
    }
    const amount = Number(cleaned);
    return Number.isFinite(amount) ? amount : null;
  }

  function normalizePaymentType(value) {
    return normalizeText(value).toLowerCase().includes("saldo") ? "saldo" : "acconto";
  }

  function isMeaningfulPaymentRow(row) {
    return !!row && (
      parsePaymentAmount(row.amount) !== null ||
      normalizeText(row.date) ||
      normalizeText(row.note)
    );
  }

  function orderPaymentRowsFromQuoteDraft() {
    const draft = appState.orderFromQuoteDraft;
    if (!draft) return [];
    const rows = Array.isArray(draft.payments) ? draft.payments : [];
    return rows.map((row) => ({ ...row }));
  }

  function orderPaymentRowsFromDetailDraft(order) {
    if (typeof orderDetailEditDraftFor !== "function") return [];
    const draft = orderDetailEditDraftFor(order);
    const rows = Array.isArray(draft?.payments) ? draft.payments : [];
    return rows.map((row) => ({ ...row }));
  }

  function paymentOrderDbId(order) {
    if (typeof getPaymentOrderId === "function") return getPaymentOrderId(order);
    return Number(order?.db_id || order?.id || appState.selectedOrderId || 0);
  }

  function autoPaymentNote(sourceLabel, row) {
    const note = normalizeText(row.note);
    return note ? `${sourceLabel}: ${note}` : `${sourceLabel}: registrato dall'ordine`;
  }

  function autoPaymentBody(orderId, row, sourceLabel) {
    const date = normalizeText(row.date);
    const paid = normalizeText(row.paid_date);
    const status = normalizeText(row.status);
    return {
      order_id: orderId,
      payment_type: normalizePaymentType(row.type || row.payment_type),
      amount: parsePaymentAmount(row.amount),
      due_date: date || null,
      paid_date: paid || null,
      status: status || (paid ? "pagato" : "da_pagare"),
      notes: autoPaymentNote(sourceLabel, row),
    };
  }

  function isAutoPayment(payment) {
    const notes = normalizeText(payment?.notes);
    return AUTO_NOTE_PREFIXES.some((prefix) => notes.startsWith(prefix));
  }

  async function deleteExistingAutoPayments(orderId) {
    if (typeof paymentRequest !== "function") return;
    const rows = await paymentRequest(
      `/rest/v1/payments?select=id,notes&order_id=eq.${Number(orderId)}`
    );
    const automaticRows = (Array.isArray(rows) ? rows : []).filter(isAutoPayment);
    for (const row of automaticRows) {
      if (!row?.id) continue;
      await paymentRequest(`/rest/v1/payments?id=eq.${Number(row.id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
    }
  }

  async function refreshPaymentLinkedViews(order) {
    if (!appState || typeof appState !== "object") return;
    appState.paymentLoadedOrderDbId = null;
    appState.clientsLoaded = false;
    if (order?.id) appState.paymentOrderId = Number(order.id);
    const jobs = [];
    if (typeof loadPaymentsForSelectedOrder === "function") {
      jobs.push(loadPaymentsForSelectedOrder(true).catch(() => {}));
    }
    if (typeof loadClientsRegistry === "function") {
      jobs.push(loadClientsRegistry(true).catch(() => {}));
    }
    if (typeof refreshBootstrap === "function") {
      jobs.push(refreshBootstrap().catch(() => {}));
    }
    await Promise.all(jobs);
  }

  async function syncOrderPaymentRows(order, rows, sourceLabel) {
    if (typeof paymentRequest !== "function") return;
    const dbOrderId = paymentOrderDbId(order);
    if (!dbOrderId) return;
    const meaningfulRows = (Array.isArray(rows) ? rows : []).filter(isMeaningfulPaymentRow);
    await deleteExistingAutoPayments(dbOrderId);
    for (const row of meaningfulRows) {
      await paymentRequest("/rest/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(autoPaymentBody(dbOrderId, row, sourceLabel)),
      });
    }
    await refreshPaymentLinkedViews(order);
  }

  const baseSaveDraftOrderPaymentsSync = typeof saveDraftOrder === "function" ? saveDraftOrder : null;
  if (baseSaveDraftOrderPaymentsSync) {
    saveDraftOrder = async function saveDraftOrderWithPaymentsSync() {
      const pendingPayments = orderPaymentRowsFromQuoteDraft();
      await baseSaveDraftOrderPaymentsSync();
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      if (!pendingPayments.some(isMeaningfulPaymentRow) || !order) return;
      try {
        await syncOrderPaymentRows(order, pendingPayments, "Da ordine da preventivo");
        setFlashMessage(`Ordine #${order.id} salvato con pagamenti collegati`);
        renderApp();
      } catch (error) {
        setFlashMessage(`Ordine salvato, ma collegamento pagamenti non riuscito: ${error.message}`);
        renderApp();
      }
    };
  }

  const baseOrderDetailEditSavePaymentsSync =
    typeof orderDetailEditSave === "function" ? orderDetailEditSave : null;
  if (baseOrderDetailEditSavePaymentsSync) {
    orderDetailEditSave = function orderDetailEditSaveWithPaymentsSync() {
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const pendingPayments = orderPaymentRowsFromDetailDraft(order);
      const result = baseOrderDetailEditSavePaymentsSync();
      if (order && pendingPayments.some(isMeaningfulPaymentRow)) {
        syncOrderPaymentRows(order, pendingPayments, "Da scheda ordine")
          .then(() => {
            setFlashMessage(`Modifiche ordine #${order.id} e pagamenti collegati`);
            renderApp();
          })
          .catch((error) => {
            setFlashMessage(`Ordine salvato, ma collegamento pagamenti non riuscito: ${error.message}`);
            renderApp();
          });
      }
      return result;
    };
  }

  const baseSavePaymentDraftLinkedClients =
    typeof savePaymentDraftForSelectedOrder === "function" ? savePaymentDraftForSelectedOrder : null;
  if (baseSavePaymentDraftLinkedClients) {
    savePaymentDraftForSelectedOrder = async function savePaymentDraftForSelectedOrderWithClientRefresh() {
      await baseSavePaymentDraftLinkedClients();
      const order = typeof getPaymentSelectedOrder === "function" ? getPaymentSelectedOrder() : null;
      await refreshPaymentLinkedViews(order);
      renderApp();
    };
  }
})();