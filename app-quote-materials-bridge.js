(function () {
  function quoteMaterialsText(value) {
    return String(value ?? "").trim();
  }

  function quoteMaterialsFirstText(...values) {
    for (const value of values) {
      const text = quoteMaterialsText(value);
      if (text) return text;
    }
    return "";
  }

  function quoteMaterialsArray(...values) {
    for (const value of values) {
      if (Array.isArray(value)) return value;
    }
    return [];
  }

  function quoteMaterialsSourceType(value) {
    const normalized = quoteMaterialsText(value).toLowerCase();
    if (normalized === "cliente" || normalized === "client") return "cliente";
    return "mms";
  }

  function quoteMaterialsDeliveryStatus(value) {
    const normalized = quoteMaterialsText(value).toLowerCase();
    if (normalized === "consegnato" || normalized === "delivered") return "consegnato";
    return "non_consegnato";
  }

  function quoteMaterialsFallbackRow() {
    return typeof EMPTY_MATERIAL_DRAFT === "object"
      ? { ...EMPTY_MATERIAL_DRAFT }
      : {
          product_name: "",
          source_type: "mms",
          delivery_status: "non_consegnato",
          warehouse_status_note: "",
          preorder_note: "",
          quantity_required: "",
        };
  }

  function quoteMaterialsNormalizeMaterial(material) {
    const raw = material && typeof material === "object" ? material : {};
    const name = quoteMaterialsFirstText(raw.material, raw.product_name, raw.name, raw.title, raw.product, raw.description, raw.item);
    return {
      ...raw,
      material: name,
      quantity: quoteMaterialsFirstText(raw.quantity, raw.qty, raw.qta, raw.quantity_required, raw.amount),
      price: quoteMaterialsFirstText(raw.price, raw.cost, raw.unit_price, raw.prezzo),
      source_type: quoteMaterialsSourceType(raw.source_type || raw.source),
      delivery_status: quoteMaterialsDeliveryStatus(raw.delivery_status || raw.status),
      inventory_sku: quoteMaterialsFirstText(raw.inventory_sku, raw.sku, raw.code, raw.codice),
      note: quoteMaterialsFirstText(raw.note, raw.notes, raw.preorder_note),
    };
  }

  function quoteMaterialsNormalizeArticle(article, index) {
    const raw = article && typeof article === "object" ? article : {};
    const materials = quoteMaterialsArray(raw.materials, raw.materiali, raw.articleMaterials, raw.products, raw.prodotti)
      .map(quoteMaterialsNormalizeMaterial)
      .filter((material) => material.material || material.quantity || material.price || material.note);
    return {
      ...raw,
      name: quoteMaterialsFirstText(raw.name, raw.article, raw.title, raw.product_name, raw.description) || `Articolo ${index + 1}`,
      quantity: quoteMaterialsFirstText(raw.quantity, raw.qty, raw.qta) || "1",
      cost: quoteMaterialsFirstText(raw.cost, raw.price, raw.prezzo),
      materials,
    };
  }

  function quoteMaterialsReadArticles(quote) {
    const raw = quote && typeof quote === "object" ? quote : {};
    return quoteMaterialsArray(
      raw.articles,
      raw.payload?.articles,
      raw.payload?.quote?.articles,
      raw.items,
      raw.rows,
      raw.articleRows
    );
  }

  function quoteMaterialsHydrateQuote(quote) {
    if (!quote || typeof quote !== "object") return quote;
    const articles = quoteMaterialsReadArticles(quote).map(quoteMaterialsNormalizeArticle);
    if (!articles.length && Array.isArray(quote.materials) && quote.materials.length) {
      articles.push({
        name: "Materiali preventivo",
        quantity: "1",
        cost: "",
        materials: quote.materials.map(quoteMaterialsNormalizeMaterial),
      });
    }
    if (articles.length) {
      quote.articles = articles;
      if (quote.payload && typeof quote.payload === "object") quote.payload.articles = articles;
    }
    return quote;
  }

  function quoteMaterialsBuildOrderRows(quote) {
    const hydrated = quoteMaterialsHydrateQuote(quote);
    const rows = [];
    (hydrated?.articles || []).forEach((article) => {
      (article.materials || []).forEach((material) => {
        const productName = quoteMaterialsText(material.material);
        if (!productName) return;
        const articleName = quoteMaterialsText(article.name) || "n/d";
        const price = quoteMaterialsText(material.price);
        rows.push({
          product_name: productName,
          source_type: quoteMaterialsSourceType(material.source_type),
          delivery_status: quoteMaterialsDeliveryStatus(material.delivery_status),
          warehouse_status_note: material.inventory_sku
            ? `SKU ${material.inventory_sku}`
            : `Da preventivo ${quoteMaterialsText(hydrated.id) || "n/d"}`,
          preorder_note: material.note || `Articolo: ${articleName}${price ? ` - prezzo ${price}` : ""}`,
          quantity_required: quoteMaterialsText(material.quantity) || "1",
          inventory_sku: quoteMaterialsText(material.inventory_sku),
        });
      });
    });
    return rows.length ? rows : [quoteMaterialsFallbackRow()];
  }

  if (typeof quoteListFind === "function") {
    const baseQuoteListFindMaterialsBridge = quoteListFind;
    quoteListFind = function quoteListFindWithMaterialsBridge(id = appState.selectedQuoteId) {
      return quoteMaterialsHydrateQuote(baseQuoteListFindMaterialsBridge(id));
    };
  }

  if (typeof orderFromQuoteDraftMaterials === "function") {
    orderFromQuoteDraftMaterials = function orderFromQuoteDraftMaterialsWithBridge(quote) {
      return quoteMaterialsBuildOrderRows(quote);
    };
  }

  if (typeof quoteListConvertToOrder === "function") {
    const baseQuoteListConvertToOrderMaterialsBridge = quoteListConvertToOrder;
    quoteListConvertToOrder = async function quoteListConvertToOrderWithMaterialsBridge(quoteId) {
      const quote = typeof quoteListFind === "function" ? quoteListFind(quoteId) : null;
      quoteMaterialsHydrateQuote(quote);
      return baseQuoteListConvertToOrderMaterialsBridge(quoteId);
    };
  }

  window.quoteMaterialsHydrateQuote = quoteMaterialsHydrateQuote;
  window.quoteMaterialsBuildOrderRows = quoteMaterialsBuildOrderRows;
})();