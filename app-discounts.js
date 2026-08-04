(function () {
  const DISCOUNT_NONE = "none";
  const DISCOUNT_PERCENTAGE = "percentage";
  const DISCOUNT_FIXED = "fixed";
  const DEFAULT_QUOTE_VAT_RATE = 22;

  function discountNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const normalized = String(value ?? "")
      .replace(/\s/g, "")
      .replace(/€/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function discountRound(value) {
    return Math.round((discountNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function normalizeDiscountType(value) {
    const type = String(value || "").toLowerCase();
    return [DISCOUNT_PERCENTAGE, DISCOUNT_FIXED].includes(type) ? type : DISCOUNT_NONE;
  }

  function calculateDiscount(subtotalValue, typeValue, valueInput) {
    const subtotal = Math.max(0, discountRound(subtotalValue));
    const type = normalizeDiscountType(typeValue);
    let value = Math.max(0, discountRound(valueInput));
    let amount = 0;

    if (type === DISCOUNT_PERCENTAGE) {
      value = Math.min(value, 100);
      amount = discountRound((subtotal * value) / 100);
    } else if (type === DISCOUNT_FIXED) {
      amount = Math.min(value, subtotal);
    } else {
      value = 0;
    }

    return { subtotal, type, value, amount, total: discountRound(subtotal - amount) };
  }

  function quoteVatRate(value, fallback = DEFAULT_QUOTE_VAT_RATE) {
    if (value === null || value === undefined || value === "") return fallback;
    return Math.min(100, Math.max(0, discountRound(value)));
  }

  function calculateQuoteTotals(subtotalValue, typeValue, discountValue, vatRateValue = DEFAULT_QUOTE_VAT_RATE) {
    const discount = calculateDiscount(subtotalValue, typeValue, discountValue);
    const vatRate = quoteVatRate(vatRateValue);
    const taxable = discount.total;
    const vatAmount = discountRound((taxable * vatRate) / 100);
    return {
      ...discount,
      taxable,
      vatRate,
      vatAmount,
      total: discountRound(taxable + vatAmount),
    };
  }

  function discountMoney(value) {
    if (typeof quoteMoney === "function") return quoteMoney(value);
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(discountNumber(value));
  }

  function discountEscape(value) {
    if (typeof quoteHtml === "function") return quoteHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function quoteSubtotal() {
    if (!Array.isArray(appState.quoteArticles)) return 0;
    return discountRound(
      appState.quoteArticles.reduce((sum, article) => {
        if (typeof quoteArticleTotal === "function") return sum + quoteArticleTotal(article);
        return sum;
      }, 0)
    );
  }

  function ensureQuoteDiscountDraft() {
    if (!appState.quoteDiscountDraft || typeof appState.quoteDiscountDraft !== "object") {
      appState.quoteDiscountDraft = { type: DISCOUNT_NONE, value: "" };
    }
    appState.quoteDiscountDraft.type = normalizeDiscountType(appState.quoteDiscountDraft.type);
    return appState.quoteDiscountDraft;
  }

  function quoteDiscountCalculation() {
    const draft = ensureQuoteDiscountDraft();
    return calculateQuoteTotals(quoteSubtotal(), draft.type, draft.value, DEFAULT_QUOTE_VAT_RATE);
  }

  function applyDiscountToQuote(quote, calculation) {
    if (!quote) return quote;
    const result = calculation || quoteDiscountCalculation();
    quote.subtotal = result.subtotal;
    quote.discountType = result.type;
    quote.discountValue = result.value;
    quote.discountAmount = result.amount;
    quote.taxableAmount = result.taxable;
    quote.vatRate = result.vatRate;
    quote.vatAmount = result.vatAmount;
    quote.total = result.total;
    return quote;
  }

  function discountFromRecord(record) {
    const subtotal = discountNumber(record?.subtotal ?? record?.total);
    const type = normalizeDiscountType(record?.discountType ?? record?.discount_type);
    const value = discountNumber(record?.discountValue ?? record?.discount_value);
    const vatRate = quoteVatRate(record?.vatRate ?? record?.vat_rate, DEFAULT_QUOTE_VAT_RATE);
    return calculateQuoteTotals(subtotal, type, value, vatRate);
  }

  function loadQuoteDiscountDraft(quote) {
    const calculation = discountFromRecord(quote || {});
    appState.quoteDiscountDraft = {
      type: calculation.type,
      value: calculation.type === DISCOUNT_NONE ? "" : String(calculation.value),
    };
    appState.quoteDiscountContext = quote?.id || "new";
  }

  if (typeof ensureQuoteState === "function") {
    const baseEnsureQuoteStateDiscount = ensureQuoteState;
    ensureQuoteState = function ensureQuoteStateWithDiscount() {
      baseEnsureQuoteStateDiscount();
      ensureQuoteDiscountDraft();
    };
  }

  if (typeof quoteGrandTotal === "function") {
    quoteGrandTotal = function quoteGrandTotalWithDiscount() {
      return quoteDiscountCalculation().total;
    };
  }

  if (typeof quoteListSnapshot === "function") {
    const baseQuoteListSnapshotDiscount = quoteListSnapshot;
    quoteListSnapshot = function quoteListSnapshotWithDiscount() {
      return applyDiscountToQuote(baseQuoteListSnapshotDiscount(), quoteDiscountCalculation());
    };
  }

  if (typeof quoteListSaveCurrent === "function") {
    const baseQuoteListSaveCurrentDiscount = quoteListSaveCurrent;
    quoteListSaveCurrent = function quoteListSaveCurrentWithDiscount() {
      const editingId = String(appState.editingQuoteId || "");
      const editingQuote = editingId && typeof quoteListFind === "function" ? quoteListFind(editingId) : null;
      if (editingQuote) applyDiscountToQuote(editingQuote, quoteDiscountCalculation());
      const result = baseQuoteListSaveCurrentDiscount();
      const quoteId = editingId || appState.selectedQuoteId;
      const quote = typeof quoteListFind === "function" ? quoteListFind(quoteId) : null;
      if (quote) {
        applyDiscountToQuote(quote, quoteDiscountCalculation());
      }
      return result;
    };
  }

  if (typeof quoteListPdfHtml === "function") {
    const baseQuoteListPdfHtmlDiscount = quoteListPdfHtml;
    quoteListPdfHtml = function quoteListPdfHtmlWithDiscount(quote) {
      const calculation = discountFromRecord(quote || {});
      const html = baseQuoteListPdfHtmlDiscount({ ...quote, total: calculation.total });
      const label = calculation.type === DISCOUNT_PERCENTAGE
        ? `Sconto (${String(calculation.value).replace(".", ",")}%)`
        : "Sconto";
      const summary = `
        <div class="total" style="max-width:360px;margin-left:auto;display:grid;gap:8px;font-size:16px;">
          <div style="display:flex;justify-content:space-between;gap:24px;font-weight:400;"><span>Subtotale</span><span>${discountMoney(calculation.subtotal)}</span></div>
          <div style="display:flex;justify-content:space-between;gap:24px;font-weight:400;"><span>${discountEscape(label)}</span><span>- ${discountMoney(calculation.amount)}</span></div>
          <div style="display:flex;justify-content:space-between;gap:24px;font-weight:400;"><span>Imponibile</span><span>${discountMoney(calculation.taxable)}</span></div>
          <div style="display:flex;justify-content:space-between;gap:24px;font-weight:400;"><span>IVA ${String(calculation.vatRate).replace(".", ",")}%</span><span>${discountMoney(calculation.vatAmount)}</span></div>
          <div style="display:flex;justify-content:space-between;gap:24px;padding-top:10px;border-top:2px solid #111;font-size:22px;"><span>Totale IVA inclusa</span><span>${discountMoney(calculation.total)}</span></div>
        </div>`;
      return html.replace(/<div class="total">[\s\S]*?<\/div>/, summary);
    };
  }

  function quoteDiscountPanelMarkup() {
    const draft = ensureQuoteDiscountDraft();
    const calculation = quoteDiscountCalculation();
    return `
      <div class="surface mms-discount-panel" data-discount-scope="quote">
        <div class="surface-inner">
          <div class="section-title">
            <div><h3>Sconto preventivo</h3><p>Applica uno sconto percentuale o un importo fisso al totale del preventivo.</p></div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Tipo sconto</label>
              <select class="filter-chip" data-discount-field="type">
                <option value="none" ${draft.type === DISCOUNT_NONE ? "selected" : ""}>Nessuno</option>
                <option value="percentage" ${draft.type === DISCOUNT_PERCENTAGE ? "selected" : ""}>Percentuale</option>
                <option value="fixed" ${draft.type === DISCOUNT_FIXED ? "selected" : ""}>Importo fisso</option>
              </select>
            </div>
            <div class="field">
              <label>Valore sconto</label>
              <input class="field-value" type="number" min="0" step="0.01" ${draft.type === DISCOUNT_PERCENTAGE ? 'max="100"' : ""} data-discount-field="value" value="${discountEscape(draft.value)}" ${draft.type === DISCOUNT_NONE ? "disabled" : ""} placeholder="0,00" />
            </div>
          </div>
          <div class="mms-discount-summary">
            <span>Subtotale <strong data-discount-output="subtotal">${discountMoney(calculation.subtotal)}</strong></span>
            <span>Sconto <strong data-discount-output="amount">- ${discountMoney(calculation.amount)}</strong></span>
            <span>Imponibile <strong data-discount-output="taxable">${discountMoney(calculation.taxable)}</strong></span>
            <span>IVA 22% <strong data-discount-output="vat">${discountMoney(calculation.vatAmount)}</strong></span>
            <span>Totale IVA inclusa <strong data-discount-output="total">${discountMoney(calculation.total)}</strong></span>
          </div>
        </div>
      </div>`;
  }

  function updateQuoteDiscountPanel(panel) {
    const calculation = quoteDiscountCalculation();
    panel.querySelector('[data-discount-output="subtotal"]')?.replaceChildren(document.createTextNode(discountMoney(calculation.subtotal)));
    panel.querySelector('[data-discount-output="amount"]')?.replaceChildren(document.createTextNode(`- ${discountMoney(calculation.amount)}`));
    panel.querySelector('[data-discount-output="taxable"]')?.replaceChildren(document.createTextNode(discountMoney(calculation.taxable)));
    panel.querySelector('[data-discount-output="vat"]')?.replaceChildren(document.createTextNode(discountMoney(calculation.vatAmount)));
    panel.querySelector('[data-discount-output="total"]')?.replaceChildren(document.createTextNode(discountMoney(calculation.total)));
    const totalPill = document.querySelector("section.view.active .screen-actions .ghost-pill");
    if (totalPill) totalPill.textContent = `Totale: ${discountMoney(calculation.total)}`;
  }

  function mountQuoteDiscountPanel() {
    if (appState.currentView !== "new-order") return;
    const editingId = String(appState.editingQuoteId || "");
    const context = editingId || "new";
    if (appState.quoteDiscountContext !== context) {
      const quote = editingId && typeof quoteListFind === "function" ? quoteListFind(editingId) : null;
      loadQuoteDiscountDraft(quote);
    }
    const articles = document.querySelector("section.view.active .quote-articles");
    if (!articles || articles.parentElement.querySelector('[data-discount-scope="quote"]')) return;
    articles.insertAdjacentHTML("afterend", quoteDiscountPanelMarkup());
  }

  function orderDiscountCalculation(draft) {
    const quote = draft?.quote || {};
    const subtotal = discountNumber(draft?.subtotal ?? quote.subtotal ?? quote.total);
    return calculateDiscount(subtotal, draft?.discountType ?? quote.discountType ?? quote.discount_type, draft?.discountValue ?? quote.discountValue ?? quote.discount_value);
  }

  function applyOrderDiscountDraft(draft) {
    if (!draft) return null;
    const calculation = orderDiscountCalculation(draft);
    draft.subtotal = calculation.subtotal;
    draft.discountType = calculation.type;
    draft.discountValue = calculation.value;
    draft.discountAmount = calculation.amount;
    draft.total = calculation.total;
    if (appState.draftOrder) {
      Object.assign(appState.draftOrder, {
        sourceQuoteNumber: draft.quote?.id || "",
        subtotal: calculation.subtotal,
        discountType: calculation.type,
        discountValue: calculation.value,
        discountAmount: calculation.amount,
        total: calculation.total,
      });
    }
    return calculation;
  }

  if (typeof quoteListConvertToOrder === "function") {
    const baseQuoteListConvertToOrderDiscount = quoteListConvertToOrder;
    quoteListConvertToOrder = async function quoteListConvertToOrderWithDiscount(quoteId) {
      const result = baseQuoteListConvertToOrderDiscount(quoteId);
      if (result && typeof result.then === "function") await result;
      const draft = appState.orderFromQuoteDraft;
      const quote = typeof quoteListFind === "function" ? quoteListFind(quoteId) : draft?.quote;
      if (draft && quote) {
        const calculation = discountFromRecord(quote);
        Object.assign(draft, {
          quote,
          subtotal: calculation.subtotal,
          discountType: calculation.type,
          discountValue: calculation.value,
          discountAmount: calculation.amount,
          total: calculation.total,
        });
        if (Array.isArray(draft.payments) && draft.payments.length === 1 && draft.payments[0].type === "Saldo") {
          draft.payments[0].amount = calculation.total.toFixed(2).replace(".", ",");
        }
        applyOrderDiscountDraft(draft);
        renderApp();
      }
      return result;
    };
  }

  function orderDiscountPanelMarkup(draft) {
    const calculation = applyOrderDiscountDraft(draft);
    return `
      <div class="surface mms-discount-panel" data-discount-scope="order">
        <div class="surface-inner">
          <div class="section-title">
            <div><h3>Sconto ordine</h3><p>Riportato dal preventivo e modificabile se i costi effettivi consentono un ulteriore sconto.</p></div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Tipo sconto</label>
              <select class="filter-chip" data-order-discount-field="discountType">
                <option value="none" ${calculation.type === DISCOUNT_NONE ? "selected" : ""}>Nessuno</option>
                <option value="percentage" ${calculation.type === DISCOUNT_PERCENTAGE ? "selected" : ""}>Percentuale</option>
                <option value="fixed" ${calculation.type === DISCOUNT_FIXED ? "selected" : ""}>Importo fisso</option>
              </select>
            </div>
            <div class="field">
              <label>Valore sconto</label>
              <input class="field-value" type="number" min="0" step="0.01" ${calculation.type === DISCOUNT_PERCENTAGE ? 'max="100"' : ""} data-order-discount-field="discountValue" value="${calculation.type === DISCOUNT_NONE ? "" : discountEscape(calculation.value)}" ${calculation.type === DISCOUNT_NONE ? "disabled" : ""} placeholder="0,00" />
            </div>
          </div>
          <div class="mms-discount-summary">
            <span>Subtotale <strong data-order-discount-output="subtotal">${discountMoney(calculation.subtotal)}</strong></span>
            <span>Sconto <strong data-order-discount-output="amount">- ${discountMoney(calculation.amount)}</strong></span>
            <span>Totale ordine <strong data-order-discount-output="total">${discountMoney(calculation.total)}</strong></span>
          </div>
        </div>
      </div>`;
  }

  function updateOrderDiscountPanel(panel) {
    const calculation = applyOrderDiscountDraft(appState.orderFromQuoteDraft);
    if (!calculation) return;
    panel.querySelector('[data-order-discount-output="subtotal"]')?.replaceChildren(document.createTextNode(discountMoney(calculation.subtotal)));
    panel.querySelector('[data-order-discount-output="amount"]')?.replaceChildren(document.createTextNode(`- ${discountMoney(calculation.amount)}`));
    panel.querySelector('[data-order-discount-output="total"]')?.replaceChildren(document.createTextNode(discountMoney(calculation.total)));
    const totalPill = document.querySelector("section.view.active .screen-actions .ghost-pill");
    if (totalPill) totalPill.textContent = `Totale: ${discountMoney(calculation.total)}`;
    const payments = appState.orderFromQuoteDraft?.payments;
    if (Array.isArray(payments) && payments.length === 1 && payments[0].type === "Saldo") {
      payments[0].amount = calculation.total.toFixed(2).replace(".", ",");
      const amountInput = document.querySelector('[data-order-from-quote-payment-index="0"][data-order-from-quote-payment-field="amount"]');
      if (amountInput) amountInput.value = payments[0].amount;
    }
  }

  function mountOrderDiscountPanel() {
    if (appState.currentView !== "order-create" || !appState.orderFromQuoteDraft) return;
    const section = document.querySelector("section.view.active");
    if (!section || section.querySelector('[data-discount-scope="order"]')) return;
    const layout = section.querySelector(".layout-2");
    if (layout) layout.insertAdjacentHTML("afterend", orderDiscountPanelMarkup(appState.orderFromQuoteDraft));
  }

  if (typeof createOrderDirectly === "function") {
    const baseCreateOrderDirectlyDiscount = createOrderDirectly;
    createOrderDirectly = function createOrderDirectlyWithDiscount(payload) {
      const draft = appState.orderFromQuoteDraft;
      const calculation = draft ? applyOrderDiscountDraft(draft) : calculateDiscount(0, DISCOUNT_NONE, 0);
      return baseCreateOrderDirectlyDiscount({
        ...payload,
        p_source_quote_number: draft?.quote?.id || appState.draftOrder?.sourceQuoteNumber || null,
        p_subtotal: calculation.subtotal,
        p_discount_type: calculation.type,
        p_discount_value: calculation.value,
      });
    };
  }

  function applyOrderRecordDiscount(target, source) {
    if (!target || !source) return target;
    const calculation = calculateDiscount(source.subtotal, source.discount_type, source.discount_value);
    Object.assign(target, {
      sourceQuoteId: source.source_quote_number || "",
      subtotal: calculation.subtotal,
      discountType: calculation.type,
      discountValue: calculation.value,
      discountAmount: calculation.amount,
      total: calculation.total,
    });
    return target;
  }

  if (typeof shapeDirectOrders === "function") {
    const baseShapeDirectOrdersDiscount = shapeDirectOrders;
    shapeDirectOrders = function shapeDirectOrdersWithDiscount(data) {
      const shaped = baseShapeDirectOrdersDiscount(data);
      const sourceById = new Map((data.orders || []).map((row) => [Number(row.id), row]));
      shaped.forEach((order) => applyOrderRecordDiscount(order, sourceById.get(Number(order.db_id))));
      return shaped;
    };
  }

  if (typeof upsertCreatedOrderPreview === "function") {
    const baseUpsertCreatedOrderPreviewDiscount = upsertCreatedOrderPreview;
    upsertCreatedOrderPreview = function upsertCreatedOrderPreviewWithDiscount(created, uploadedCount) {
      baseUpsertCreatedOrderPreviewDiscount(created, uploadedCount);
      const order = appData?.orders?.find((item) => Number(item.db_id) === Number(created?.db_id));
      applyOrderRecordDiscount(order, created);
    };
  }

  if (typeof orderDetailEditDraftFor === "function") {
    const baseOrderDetailEditDraftForDiscount = orderDetailEditDraftFor;
    orderDetailEditDraftFor = function orderDetailEditDraftForWithDiscount(order) {
      const draft = baseOrderDetailEditDraftForDiscount(order);
      if (!draft) return draft;
      if (draft.discountType === undefined) {
        const calculation = discountFromRecord(order || {});
        Object.assign(draft, {
          subtotal: calculation.subtotal,
          discountType: calculation.type,
          discountValue: calculation.value,
          discountAmount: calculation.amount,
          total: calculation.total,
        });
      }
      return draft;
    };
  }

  if (typeof orderDetailEditHandleField === "function") {
    const baseOrderDetailEditHandleFieldDiscount = orderDetailEditHandleField;
    orderDetailEditHandleField = function orderDetailEditHandleFieldWithDiscount(target) {
      const handled = baseOrderDetailEditHandleFieldDiscount(target);
      if (handled && target?.matches?.('[data-order-detail-field="discountType"]')) {
        setTimeout(() => renderApp(), 0);
      }
      return handled;
    };
  }

  if (typeof orderDetailEditMarkup === "function") {
    const baseOrderDetailEditMarkupDiscount = orderDetailEditMarkup;
    orderDetailEditMarkup = function orderDetailEditMarkupWithDiscount() {
      const html = baseOrderDetailEditMarkupDiscount();
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const draft = orderDetailEditDraftFor(order);
      if (!html || !draft) return html;
      const calculation = calculateDiscount(draft.subtotal, draft.discountType, draft.discountValue);
      const fields = `
        <div class="field"><label>Subtotale ordine</label><input class="field-value" type="number" min="0" step="0.01" data-order-detail-field="subtotal" value="${discountEscape(calculation.subtotal)}" /></div>
        <div class="field"><label>Tipo sconto</label><select class="filter-chip" data-order-detail-field="discountType"><option value="none" ${calculation.type === DISCOUNT_NONE ? "selected" : ""}>Nessuno</option><option value="percentage" ${calculation.type === DISCOUNT_PERCENTAGE ? "selected" : ""}>Percentuale</option><option value="fixed" ${calculation.type === DISCOUNT_FIXED ? "selected" : ""}>Importo fisso</option></select></div>
        <div class="field"><label>Valore sconto</label><input class="field-value" type="number" min="0" step="0.01" data-order-detail-field="discountValue" value="${calculation.type === DISCOUNT_NONE ? "" : discountEscape(calculation.value)}" ${calculation.type === DISCOUNT_NONE ? "disabled" : ""} /></div>
        <div class="field"><label>Totale ordine</label><div class="field-value">${discountMoney(calculation.total)}</div></div>`;
      return html.replace('<div class="field span-2"><label>Note ordine</label>', `${fields}<div class="field span-2"><label>Note ordine</label>`);
    };
  }

  async function persistOrderDiscount(order, draft) {
    const dbId = Number(order?.db_id || order?.internal_id);
    if (!dbId || !window.supabase?.createClient || typeof DIRECT_SUPABASE_URL === "undefined") return;
    const calculation = calculateDiscount(draft.subtotal, draft.discountType, draft.discountValue);
    const client = window.supabase.createClient(DIRECT_SUPABASE_URL, DIRECT_SUPABASE_ANON_KEY);
    const { error } = await client
      .from("orders")
      .update({
        subtotal: calculation.subtotal,
        discount_type: calculation.type,
        discount_value: calculation.value,
        discount_amount: calculation.amount,
        total: calculation.total,
      })
      .eq("id", dbId);
    if (error) throw error;
  }

  if (typeof orderDetailEditSave === "function") {
    const baseOrderDetailEditSaveDiscount = orderDetailEditSave;
    orderDetailEditSave = function orderDetailEditSaveWithDiscount() {
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const draft = orderDetailEditDraftFor(order);
      if (draft) {
        const calculation = calculateDiscount(draft.subtotal, draft.discountType, draft.discountValue);
        Object.assign(draft, {
          subtotal: calculation.subtotal,
          discountType: calculation.type,
          discountValue: calculation.value,
          discountAmount: calculation.amount,
          total: calculation.total,
        });
        Object.assign(order || {}, draft);
      }
      const result = baseOrderDetailEditSaveDiscount();
      if (order && draft) {
        persistOrderDiscount(order, draft).catch((error) => {
          console.warn("Sconto ordine non sincronizzato", error);
          setFlashMessage(`Modifiche locali salvate, ma lo sconto dell'ordine #${order.id} non e' stato sincronizzato`);
          renderApp();
        });
      }
      return result;
    };
  }

  function ensureDiscountStyles() {
    if (document.getElementById("mms-discount-styles")) return;
    const style = document.createElement("style");
    style.id = "mms-discount-styles";
    style.textContent = `
      .mms-discount-panel { margin-top: 16px; }
      .mms-discount-summary { display:flex; justify-content:flex-end; gap:24px; flex-wrap:wrap; margin-top:18px; padding-top:16px; border-top:1px solid rgba(20,30,25,.14); }
      .mms-discount-summary span { display:grid; gap:4px; min-width:140px; color:#5d665f; }
      .mms-discount-summary strong { color:#172019; font-size:18px; }
      @media (max-width:720px) { .mms-discount-summary { justify-content:stretch; } .mms-discount-summary span { flex:1 1 120px; } }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener("input", (event) => {
    const field = event.target.closest?.('[data-discount-scope="quote"] [data-discount-field]');
    if (field) {
      const draft = ensureQuoteDiscountDraft();
      draft[field.dataset.discountField] = field.value;
      updateQuoteDiscountPanel(field.closest(".mms-discount-panel"));
      return;
    }
    const orderField = event.target.closest?.('[data-discount-scope="order"] [data-order-discount-field]');
    if (orderField && appState.orderFromQuoteDraft) {
      appState.orderFromQuoteDraft[orderField.dataset.orderDiscountField] = orderField.value;
      updateOrderDiscountPanel(orderField.closest(".mms-discount-panel"));
    }
  }, true);

  document.addEventListener("change", (event) => {
    const quoteType = event.target.closest?.('[data-discount-scope="quote"] [data-discount-field="type"]');
    if (quoteType) {
      const draft = ensureQuoteDiscountDraft();
      draft.type = quoteType.value;
      if (draft.type === DISCOUNT_NONE) draft.value = "";
      renderApp();
      return;
    }
    const orderType = event.target.closest?.('[data-discount-scope="order"] [data-order-discount-field="discountType"]');
    if (orderType && appState.orderFromQuoteDraft) {
      appState.orderFromQuoteDraft.discountType = orderType.value;
      if (orderType.value === DISCOUNT_NONE) appState.orderFromQuoteDraft.discountValue = 0;
      applyOrderDiscountDraft(appState.orderFromQuoteDraft);
      renderApp();
    }
  }, true);

  document.addEventListener("click", (event) => {
    const newQuote = event.target.closest?.("[data-open='new-order'], [data-nav='new-order']");
    if (newQuote && !event.target.closest?.("[data-quote-edit]")) {
      appState.quoteDiscountDraft = { type: DISCOUNT_NONE, value: "" };
      appState.quoteDiscountContext = "new";
    }
  }, true);

  const baseRenderAppDiscount = renderApp;
  renderApp = function renderAppWithDiscounts() {
    ensureDiscountStyles();
    baseRenderAppDiscount();
    mountQuoteDiscountPanel();
    mountOrderDiscountPanel();
  };

  ensureQuoteDiscountDraft();
  if (document.getElementById("app")?.innerHTML) renderApp();
})();
