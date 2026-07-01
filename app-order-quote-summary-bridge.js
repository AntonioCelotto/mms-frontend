(function () {
  const STORAGE_KEY = "mms_order_quote_summaries_v1";

  function text(value) {
    return String(value ?? "").trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function readStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (error) {
      return {};
    }
  }

  function writeStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (error) {
      console.warn("Riepilogo preventivo ordine non salvato", error);
    }
  }

  function normalizeMaterial(material) {
    const raw = material && typeof material === "object" ? material : {};
    return {
      name: text(raw.material || raw.product_name || raw.name || raw.title),
      quantity: text(raw.quantity || raw.qty || raw.quantity_required) || "1",
      price: text(raw.price || raw.cost || raw.unit_price),
      source_type: text(raw.source_type || raw.source) || "mms",
      delivery_status: text(raw.delivery_status || raw.status) || "non_consegnato",
      warehouse_status_note: text(raw.warehouse_status_note || raw.warehouse),
      preorder_note: text(raw.preorder_note || raw.note || raw.notes),
    };
  }

  function normalizeArticle(article, index) {
    const raw = article && typeof article === "object" ? article : {};
    return {
      name: text(raw.name || raw.article || raw.title || raw.product_name) || `Articolo ${index + 1}`,
      quantity: text(raw.quantity || raw.qty) || "1",
      cost: text(raw.cost || raw.price),
      materials: (Array.isArray(raw.materials) ? raw.materials : [])
        .map(normalizeMaterial)
        .filter((material) => material.name || material.quantity || material.price),
    };
  }

  function quoteArticles(quote) {
    const hydrated = typeof quoteMaterialsHydrateQuote === "function" ? quoteMaterialsHydrateQuote(quote) : quote;
    return (Array.isArray(hydrated?.articles) ? hydrated.articles : []).map(normalizeArticle);
  }

  function summaryFromCurrentQuote() {
    const draft = appState.orderFromQuoteDraft || {};
    const quote = draft.quote || null;
    const articles = quoteArticles(quote);
    const draftMaterials = Array.isArray(draft.materials) && draft.materials.length ? draft.materials : appState.draftMaterials || [];
    const materials = (Array.isArray(draftMaterials) ? draftMaterials : []).map(normalizeMaterial).filter((material) => material.name);
    if (!articles.length && !materials.length) return null;
    return {
      quoteId: quote?.id || appState.selectedQuoteId || "",
      client: quote?.client || draft.client || "",
      total: quote?.total || "",
      articles,
      materials,
      createdAt: new Date().toISOString(),
    };
  }

  function saveSummaryForOrder(order, summary) {
    const orderId = Number(order?.id || appState.selectedOrderId || 0);
    if (!orderId || !summary) return;
    const store = readStore();
    store[orderId] = summary;
    writeStore(store);
    if (!appState.orderQuoteSummaries || typeof appState.orderQuoteSummaries !== "object") appState.orderQuoteSummaries = {};
    appState.orderQuoteSummaries[orderId] = summary;
  }

  function summaryForOrder(order) {
    const orderId = Number(order?.id || appState.selectedOrderId || 0);
    if (!orderId) return null;
    if (appState.orderQuoteSummaries?.[orderId]) return appState.orderQuoteSummaries[orderId];
    const stored = readStore()[orderId] || null;
    if (stored) {
      if (!appState.orderQuoteSummaries || typeof appState.orderQuoteSummaries !== "object") appState.orderQuoteSummaries = {};
      appState.orderQuoteSummaries[orderId] = stored;
    }
    return stored;
  }

  function materialsFromSummary(summary) {
    const articleMaterials = (summary?.articles || []).flatMap((article) =>
      (article.materials || []).map((material) => ({
        product_name: material.name,
        quantity_required: material.quantity || "1",
        source_type: material.source_type === "cliente" ? "cliente" : "mms",
        delivery_status: material.delivery_status === "consegnato" ? "consegnato" : "non_consegnato",
        warehouse_status_note: material.warehouse_status_note || "",
        preorder_note: material.preorder_note || `Articolo: ${article.name}`,
      }))
    );
    const directMaterials = (summary?.materials || []).map((material) => ({
      product_name: material.name,
      quantity_required: material.quantity || "1",
      source_type: material.source_type === "cliente" ? "cliente" : "mms",
      delivery_status: material.delivery_status === "consegnato" ? "consegnato" : "non_consegnato",
      warehouse_status_note: material.warehouse_status_note || "",
      preorder_note: material.preorder_note || "",
    }));
    return articleMaterials.length ? articleMaterials : directMaterials;
  }

  function isBlankMaterial(row) {
    return !text(row?.product_name) && !text(row?.material);
  }

  function hydrateDetailDraft(order) {
    if (typeof orderDetailEditDraftFor !== "function") return;
    const draft = orderDetailEditDraftFor(order);
    const summary = summaryForOrder(order);
    const summaryMaterials = materialsFromSummary(summary);
    if (!draft || !summaryMaterials.length) return;
    if (!Array.isArray(draft.materials) || !draft.materials.length || draft.materials.every(isBlankMaterial)) {
      draft.materials = summaryMaterials;
    }
  }

  function renderSummary(summary) {
    const articleRows = (summary?.articles || [])
      .map((article, index) => {
        const materials = (article.materials || [])
          .map(
            (material) => `
              <tr>
                <td style="padding-left:20px;">${escapeHtml(material.name || "Materiale")}</td>
                <td>${escapeHtml(material.quantity)}</td>
                <td>${escapeHtml(material.price)}</td>
              </tr>
            `
          )
          .join("");
        return `
          <tr>
            <td><strong>${index + 1}. ${escapeHtml(article.name)}</strong></td>
            <td>${escapeHtml(article.quantity)}</td>
            <td>${escapeHtml(article.cost)}</td>
          </tr>
          ${materials}
        `;
      })
      .join("");
    const materialRows = !articleRows
      ? (summary?.materials || [])
          .map(
            (material) => `
              <tr>
                <td><strong>${escapeHtml(material.name)}</strong></td>
                <td>${escapeHtml(material.quantity)}</td>
                <td>${escapeHtml(material.price)}</td>
              </tr>
            `
          )
          .join("")
      : "";
    if (!articleRows && !materialRows) return "";
    return `
      <div class="order-quote-summary surface order-detail-edit-panel">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Articoli e prodotti da preventivo</h3>
              <p>Riepilogo commerciale riportato dal preventivo ${escapeHtml(summary.quoteId || "")}.</p>
            </div>
          </div>
          <div class="order-detail-edit-scroll">
            <table>
              <thead><tr><th>Voce</th><th>Quantita'</th><th>Prezzo</th></tr></thead>
              <tbody>${articleRows || materialRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function mountSummary() {
    if (appState.currentView !== "order-detail") return;
    const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
    hydrateDetailDraft(order);
    const summary = summaryForOrder(order);
    const markup = renderSummary(summary);
    if (!markup) return;
    const section = document.querySelector("section.view.active");
    if (!section || section.querySelector(".order-quote-summary")) return;
    const editPanel = section.querySelector(".order-detail-edit-panel");
    if (editPanel) editPanel.insertAdjacentHTML("beforebegin", markup);
  }

  if (typeof orderFlowMaterialShape === "function") {
    orderFlowMaterialShape = function orderFlowMaterialShapeWithQuantity(material, inventoryById) {
      const inventory = inventoryById?.get?.(Number(material.inventory_item_id));
      return {
        material: material.product_name || "Materiale",
        source: material.source_type === "mms" ? "MMS" : "Cliente",
        warehouse: material.warehouse_status_note || (inventory?.sku ? `SKU ${inventory.sku}` : "Inserimento manuale"),
        delivery: material.delivery_status === "consegnato" ? "Consegnato" : "Non consegnato",
        preorder: material.preorder_note || "Nessun preordine",
        product_name: material.product_name || "",
        quantity_required: material.quantity_required || "1",
        source_type: material.source_type || "mms",
        delivery_status: material.delivery_status || "non_consegnato",
        warehouse_status_note: material.warehouse_status_note || "",
        preorder_note: material.preorder_note || "",
      };
    };
  }

  if (typeof saveDraftOrder === "function") {
    const baseSaveDraftOrderQuoteSummary = saveDraftOrder;
    saveDraftOrder = async function saveDraftOrderWithQuoteSummary() {
      const summary = summaryFromCurrentQuote();
      await baseSaveDraftOrderQuoteSummary();
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      saveSummaryForOrder(order, summary);
      hydrateDetailDraft(order);
    };
  }

  const baseRenderAppQuoteSummary = renderApp;
  renderApp = function renderAppOrderQuoteSummary() {
    baseRenderAppQuoteSummary();
    mountSummary();
  };

  if (document.getElementById("app")?.innerHTML) renderApp();
})();