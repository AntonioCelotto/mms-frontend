(function () {
  function numberValue(value) {
    const parsed = Number(String(value ?? "0").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function roundMoney(value) {
    return Math.round((numberValue(value) + Number.EPSILON) * 100) / 100;
  }

  function money(value) {
    return typeof quoteMoney === "function"
      ? quoteMoney(value)
      : `${roundMoney(value).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
  }

  function normalizeType(value) {
    return ["percentage", "fixed"].includes(value) ? value : "none";
  }

  function calculateDiscount(subtotal, type, value) {
    const normalizedType = normalizeType(type);
    let normalizedValue = Math.max(0, roundMoney(value));
    let amount = 0;
    if (normalizedType === "percentage") {
      normalizedValue = Math.min(100, normalizedValue);
      amount = roundMoney((subtotal * normalizedValue) / 100);
    } else if (normalizedType === "fixed") {
      amount = Math.min(subtotal, normalizedValue);
    } else {
      normalizedValue = 0;
    }
    return { type: normalizedType, value: normalizedValue, amount };
  }

  function ensureQuoteDiscount() {
    if (!appState.quoteDiscountDraft || typeof appState.quoteDiscountDraft !== "object") {
      appState.quoteDiscountDraft = { type: "none", value: "" };
    }
    appState.quoteDiscountDraft.type = normalizeType(appState.quoteDiscountDraft.type);
    if (appState.quoteDiscountDraft.type === "none") appState.quoteDiscountDraft.value = "";
    return appState.quoteDiscountDraft;
  }

  function quoteFinancials() {
    const subtotal = roundMoney(
      (appState.quoteArticles || []).reduce(
        (sum, article) => sum + (typeof quoteArticleTotal === "function" ? quoteArticleTotal(article) : 0),
        0
      )
    );
    const draft = ensureQuoteDiscount();
    const discount = calculateDiscount(subtotal, draft.type, draft.value);
    const taxableAmount = roundMoney(subtotal - discount.amount);
    const vatRate = 22;
    const vatAmount = roundMoney((taxableAmount * vatRate) / 100);
    return {
      subtotal,
      discountType: discount.type,
      discountValue: discount.value,
      discountAmount: discount.amount,
      taxableAmount,
      vatRate,
      vatAmount,
      total: roundMoney(taxableAmount + vatAmount),
    };
  }

  if (typeof quoteGrandTotal === "function") {
    quoteGrandTotal = function quoteGrandTotalWithDiscount() {
      return quoteFinancials().total;
    };
  }

  if (typeof quoteListSnapshot === "function") {
    const baseQuoteListSnapshotDiscount = quoteListSnapshot;
    quoteListSnapshot = function quoteListSnapshotWithDiscount() {
      return { ...baseQuoteListSnapshotDiscount(), ...quoteFinancials() };
    };
  }

  function discountFields(prefix, values, summary, includeVat) {
    const type = normalizeType(values.type);
    return `
      <div class="field">
        <label>Tipo sconto</label>
        <select class="filter-chip" data-${prefix}-discount-field="type">
          <option value="none" ${type === "none" ? "selected" : ""}>Nessuno</option>
          <option value="percentage" ${type === "percentage" ? "selected" : ""}>Percentuale</option>
          <option value="fixed" ${type === "fixed" ? "selected" : ""}>Importo fisso</option>
        </select>
      </div>
      <div class="field">
        <label>Valore sconto ${type === "percentage" ? "%" : "EUR"}</label>
        <input class="field-value" type="text" inputmode="decimal" autocomplete="off"
          data-${prefix}-discount-field="value" value="${type === "none" ? "" : values.value}" placeholder="0,00" />
      </div>
      <div class="field span-2 ${prefix}-discount-summary">
        <div class="pill-row">
          <span class="ghost-pill">Subtotale: ${money(summary.subtotal)}</span>
          <span class="ghost-pill">Sconto: - ${money(summary.discountAmount)}</span>
          ${includeVat ? `<span class="ghost-pill">IVA 22%: ${money(summary.vatAmount)}</span>` : ""}
          <strong class="ghost-pill">Totale: ${money(summary.total)}</strong>
        </div>
      </div>
    `;
  }

  let loadedQuoteDiscountId = "";

  function syncQuoteDiscountContext() {
    const editingId = String(appState.editingQuoteId || "").trim();
    if (editingId && editingId !== loadedQuoteDiscountId) {
      const quote = typeof quoteListFind === "function" ? quoteListFind(editingId) : null;
      appState.quoteDiscountDraft = {
        type: normalizeType(quote?.discountType || quote?.discount_type),
        value: numberValue(quote?.discountValue ?? quote?.discount_value) || "",
      };
      loadedQuoteDiscountId = editingId;
    } else if (!editingId && loadedQuoteDiscountId) {
      appState.quoteDiscountDraft = { type: "none", value: "" };
      loadedQuoteDiscountId = "";
    }
  }

  function mountQuoteDiscount() {
    if (appState.currentView !== "new-order") return;
    syncQuoteDiscountContext();
    ensureQuoteDiscount();
    document.querySelectorAll(".quote-article .section-title h3").forEach((title) => {
      if (/^Articolo\s+\d+$/i.test(title.textContent.trim())) title.textContent = "Articolo";
    });
    const view = document.querySelector("section.view.active");
    if (!view || view.querySelector("[data-quote-discount-field]")) return;
    const dataTitle = Array.from(view.querySelectorAll(".section-title h3")).find((node) => node.textContent.trim() === "Dati preventivo");
    const form = dataTitle?.closest(".surface-inner")?.querySelector(".form-grid");
    const notes = form?.querySelector("textarea[data-draft='note']")?.closest(".field");
    if (!form || !notes) return;
    const financials = quoteFinancials();
    notes.insertAdjacentHTML(
      "beforebegin",
      discountFields("quote", ensureQuoteDiscount(), financials, true)
    );
    const topTotal = Array.from(view.querySelectorAll(".screen-actions .ghost-pill")).find((node) => node.textContent.trim().startsWith("Totale:"));
    if (topTotal) topTotal.textContent = `Totale: ${money(financials.total)}`;
  }

  function quoteFromEditButton(button) {
    const id = button?.dataset?.quoteEdit;
    return id && typeof quoteListFind === "function" ? quoteListFind(id) : null;
  }

  function orderFinancials(draft) {
    const subtotal = Math.max(0, roundMoney(draft?.subtotal ?? draft?.quote?.subtotal ?? 0));
    const discount = calculateDiscount(subtotal, draft?.discountType, draft?.discountValue);
    return {
      subtotal,
      discountType: discount.type,
      discountValue: discount.value,
      discountAmount: discount.amount,
      total: roundMoney(subtotal - discount.amount),
    };
  }

  function syncOrderFinancials() {
    const draft = appState.orderFromQuoteDraft;
    if (!draft) return;
    const financials = orderFinancials(draft);
    Object.assign(draft, financials);
    appState.draftOrder = {
      ...(appState.draftOrder || {}),
      sourceQuoteNumber: draft.quote?.id || "",
      subtotal: financials.subtotal,
      discountType: financials.discountType,
      discountValue: financials.discountValue,
      discountAmount: financials.discountAmount,
      total: financials.total,
    };
    const rows = Array.isArray(draft.payments) ? draft.payments : [];
    if (rows.length === 1 && String(rows[0].type || "").toLowerCase() === "saldo") {
      rows[0].amount = money(financials.total);
    }
  }

  if (typeof quoteListConvertToOrder === "function") {
    const baseConvertToOrderDiscount = quoteListConvertToOrder;
    quoteListConvertToOrder = async function quoteListConvertToOrderWithDiscount(quoteId) {
      await baseConvertToOrderDiscount(quoteId);
      const draft = appState.orderFromQuoteDraft;
      const quote = draft?.quote;
      if (draft && quote) {
        draft.subtotal = numberValue(quote.subtotal);
        draft.discountType = normalizeType(quote.discountType || quote.discount_type);
        draft.discountValue = numberValue(quote.discountValue ?? quote.discount_value);
        syncOrderFinancials();
        renderApp();
      }
    };
  }

  function mountOrderCreateDiscount() {
    if (appState.currentView !== "order-create") return;
    const draft = appState.orderFromQuoteDraft;
    const view = document.querySelector("section.view.active");
    if (!draft || !view || view.querySelector("[data-order-discount-field]")) return;
    if (draft.subtotal == null) draft.subtotal = numberValue(draft.quote?.subtotal);
    if (!draft.discountType) draft.discountType = normalizeType(draft.quote?.discountType || draft.quote?.discount_type);
    if (draft.discountValue == null) draft.discountValue = numberValue(draft.quote?.discountValue ?? draft.quote?.discount_value);
    syncOrderFinancials();
    const dataTitle = Array.from(view.querySelectorAll(".section-title h3")).find((node) => node.textContent.trim() === "Dati ordine");
    const form = dataTitle?.closest(".surface-inner")?.querySelector(".form-grid");
    const notes = form?.querySelector("textarea[data-order-from-quote-field='note']")?.closest(".field");
    if (!form || !notes) return;
    const financials = orderFinancials(draft);
    notes.insertAdjacentHTML(
      "beforebegin",
      discountFields("order", { type: draft.discountType, value: draft.discountValue }, financials, false)
    );
    const topTotal = Array.from(view.querySelectorAll(".screen-actions .ghost-pill")).find((node) => node.textContent.trim().startsWith("Totale:"));
    if (topTotal) topTotal.textContent = `Totale ordine: ${money(financials.total)}`;
  }

  if (typeof orderDetailEditDraftFor === "function") {
    const baseOrderDetailDraftDiscount = orderDetailEditDraftFor;
    orderDetailEditDraftFor = function orderDetailEditDraftWithDiscount(order) {
      const draft = baseOrderDetailDraftDiscount(order);
      if (!draft || !order) return draft;
      if (draft.subtotal == null) draft.subtotal = numberValue(order.subtotal);
      if (!draft.discountType) draft.discountType = normalizeType(order.discountType || order.discount_type);
      if (draft.discountValue == null) draft.discountValue = numberValue(order.discountValue ?? order.discount_value);
      Object.assign(draft, orderFinancials(draft));
      return draft;
    };
  }

  function mountOrderDetailDiscount() {
    if (appState.currentView !== "order-detail") return;
    const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
    const draft = order && typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
    const panel = document.querySelector(".order-detail-edit-panel");
    const form = panel?.querySelector(".form-grid");
    const notes = form?.querySelector("textarea[data-order-detail-field='notes']")?.closest(".field");
    if (!draft || !form || !notes || panel.querySelector("[data-order-edit-discount-field]")) return;
    const financials = orderFinancials(draft);
    notes.insertAdjacentHTML(
      "beforebegin",
      discountFields("order-edit", { type: draft.discountType, value: draft.discountValue }, financials, false)
    );
  }

  if (typeof orderDetailEditSave === "function") {
    const baseOrderDetailSaveDiscount = orderDetailEditSave;
    orderDetailEditSave = async function orderDetailEditSaveWithDiscount() {
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const draft = order && typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
      baseOrderDetailSaveDiscount();
      if (!order || !draft) return;
      const financials = orderFinancials(draft);
      Object.assign(order, financials);
      try {
        const response = await fetch("/api/update-order-financials", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: order.db_id || order.id, ...financials }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || payload.error || "Sconto ordine non salvato");
        setFlashMessage(`Ordine #${order.id} salvato con sconto aggiornato`);
      } catch (error) {
        setFlashMessage(error.message || "Sconto ordine non salvato nel database");
      }
      renderApp();
    };
  }

  document.addEventListener("click", (event) => {
    const editButton = event.target.closest?.("[data-quote-edit]");
    if (editButton) {
      const quote = quoteFromEditButton(editButton);
      appState.quoteDiscountDraft = {
        type: normalizeType(quote?.discountType || quote?.discount_type),
        value: numberValue(quote?.discountValue ?? quote?.discount_value) || "",
      };
      return;
    }
    const newQuote = event.target.closest?.("[data-open='new-order'], [data-nav='new-order']");
    if (newQuote) appState.quoteDiscountDraft = { type: "none", value: "" };
  }, true);

  document.addEventListener("input", (event) => {
    const quoteField = event.target.dataset?.quoteDiscountField;
    if (quoteField) {
      const draft = ensureQuoteDiscount();
      draft[quoteField] = event.target.value;
      if (quoteField === "value" && draft.type === "none" && String(event.target.value).trim()) {
        draft.type = "fixed";
        const typeField = document.querySelector("[data-quote-discount-field='type']");
        if (typeField) typeField.value = "fixed";
      }
      return;
    }
    const orderField = event.target.dataset?.orderDiscountField;
    if (orderField && appState.orderFromQuoteDraft) {
      const draft = appState.orderFromQuoteDraft;
      draft[orderField === "type" ? "discountType" : "discountValue"] = event.target.value;
      if (orderField === "value" && normalizeType(draft.discountType) === "none" && String(event.target.value).trim()) {
        draft.discountType = "fixed";
        const typeField = document.querySelector("[data-order-discount-field='type']");
        if (typeField) typeField.value = "fixed";
      }
      syncOrderFinancials();
      return;
    }
    const editField = event.target.dataset?.orderEditDiscountField;
    if (editField) {
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const draft = order && typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
      if (draft) {
        draft[editField === "type" ? "discountType" : "discountValue"] = event.target.value;
        if (editField === "value" && normalizeType(draft.discountType) === "none" && String(event.target.value).trim()) {
          draft.discountType = "fixed";
          const typeField = document.querySelector("[data-order-edit-discount-field='type']");
          if (typeField) typeField.value = "fixed";
        }
      }
    }
  }, true);

  document.addEventListener("change", (event) => {
    if (
      event.target.matches?.("[data-quote-discount-field], [data-order-discount-field], [data-order-edit-discount-field]")
    ) {
      if (event.target.dataset.quoteDiscountField === "type" && event.target.value === "none") {
        ensureQuoteDiscount().value = "";
      }
      if (event.target.dataset.orderDiscountField === "type" && event.target.value === "none" && appState.orderFromQuoteDraft) {
        appState.orderFromQuoteDraft.discountValue = 0;
        syncOrderFinancials();
      }
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const editDraft = order && typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
      if (event.target.dataset.orderEditDiscountField === "type" && event.target.value === "none" && editDraft) {
        editDraft.discountValue = 0;
      }
      renderApp();
    }
  }, true);

  const baseRenderAppDiscount = renderApp;
  renderApp = function renderAppWithDiscounts() {
    baseRenderAppDiscount();
    mountQuoteDiscount();
    mountOrderCreateDiscount();
    mountOrderDetailDiscount();
  };

  ensureQuoteDiscount();
  if (document.getElementById("app")?.innerHTML) renderApp();
})();