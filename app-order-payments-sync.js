(function () {
  const AUTO_NOTE_PREFIXES = ["Da ordine:", "Da ordine da preventivo:", "Da scheda ordine:"];

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
      cleaned = lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
    } else if (lastComma >= 0) {
      cleaned = cleaned.replace(",", ".");
    }
    const amount = Number(cleaned);
    return Number.isFinite(amount) ? amount : null;
  }

  function normalizePaymentType(value) {
    return normalizeText(value).toLowerCase().includes("saldo") ? "saldo" : "acconto";
  }

  function normalizePaymentStatus(value, paymentDate) {
    const status = normalizeText(value).toLowerCase().replace(/\s+/g, "_");
    if (status === "pagato" || status === "da_pagare") return status;
    return paymentDate ? "pagato" : "da_pagare";
  }

  function paymentDates(row) {
    const paidDate = normalizeText(row?.paid_date || row?.paidDate || row?.date);
    const dueDate = normalizeText(row?.due_date || row?.dueDate);
    return { paidDate, dueDate };
  }

  function isMeaningfulPaymentRow(row) {
    const dates = paymentDates(row);
    return !!row && (
      parsePaymentAmount(row.amount) !== null ||
      dates.paidDate ||
      dates.dueDate ||
      normalizeText(row.note || row.notes)
    );
  }

  function validatePaymentRows(rows) {
    (Array.isArray(rows) ? rows : []).filter(isMeaningfulPaymentRow).forEach((row, index) => {
      const { paidDate } = paymentDates(row);
      const status = normalizePaymentStatus(row.status, paidDate);
      if (status === "pagato" && !paidDate) {
        throw new Error(`Pagamento ${index + 1}: inserisci la Data pagamento per confermare Pagato / Saldato`);
      }
    });
  }

  function orderPaymentRowsFromQuoteDraft() {
    const draft = appState.orderFromQuoteDraft;
    return Array.isArray(draft?.payments) ? draft.payments.map((row) => ({ ...row })) : [];
  }

  function orderPaymentRowsFromDetailDraft(order) {
    if (typeof orderDetailEditDraftFor !== "function") return [];
    const draft = orderDetailEditDraftFor(order);
    return Array.isArray(draft?.payments) ? draft.payments.map((row) => ({ ...row })) : [];
  }

  function paymentOrderDbId(order) {
    if (typeof getPaymentOrderId === "function") return getPaymentOrderId(order);
    return Number(order?.db_id || order?.id || appState.selectedOrderId || 0);
  }

  function autoPaymentNote(sourceLabel, row) {
    const note = normalizeText(row.note || row.notes);
    return note ? `${sourceLabel}: ${note}` : `${sourceLabel}: registrato dall'ordine`;
  }

  function autoPaymentBody(orderId, row, sourceLabel) {
    const { paidDate, dueDate } = paymentDates(row);
    const status = normalizePaymentStatus(row.status, paidDate);
    return {
      order_id: orderId,
      payment_type: normalizePaymentType(row.type || row.payment_type),
      amount: parsePaymentAmount(row.amount),
      due_date: dueDate || null,
      paid_date: status === "pagato" ? paidDate : null,
      status,
      notes: autoPaymentNote(sourceLabel, row),
    };
  }

  function isAutoPayment(payment) {
    const notes = normalizeText(payment?.notes);
    return AUTO_NOTE_PREFIXES.some((prefix) => notes.startsWith(prefix));
  }

  async function fetchExistingAutoPayments(orderId) {
    if (typeof paymentRequest !== "function") return [];
    const rows = await paymentRequest(`/rest/v1/payments?select=id,notes&order_id=eq.${Number(orderId)}`);
    return (Array.isArray(rows) ? rows : []).filter(isAutoPayment);
  }

  async function deletePaymentRows(rows) {
    for (const row of rows) {
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
    if (typeof loadPaymentsForSelectedOrder === "function") jobs.push(loadPaymentsForSelectedOrder(true).catch(() => {}));
    if (typeof loadClientsRegistry === "function") jobs.push(loadClientsRegistry(true).catch(() => {}));
    if (typeof refreshBootstrap === "function") jobs.push(refreshBootstrap().catch(() => {}));
    await Promise.all(jobs);
  }

  async function syncOrderPaymentRows(order, rows, sourceLabel) {
    if (typeof paymentRequest !== "function") return;
    const dbOrderId = paymentOrderDbId(order);
    if (!dbOrderId) return;
    validatePaymentRows(rows);
    const meaningfulRows = (Array.isArray(rows) ? rows : []).filter(isMeaningfulPaymentRow);
    const previousRows = await fetchExistingAutoPayments(dbOrderId);
    const insertedRows = [];
    try {
      for (const row of meaningfulRows) {
        const created = await paymentRequest("/rest/v1/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify(autoPaymentBody(dbOrderId, row, sourceLabel)),
        });
        if (Array.isArray(created)) insertedRows.push(...created);
      }
    } catch (error) {
      await deletePaymentRows(insertedRows).catch(() => {});
      throw error;
    }
    await deletePaymentRows(previousRows);
    await refreshPaymentLinkedViews(order);
  }

  function dbPaymentToDraft(payment) {
    return {
      type: payment.payment_type === "saldo" ? "Saldo" : "Acconto",
      amount: payment.amount ?? "",
      status: payment.status || "da_pagare",
      dueDate: payment.due_date || "",
      paidDate: payment.paid_date || "",
      note: normalizeText(payment.notes).replace(/^(Da ordine:|Da ordine da preventivo:|Da scheda ordine:)\s*/, ""),
    };
  }

  async function loadOrderDetailPayments(order) {
    if (!order || appState.currentView !== "order-detail" || typeof paymentRequest !== "function") return;
    const displayId = Number(order.id);
    const dbOrderId = paymentOrderDbId(order);
    if (!displayId || !dbOrderId) return;
    if (!appState.orderDetailPaymentsLoaded) appState.orderDetailPaymentsLoaded = {};
    if (appState.orderDetailPaymentsLoaded[dbOrderId]) return;
    appState.orderDetailPaymentsLoaded[dbOrderId] = true;
    try {
      const rows = await paymentRequest(`/rest/v1/payments?select=*&order_id=eq.${dbOrderId}&order=created_at.asc,id.asc`);
      if (!appState.orderDetailEdits) appState.orderDetailEdits = {};
      const draft = typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
      if (draft) {
        draft.payments = (Array.isArray(rows) ? rows : []).map(dbPaymentToDraft);
        appState.orderDetailEdits[displayId] = draft;
        renderApp();
      }
    } catch (error) {
      appState.orderDetailPaymentsLoaded[dbOrderId] = false;
      console.warn("Pagamenti ordine non disponibili", error);
    }
  }

  const baseSaveDraftOrderPaymentsSync = typeof saveDraftOrder === "function" ? saveDraftOrder : null;
  if (baseSaveDraftOrderPaymentsSync) {
    saveDraftOrder = async function saveDraftOrderWithPaymentsSync() {
      const pendingPayments = orderPaymentRowsFromQuoteDraft();
      try {
        validatePaymentRows(pendingPayments);
      } catch (error) {
        setFlashMessage(error.message);
        renderApp();
        return;
      }
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

  const baseOrderDetailEditSavePaymentsSync = typeof orderDetailEditSave === "function" ? orderDetailEditSave : null;
  if (baseOrderDetailEditSavePaymentsSync) {
    orderDetailEditSave = function orderDetailEditSaveWithPaymentsSync() {
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const pendingPayments = orderPaymentRowsFromDetailDraft(order);
      try {
        validatePaymentRows(pendingPayments);
      } catch (error) {
        setFlashMessage(error.message);
        renderApp();
        return;
      }
      const result = baseOrderDetailEditSavePaymentsSync();
      if (order && pendingPayments.some(isMeaningfulPaymentRow)) {
        syncOrderPaymentRows(order, pendingPayments, "Da scheda ordine")
          .then(() => {
            appState.orderDetailPaymentsLoaded[paymentOrderDbId(order)] = false;
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

  const baseSavePaymentDraftLinkedClients = typeof savePaymentDraftForSelectedOrder === "function" ? savePaymentDraftForSelectedOrder : null;
  if (baseSavePaymentDraftLinkedClients) {
    savePaymentDraftForSelectedOrder = async function savePaymentDraftForSelectedOrderWithClientRefresh() {
      await baseSavePaymentDraftLinkedClients();
      const order = typeof getPaymentSelectedOrder === "function" ? getPaymentSelectedOrder() : null;
      await refreshPaymentLinkedViews(order);
      renderApp();
    };
  }

  const baseRenderAppPaymentLoading = renderApp;
  renderApp = function renderAppWithOrderPaymentLoading() {
    baseRenderAppPaymentLoading();
    const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
    void loadOrderDetailPayments(order);
  };
})();
