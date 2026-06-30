function orderQuotePreviewId(quote) {
  const numeric = Number(String(quote?.id || "").replace(/\D/g, "")) || Date.now() % 100000;
  return 900000 + numeric;
}

function orderQuotePreviewPayment() {
  const draft = appState.orderFromQuoteDraft;
  if (draft && typeof orderFromQuoteV2PaymentSummary === "function") return orderFromQuoteV2PaymentSummary(draft);
  return appState.draftOrder?.deposit || "Da definire";
}

function upsertOrderPreviewFromQuote(quote) {
  if (!quote || !appData || !Array.isArray(appData.orders)) return;
  const previewId = orderQuotePreviewId(quote);
  const existingIndex = appData.orders.findIndex((order) => order.sourceQuoteId === quote.id || Number(order.id) === previewId);
  const preview = {
    id: previewId,
    db_id: null,
    sourceQuoteId: quote.id,
    client: quote.client || "Cliente",
    category: quote.category || "Da definire",
    department: quote.category || "Da definire",
    route: String(quote.category || "").toLowerCase().includes("esterna")
      ? "Esterno"
      : String(quote.category || "").toLowerCase().includes("commercio")
        ? "Commercio"
        : "Interno",
    priority: quote.priority || "Standard",
    status: "Da completare",
    payment: orderQuotePreviewPayment(),
    eta: appState.orderFromQuoteDraft?.estimatedDelivery || "Da definire",
    files: Array.isArray(quote.photos) ? quote.photos.length : 0,
    summary: `Ordine in preparazione dal preventivo ${quote.id}`,
    notes: quote.note || "Ordine creato da preventivo, da completare e salvare.",
    customerWindow: appState.orderFromQuoteDraft?.customerDelivery || "Da definire",
    orderDate: new Date().toISOString().slice(0, 10),
    estimatedDelivery: appState.orderFromQuoteDraft?.estimatedDelivery || "Da definire",
    warehouseLinked: true,
    clientVisibility: "Ordine in preparazione dopo accettazione preventivo.",
  };
  if (existingIndex >= 0) appData.orders[existingIndex] = { ...appData.orders[existingIndex], ...preview };
  else appData.orders.unshift(preview);
}

function removeOrderPreviewFromQuote(quoteId) {
  if (!quoteId || !appData || !Array.isArray(appData.orders)) return;
  const previewId = orderQuotePreviewId({ id: quoteId });
  appData.orders = appData.orders.filter((order) => order.sourceQuoteId !== quoteId && Number(order.id) !== previewId);
}

const baseQuoteListConvertToOrderPreview = quoteListConvertToOrder;
quoteListConvertToOrder = async function quoteListConvertToOrderWithPreview(quoteId) {
  const quote = quoteListFind(quoteId);
  const result = baseQuoteListConvertToOrderPreview(quoteId);
  if (result && typeof result.then === "function") await result;
  const converted = quoteListFind(quoteId) || quote;
  upsertOrderPreviewFromQuote(converted);
  setFlashMessage(`Preventivo ${quoteId} trasformato: lo trovi in Ordini come ordine da completare.`);
  renderApp();
  return result;
};

const baseSaveDraftOrderPreview = saveDraftOrder;
saveDraftOrder = async function saveDraftOrderAndRemovePreview() {
  const quoteId = appState.orderFromQuoteDraft?.quote?.id || appState.selectedQuoteId;
  await baseSaveDraftOrderPreview();
  if (appState.currentView === "orders" || appState.currentView === "order-detail") {
    removeOrderPreviewFromQuote(quoteId);
    renderApp();
  }
};

if (document.getElementById("app")?.innerHTML) renderApp();