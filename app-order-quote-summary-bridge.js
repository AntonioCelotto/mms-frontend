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
      inventory_item_id: raw.inventory_item_id || raw.inventoryItemId || "",
      inventory_sku: text(raw.inventory_sku || raw.sku),
      unit: text(raw.unit),
      source_type: text(raw.source_type || raw.source) || "mms",
      delivery_status: text(raw.delivery_status || raw.status) || "non_consegnato",
      warehouse_status_note: text(raw.warehouse_status_note || raw.warehouse),
      preorder_note: text(raw.preorder_note || raw.note || raw.notes),
    };
  }

  function normalizeArticle(article, index) {
    const raw = article && typeof article === "object" ? article : {};
    return {
      key: text(raw.id || raw.code || `article-${index + 1}`),
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
    const payload = order?.sourceQuotePayload || order?.source_quote_payload || {};
    // The order's database copy is shared by all users. A local summary can
    // contain incomplete prices from an earlier load, so prefer the source.
    if (Array.isArray(payload.articles) && payload.articles.length) {
      return {
        quoteId: payload.id || order?.sourceQuoteNumber || "",
        articles: payload.articles.map(normalizeArticle),
        subtotal: payload.subtotal ?? order?.subtotal,
        total: payload.total,
      };
    }
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
        quantity: material.quantity || "1",
        inventory_item_id: material.inventory_item_id || null,
        inventory_sku: material.inventory_sku || "",
        sku: material.inventory_sku || "",
        unit: material.unit || "",
        source_type: material.source_type === "cliente" ? "cliente" : "mms",
        delivery_status: material.delivery_status === "consegnato" ? "consegnato" : "non_consegnato",
        warehouse_status_note: material.warehouse_status_note || "",
        preorder_note: material.preorder_note || `Articolo: ${article.name}`,
      }))
    );
    const directMaterials = (summary?.materials || []).map((material) => ({
      product_name: material.name,
      quantity_required: material.quantity || "1",
      quantity: material.quantity || "1",
      inventory_item_id: material.inventory_item_id || null,
      inventory_sku: material.inventory_sku || "",
      sku: material.inventory_sku || "",
      unit: material.unit || "",
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

  function sameMaterial(a, b) {
    if (a.inventory_item_id && b.inventory_item_id) return text(a.inventory_item_id) === text(b.inventory_item_id);
    if (a.inventory_sku && b.inventory_sku) return a.inventory_sku === b.inventory_sku;
    return !!a.name && a.name.toLowerCase() === b.name.toLowerCase();
  }

  function summaryWithOrderMaterials(summary, order) {
    if (!summary || !(order?.db_id || order?.internal_id)) return summary;
    const saved = appData.orderMaterials?.[Number(order.id)];
    // No loaded collection: keep the original clearly labelled as a quote.
    // A loaded empty array is different: do not resurrect original rows.
    if (!Array.isArray(saved)) return summary;

    const articles = (summary.articles || []).map((article, index) => ({
      ...article, key: article.key || `article-${index + 1}`, materials: [],
    }));
    const byKey = new Map(articles.map((article, index) => [article.key, index]));
    const savedMaterials = saved.filter((row) => text(row?.product_name || row?.material)).map((row) => ({
      ...normalizeMaterial(row),
      name: text(row.product_name || row.material),
      quantity: text(row.quantity_required ?? row.quantity ?? row.qty),
      articleKey: text(row.article_key || row.articleKey),
    }));
    const originalsAcrossOrder = [
      ...(summary.materials || []), ...(summary.articles || []).flatMap((article) => article.materials || []),
    ];
    const unlinked = [];
    for (const material of savedMaterials) {
      const index = byKey.get(material.articleKey);
      const originals = (index === undefined ? originalsAcrossOrder : summary.articles[index].materials) || [];
      const matches = originals.filter((original) => sameMaterial(original, material));
      const uniqueMatch = matches.length === 1 && savedMaterials.filter((other) =>
        (index === undefined || other.articleKey === material.articleKey) && sameMaterial(matches[0], other)).length === 1;
      const row = { ...material, price: uniqueMatch ? matches[0].price : "" };
      if (index === undefined) unlinked.push(row);
      else articles[index].materials.push(row);
    }
    return { ...summary, articles, materials: unlinked, showsOrderMaterials: true };
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
    const materialRows = !articleRows || summary?.showsOrderMaterials
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
    if (!articleRows && !materialRows && !summary?.showsOrderMaterials) return "";
    const rows = articleRows + (articleRows && materialRows && summary?.showsOrderMaterials
      ? '<tr><td colspan="3"><strong>Materiali non collegati a un articolo</strong></td></tr>' : "") + materialRows;
    const amount = Number(summary?.total);
    const totalLine = summary?.total != null && summary.total !== "" && Number.isFinite(amount)
      ? `<div class="order-quote-total"><strong>Totale preventivo (IVA inclusa)</strong><strong>${escapeHtml(new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount))}</strong></div>`
      : "";
    return `
      <div class="order-quote-summary surface order-detail-edit-panel">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>${summary.showsOrderMaterials ? "Articoli e materiali dell’ordine" : "Articoli e prodotti da preventivo"}</h3>
              <p>${summary.showsOrderMaterials
                ? `Le quantità dei materiali sono quelle salvate nell’ordine. Articoli, prezzi e totale fanno riferimento al preventivo ${escapeHtml(summary.quoteId || "")}.`
                : `Riepilogo originale del preventivo ${escapeHtml(summary.quoteId || "")}.`}</p>
            </div>
          </div>
          <div class="order-detail-edit-scroll">
            <table>
              <thead><tr><th>Voce</th><th>Quantita'</th><th>Prezzo da preventivo</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="3">Nessun materiale salvato</td></tr>'}</tbody>
            </table>
          </div>
          ${totalLine}
        </div>
      </div>
    `;
  }

  function mountSummary() {
    if (appState.currentView !== "order-detail") return;
    const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
    hydrateDetailDraft(order);
    const summary = summaryWithOrderMaterials(summaryForOrder(order), order);
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
        quantity: material.quantity_required || "1",
        inventory_item_id: material.inventory_item_id || null,
        inventory_sku: material.inventory_sku || material.sku || "",
        sku: material.inventory_sku || material.sku || "",
        unit: material.unit || "",
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
