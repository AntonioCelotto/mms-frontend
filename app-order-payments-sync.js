(function () {
  const paymentSavesInFlight = new Map();

  function snapshots() {
    if (!appState.orderPaymentSnapshots) appState.orderPaymentSnapshots = {};
    return appState.orderPaymentSnapshots;
  }

  function copyRows(rows) {
    return JSON.parse(JSON.stringify(rows));
  }

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
    const type = normalizeText(value).toLowerCase();
    return ["saldo", "scadenza"].includes(type) ? type : "acconto";
  }

  function normalizePaymentStatus(value, paymentDate) {
    const status = normalizeText(value).toLowerCase().replace(/\s+/g, "_");
    if (["pagato", "da_pagare", "scaduto", "autorizzato"].includes(status)) return status;
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
      Number(row.id) > 0 ||
      parsePaymentAmount(row.amount) !== null ||
      dates.paidDate ||
      dates.dueDate ||
      normalizeText(row.note || row.notes)
    );
  }

  function validatePaymentRows(rows) {
    (Array.isArray(rows) ? rows : []).filter(isMeaningfulPaymentRow).forEach((row, index) => {
      const amount = parsePaymentAmount(row.amount);
      if (normalizeText(row.amount) && (amount === null || amount < 0)) {
        throw new Error(`Pagamento ${index + 1}: importo non valido`);
      }
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
    const originalNotes = row.originalNotes ?? null;
    const originalText = normalizeText(originalNotes).replace(/^(Da ordine:|Da ordine da preventivo:|Da scheda ordine:)\s*/, "");
    return {
      id: Number(row.id) > 0 ? Number(row.id) : null,
      order_id: orderId,
      payment_type: normalizePaymentType(row.type || row.payment_type),
      amount: parsePaymentAmount(row.amount),
      due_date: dueDate || null,
      // Do not silently change a historical date/status inconsistency.
      paid_date: paidDate || null,
      status,
      notes: row.id && normalizeText(row.note || row.notes) === originalText
        ? originalNotes : autoPaymentNote(sourceLabel, row),
    };
  }

  async function refreshPaymentLinkedViews(order, invalidateDetail = true) {
    if (!appState || typeof appState !== "object") return;
    appState.paymentLoadedOrderDbId = null;
    appState.clientsLoaded = false;
    if (order?.id) appState.paymentOrderId = Number(order.id);
    if (invalidateDetail && appState.orderDetailPaymentsLoaded) {
      appState.orderDetailPaymentsLoaded[paymentOrderDbId(order)] = false;
    }
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
    if (paymentSavesInFlight.has(dbOrderId)) return paymentSavesInFlight.get(dbOrderId);
    validatePaymentRows(rows);
    const payments = copyRows((Array.isArray(rows) ? rows : []).filter(isMeaningfulPaymentRow)
      .map((row) => autoPaymentBody(dbOrderId, row, sourceLabel)));
    const save = Promise.resolve().then(async () => {
      try {
        let expected = snapshots()[dbOrderId];
        if (!Array.isArray(expected) && sourceLabel === "Da ordine da preventivo") {
          expected = await paymentRequest(`/rest/v1/payments?select=*&order_id=eq.${dbOrderId}&order=id.asc`);
          if (!Array.isArray(expected) || expected.some((row) => row.amount != null ||
              !normalizeText(row.notes).startsWith("Stato acconto iniziale:"))) {
            throw new Error("Sono già presenti pagamenti: riapri la scheda ordine prima di salvarli.");
          }
        }
        if (!Array.isArray(expected)) throw new Error("Attendi il caricamento dei pagamenti o riapri la scheda ordine.");
        const response = await fetch("/api/sync-order-payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: dbOrderId, expected: copyRows(expected), payments }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload.payments)) throw new Error(payload.error || "Pagamenti non salvati. Riapri la scheda per verificare.");
        snapshots()[dbOrderId] = copyRows(payload.payments);
        const draft = appState.orderDetailEdits?.[Number(order.id)];
        if (draft) draft.payments = payload.payments.map(dbPaymentToDraft);
        if (!appState.orderDetailPaymentsLoaded) appState.orderDetailPaymentsLoaded = {};
        appState.orderDetailPaymentsLoaded[dbOrderId] = true;
        await refreshPaymentLinkedViews(order, false);
      } finally {
        paymentSavesInFlight.delete(dbOrderId);
      }
    });
    paymentSavesInFlight.set(dbOrderId, save);
    return save;
  }

  function dbPaymentToDraft(payment) {
    return {
      id: payment.id,
      type: ({ saldo: "Saldo", acconto: "Acconto", scadenza: "Scadenza" })[payment.payment_type] || "Acconto",
      amount: payment.amount ?? "",
      status: payment.status || "da_pagare",
      dueDate: payment.due_date || "",
      paidDate: payment.paid_date || "",
      note: normalizeText(payment.notes).replace(/^(Da ordine:|Da ordine da preventivo:|Da scheda ordine:)\s*/, ""),
      originalNotes: payment.notes ?? null,
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
      if (!Array.isArray(rows)) throw new Error("Elenco pagamenti non valido");
      snapshots()[dbOrderId] = copyRows(rows);
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
        if (order && !Array.isArray(snapshots()[paymentOrderDbId(order)])) {
          throw new Error("Attendi il caricamento dei pagamenti o riapri la scheda ordine.");
        }
      } catch (error) {
        setFlashMessage(error.message);
        renderApp();
        return;
      }
      const result = baseOrderDetailEditSavePaymentsSync();
      if (order) {
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

  const baseNavigatePayments = typeof navigate === "function" ? navigate : null;
  if (baseNavigatePayments) {
    navigate = function navigateWithFreshOrderPayments(view, orderId) {
      if (view === "order-detail") {
        const order = (appData.orders || []).find((item) => Number(item.id) === Number(orderId || appState.selectedOrderId));
        const dbId = paymentOrderDbId(order);
        if (appState.orderDetailPaymentsLoaded) appState.orderDetailPaymentsLoaded[dbId] = false;
        delete snapshots()[dbId];
      }
      return baseNavigatePayments(view, orderId);
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
