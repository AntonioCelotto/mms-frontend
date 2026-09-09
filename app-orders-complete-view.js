(function () {
  let paymentsLoading = false;
  let paymentsLoaded = false;
  let paymentRetryTimer = 0;
  let paymentRetryAttempts = 0;
  const maxPaymentRetryAttempts = 30;

  function schedulePaymentLoad(delay = 300) {
    if (paymentsLoaded || paymentsLoading || paymentRetryTimer || paymentRetryAttempts >= maxPaymentRetryAttempts) return;
    paymentRetryTimer = window.setTimeout(() => {
      paymentRetryTimer = 0;
      paymentRetryAttempts += 1;
      void loadPaymentDetails();
    }, delay);
  }
  function value(input) {
    return String(input ?? "").trim();
  }

  function escapeHtml(input) {
    return value(input)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatAmount(input) {
    const amount = Number(input);
    if (!Number.isFinite(amount)) return value(input) || "Importo da definire";
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount);
  }

  function formatDate(input) {
    const raw = value(input);
    if (!raw) return "Scadenza da definire";
    const parts = raw.slice(0, 10).split("-");
    if (parts.length !== 3) return raw;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function orderNumber(order) {
    return value(order?.sourceQuoteNumber || order?.source_quote_number || order?.orderNumber || order?.order_number || order?.id);
  }

  function orderDbId(order) {
    return Number(order?.db_id || order?.internal_id || order?.id || 0);
  }

  function quoteSummary(order) {
    const payload = order?.sourceQuotePayload || order?.source_quote_payload || {};
    const articles = Array.isArray(payload.articles) ? payload.articles : [];
    const materials = Array.isArray(appData?.orderMaterials?.[Number(order?.id)])
      ? appData.orderMaterials[Number(order.id)]
      : [];
    return {
      quoteId: value(payload.id || orderNumber(order)),
      client: value(payload.client || order?.client),
      total: payload.total ?? order?.total ?? "",
      articles,
      materials: articles.length ? [] : materials.map((row) => ({
        name: value(row.product_name || row.material || row.name),
        quantity: value(row.quantity_required || row.quantity || row.qty) || "1",
        price: value(row.price || row.cost || row.unit_price),
      })).filter((row) => row.name),
    };
  }

  function seedQuoteSummaries() {
    if (appState.currentView !== "order-detail") return;
    const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
    if (!order) return;
    if (!appState.orderQuoteSummaries || typeof appState.orderQuoteSummaries !== "object") {
      appState.orderQuoteSummaries = {};
    }
    const summary = quoteSummary(order);
    if (!summary.articles.length && !summary.materials.length) return;
    appState.orderQuoteSummaries[Number(order.id)] = summary;
  }

  const baseFilterOrders = filterOrders;
  filterOrders = function filterOrdersByCompleteNumber() {
    const query = value(appState.search).toLowerCase();
    if (!query) return baseFilterOrders();
    const originalSearch = appState.search;
    appState.search = "";
    let filtered;
    try {
      filtered = baseFilterOrders();
    } finally {
      appState.search = originalSearch;
    }
    return filtered.filter((order) => {
      const payments = Array.isArray(order.paymentRows) ? order.paymentRows : [];
      return [
        order.id,
        order.db_id,
        order.orderNumber,
        order.order_number,
        order.sourceQuoteNumber,
        order.source_quote_number,
        order.client,
        order.department,
        order.category,
        order.payment,
        order.status,
        ...payments.flatMap((row) => [row.amount, row.due_date, row.status]),
      ].join(" ").toLowerCase().includes(query);
    });
  };

  function paymentMarkup(order) {
    const rows = Array.isArray(order?.paymentRows) ? order.paymentRows : [];
    if (!rows.length) return `<strong>${escapeHtml(order?.payment || "Da pagare")}</strong><div class="muted">Importo e scadenza da definire</div>`;
    return rows.map((row) => {
      const status = value(row.status).toLowerCase() === "pagato" ? "Pagato" : "Da pagare";
      const type = value(row.payment_type || row.type || "Pagamento");
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
      const paidDate = value(row.paid_date || row.paidDate);
      const paidSuffix = status === "Pagato" && paidDate ? ` (${formatDate(paidDate)})` : "";
      return `<div class="order-payment-summary"><strong>${escapeHtml(typeLabel)} ${escapeHtml(formatAmount(row.amount))} - ${escapeHtml(status)}${escapeHtml(paidSuffix)}</strong><div class="muted">Scadenza ${escapeHtml(formatDate(row.due_date || row.dueDate))}</div></div>`;
    }).join("");
  }

  const baseRenderOrders = renderOrders;
  renderOrders = function renderOrdersWithPaymentDetails() {
    const markup = baseRenderOrders();
    const template = document.createElement("template");
    template.innerHTML = markup;
    const header = Array.from(template.content.querySelectorAll("th")).find((cell) => value(cell.textContent) === "Pagamento");
    if (header) header.textContent = "Pagamento / scadenza";
    template.content.querySelectorAll("tbody tr").forEach((row) => {
      const detail = row.querySelector("[data-detail]");
      if (!detail) return;
      const order = appData.orders.find((item) => Number(item.id) === Number(detail.dataset.detail));
      const cells = row.querySelectorAll("td");
      if (order && cells[6]) cells[6].innerHTML = paymentMarkup(order);
    });
    return template.innerHTML;
  };

  function removeWarehousePicker() {
    if (appState.currentView !== "order-detail") return;
    document.querySelectorAll(".order-inventory-picker").forEach((node) => node.remove());
  }

  function ensureArticlePanel() {
    if (appState.currentView !== "order-detail") return;
    const section = document.querySelector("section.view.active");
    if (!section || section.querySelector(".order-quote-summary")) return;
    const editPanel = section.querySelector(".order-detail-edit-panel");
    if (!editPanel) return;
    editPanel.insertAdjacentHTML("beforebegin", `
      <div class="order-quote-summary surface order-detail-edit-panel">
        <div class="surface-inner">
          <div class="section-title"><div><h3>Articoli e prodotti da preventivo</h3><p>Riepilogo commerciale collegato all'ordine.</p></div></div>
          <div class="empty-state">Nessun articolo o prodotto registrato per questo ordine.</div>
        </div>
      </div>
    `);
  }

  const baseRenderApp = renderApp;
  renderApp = function renderAppWithCompleteOrders() {
    seedQuoteSummaries();
    baseRenderApp();
    removeWarehousePicker();
    ensureArticlePanel();
  };

  async function loadPaymentDetails() {
    if (paymentsLoading || paymentsLoaded) return;
    if (!appData?.orders?.length) {
      schedulePaymentLoad();
      return;
    }
    paymentsLoading = true;
    try {
      const session = await window.mmsSupabaseAuth?.auth?.getSession?.();
      const token = session?.data?.session?.access_token;
      if (!token) {
        schedulePaymentLoad();
        return;
      }
      const response = await fetch("/api/order-payment-details", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      const rows = payload.payments;
      const byOrder = new Map();
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const key = Number(row.order_id);
        if (!byOrder.has(key)) byOrder.set(key, []);
        byOrder.get(key).push(row);
      });
      appData.orders.forEach((order) => {
        order.paymentRows = byOrder.get(orderDbId(order)) || [];
      });
      paymentsLoaded = true;
      paymentRetryAttempts = 0;
      renderApp();
    } catch (error) {
      console.warn("Dettagli pagamenti ordini non caricati", error);
    } finally {
      paymentsLoading = false;
    }
  }

  const style = document.createElement("style");
  style.textContent = ".order-payment-summary+.order-payment-summary{margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,.08)}";
  document.head.appendChild(style);

  seedQuoteSummaries();
  removeWarehousePicker();
  window.addEventListener("mms-auth-profile", () => {
    paymentRetryAttempts = 0;
    void loadPaymentDetails();
    schedulePaymentLoad();
  });
  void loadPaymentDetails();
  schedulePaymentLoad();
})();
