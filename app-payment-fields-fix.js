(function () {
  function text(value) {
    return String(value ?? "").trim();
  }

  function esc(value) {
    const raw = String(value ?? "");
    if (typeof orderDetailEditEscape === "function") return orderDetailEditEscape(raw);
    return raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeStatus(value, paidDate) {
    const status = text(value).toLowerCase().replace(/\s+/g, "_");
    if (status === "pagato" || status === "da_pagare") return status;
    return paidDate ? "pagato" : "da_pagare";
  }

  function normalizeRow(row) {
    const legacyDate = text(row?.date);
    const paidDate = text(row?.paidDate || row?.paid_date || legacyDate);
    return {
      ...row,
      type: text(row?.type || row?.payment_type) || "Acconto",
      amount: row?.amount ?? "",
      status: normalizeStatus(row?.status, paidDate),
      dueDate: text(row?.dueDate || row?.due_date),
      paidDate,
      note: text(row?.note || row?.notes),
    };
  }

  function normalizeRows(rows) {
    return (Array.isArray(rows) ? rows : []).map(normalizeRow);
  }

  if (typeof orderFromQuoteV2PaymentRows === "function") {
    const baseOrderPaymentRows = orderFromQuoteV2PaymentRows;
    orderFromQuoteV2PaymentRows = function paymentRowsWithAccountingFields() {
      const rows = baseOrderPaymentRows();
      const normalized = normalizeRows(rows);
      const draft = appState.orderFromQuoteDraft;
      if (draft) draft.payments = normalized;
      return normalized;
    };
  }

  renderOrderFromQuoteV2PaymentPanel = function renderPaymentPanelWithAccountingFields() {
    const rows = orderFromQuoteV2PaymentRows();
    return `
      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Pagamenti ordine</h3>
              <p>Indica separatamente stato, scadenza e data dell'incasso.</p>
            </div>
            <button class="mini-btn" data-order-from-quote-add-payment type="button">+ Pagamento</button>
          </div>
          <div class="alert-list">
            ${rows.map((row, index) => `
              <div class="alert-item">
                <div class="section-title" style="margin-bottom:10px;">
                  <div><strong>Pagamento ${index + 1}</strong><span>${esc(row.type || "Acconto")}</span></div>
                  <button class="mini-btn" data-order-from-quote-remove-payment="${index}" type="button">Rimuovi</button>
                </div>
                <div class="form-grid">
                  <div class="field"><label>Tipo</label><select class="filter-chip" data-order-from-quote-payment-index="${index}" data-order-from-quote-payment-field="type">${["Acconto", "Saldo"].map((type) => `<option value="${type}" ${row.type === type ? "selected" : ""}>${type}</option>`).join("")}</select></div>
                  <div class="field"><label>Importo</label><input class="field-value" inputmode="decimal" data-order-from-quote-payment-index="${index}" data-order-from-quote-payment-field="amount" value="${esc(row.amount)}" placeholder="0,00" /></div>
                  <div class="field"><label>Stato</label><select class="filter-chip" data-order-from-quote-payment-index="${index}" data-order-from-quote-payment-field="status"><option value="da_pagare" ${row.status !== "pagato" ? "selected" : ""}>Da pagare</option><option value="pagato" ${row.status === "pagato" ? "selected" : ""}>Pagato / Saldato</option></select></div>
                  <div class="field"><label>Scadenza</label><input class="field-value" type="date" data-order-from-quote-payment-index="${index}" data-order-from-quote-payment-field="dueDate" value="${esc(row.dueDate)}" /></div>
                  <div class="field"><label>Data pagamento</label><input class="field-value" type="date" data-order-from-quote-payment-index="${index}" data-order-from-quote-payment-field="paidDate" value="${esc(row.paidDate)}" /></div>
                  <div class="field"><label>Nota</label><input class="field-value" data-order-from-quote-payment-index="${index}" data-order-from-quote-payment-field="note" value="${esc(row.note)}" placeholder="es. bonifico, contanti" /></div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;
  };

  if (typeof orderDetailEditDraftFor === "function") {
    const baseOrderDetailDraft = orderDetailEditDraftFor;
    orderDetailEditDraftFor = function orderDetailDraftWithAccountingFields(order) {
      const draft = baseOrderDetailDraft(order);
      if (draft) draft.payments = normalizeRows(draft.payments);
      return draft;
    };
  }

  if (typeof orderDetailEditPaymentRows === "function") {
    orderDetailEditPaymentRows = function paymentDetailRowsWithAccountingFields(rows) {
      return normalizeRows(rows).map((row, index) => `
        <tr>
          <td><select class="filter-chip" data-order-detail-payment-index="${index}" data-order-detail-payment-field="type">${["Acconto", "Saldo"].map((type) => `<option value="${type}" ${row.type === type ? "selected" : ""}>${type}</option>`).join("")}</select></td>
          <td><input class="field-value" inputmode="decimal" data-order-detail-payment-index="${index}" data-order-detail-payment-field="amount" value="${esc(row.amount)}" placeholder="0,00" /></td>
          <td><select class="filter-chip" data-order-detail-payment-index="${index}" data-order-detail-payment-field="status"><option value="da_pagare" ${row.status !== "pagato" ? "selected" : ""}>Da pagare</option><option value="pagato" ${row.status === "pagato" ? "selected" : ""}>Pagato / Saldato</option></select></td>
          <td><input class="field-value" type="date" data-order-detail-payment-index="${index}" data-order-detail-payment-field="dueDate" value="${esc(row.dueDate)}" /></td>
          <td><input class="field-value" type="date" data-order-detail-payment-index="${index}" data-order-detail-payment-field="paidDate" value="${esc(row.paidDate)}" /></td>
          <td><input class="field-value" data-order-detail-payment-index="${index}" data-order-detail-payment-field="note" value="${esc(row.note)}" placeholder="nota pagamento" /></td>
          <td><button class="mini-btn" data-order-detail-remove-payment="${index}" type="button">Rimuovi</button></td>
        </tr>
      `).join("");
    };
  }

  if (typeof orderDetailEditMarkup === "function") {
    const baseOrderDetailMarkup = orderDetailEditMarkup;
    orderDetailEditMarkup = function orderDetailMarkupWithAccountingHeaders() {
      return baseOrderDetailMarkup().replace(
        "<thead><tr><th>Tipo</th><th>Importo</th><th>Data</th><th>Nota</th><th></th></tr></thead>",
        "<thead><tr><th>Tipo</th><th>Importo</th><th>Stato</th><th>Scadenza</th><th>Data pagamento</th><th>Nota</th><th></th></tr></thead>"
      );
    };
  }

  if (typeof orderDetailEditFormatPayment === "function") {
    orderDetailEditFormatPayment = function formatAccountingPayment(rows) {
      const summary = normalizeRows(rows)
        .filter((row) => text(row.amount) || row.dueDate || row.paidDate || row.note)
        .map((row) => {
          const state = row.status === "pagato" ? "Pagato" : "Da pagare";
          const date = row.status === "pagato" ? row.paidDate : row.dueDate;
          return `${row.type || "Pagamento"} ${row.amount || ""} - ${state}${date ? ` (${date})` : ""}`.trim();
        })
        .join(" - ");
      return summary || "Da definire";
    };
  }

  if (!window.__mmsPaymentAccountingFieldEvents) {
    window.__mmsPaymentAccountingFieldEvents = true;
    document.addEventListener("change", (event) => {
      const target = event.target;
      const quoteField = target?.dataset?.orderFromQuotePaymentField;
      const detailField = target?.dataset?.orderDetailPaymentField;
      if (quoteField !== "status" && quoteField !== "paidDate" && detailField !== "status" && detailField !== "paidDate") return;

      const quoteIndex = Number(target.dataset.orderFromQuotePaymentIndex);
      const detailIndex = Number(target.dataset.orderDetailPaymentIndex);
      const row = quoteField
        ? orderFromQuoteV2PaymentRows()[quoteIndex]
        : orderDetailEditDraftFor(getSelectedOrder())?.payments?.[detailIndex];
      if (!row) return;
      if ((quoteField || detailField) === "paidDate" && text(target.value)) row.status = "pagato";
      if ((quoteField || detailField) === "status" && target.value === "da_pagare") row.paidDate = "";
      renderApp();
    });
  }

  if (document.getElementById("app")?.innerHTML) renderApp();
})();
