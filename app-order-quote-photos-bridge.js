(function () {
  const QUOTE_ORDER_PHOTOS_KEY = "mms.quoteOrderPhotos.v1";

  function text(value) {
    return String(value ?? "").trim();
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("Foto preventivo ordine non salvate localmente", error);
    }
  }

  function photoUrl(photo) {
    return photo?.dataUrl || photo?.url || photo?.localUrl || "";
  }

  function lightPhoto(photo, index) {
    const url = photoUrl(photo);
    if (!url) return null;
    return {
      name: photo.name || `Foto preventivo ${index + 1}`,
      size: photo.size || 0,
      type: photo.type || "image/jpeg",
      dataUrl: url,
      url,
      localUrl: url,
      fromQuote: true,
    };
  }

  function quotePhotos(quote) {
    return (Array.isArray(quote?.photos) ? quote.photos : []).map(lightPhoto).filter(Boolean);
  }

  function savedQuotesWithFullPhotos() {
    const lists = [
      appState.savedQuotes || [],
      readJson("mms.savedQuotes.v1", []),
      readJson("mms.savedQuotes.light.v2", []),
      readJson("mms.savedQuotes", []),
      readJson("mms_quotes", []),
    ];
    return lists.flat().filter((quote) => quote && typeof quote === "object");
  }

  function hydrateQuotePhotos(quote) {
    if (!quote || typeof quote !== "object") return quote;
    if (quotePhotos(quote).length) return quote;
    const quoteId = text(quote.id || quote.quote_number);
    const currentDraftPhotos = Array.isArray(appState.quotePhotos) ? appState.quotePhotos.map(lightPhoto).filter(Boolean) : [];
    const matched = savedQuotesWithFullPhotos().find((candidate) => text(candidate.id || candidate.quote_number) === quoteId && quotePhotos(candidate).length);
    const photos = matched ? quotePhotos(matched) : currentDraftPhotos;
    if (photos.length) quote.photos = photos;
    return quote;
  }

  function attachmentFromPhoto(photo, index) {
    const url = photoUrl(photo);
    if (!url) return null;
    return {
      name: photo.name || `Foto preventivo ${index + 1}`,
      size: photo.size || 0,
      sizeLabel: typeof formatAttachmentSize === "function" ? formatAttachmentSize(photo.size || 0) : "",
      type: photo.type || "image/jpeg",
      localUrl: url,
      url,
      persisted: false,
      fromQuote: true,
    };
  }

  function mergeOrderPhotos(displayId, photos) {
    if (!displayId || !photos.length || typeof ensureOrderAttachmentState !== "function") return;
    ensureOrderAttachmentState();
    const attachments = photos.map(attachmentFromPhoto).filter(Boolean);
    if (!attachments.length) return;
    const current = appState.orderAttachments[displayId] || [];
    const merged = [...current];
    attachments.forEach((attachment) => {
      const url = attachment.url || attachment.localUrl || "";
      const exists = merged.some((item) => (item.url || item.localUrl || "") === url || ((item.name || "") === attachment.name && (item.size || 0) === attachment.size));
      if (!exists) merged.push(attachment);
    });
    appState.orderAttachments[displayId] = merged;
    appState.loadedOrderAttachmentIds[displayId] = true;
    const order = appData.orders?.find((item) => Number(item.id) === Number(displayId));
    if (order) order.files = Math.max(Number(order.files || 0), merged.length);
  }

  function storedPhotoMap() {
    return readJson(QUOTE_ORDER_PHOTOS_KEY, {});
  }

  function saveOrderPhotos(displayId, quoteId, photos) {
    if (!displayId || !photos.length) return;
    const map = storedPhotoMap();
    map[String(displayId)] = { quoteId: quoteId || "", photos };
    writeJson(QUOTE_ORDER_PHOTOS_KEY, map);
  }

  function photosForOrder(order) {
    const displayId = Number(order?.id || appState.selectedOrderId || 0);
    const mapEntry = storedPhotoMap()[String(displayId)];
    if (mapEntry?.photos?.length) return mapEntry.photos.map(lightPhoto).filter(Boolean);
    const quoteId = order?.sourceQuoteId || appState.orderQuoteSourceByOrderId?.[displayId];
    if (quoteId && typeof quoteListFind === "function") return quotePhotos(hydrateQuotePhotos(quoteListFind(quoteId)));
    return quotePhotos(hydrateQuotePhotos(appState.orderFromQuoteDraft?.quote));
  }

  const baseQuoteListConvertToOrderPhotoBridge = typeof quoteListConvertToOrder === "function" ? quoteListConvertToOrder : null;
  if (baseQuoteListConvertToOrderPhotoBridge) {
    quoteListConvertToOrder = async function quoteListConvertToOrderWithPhotoBridge(quoteId) {
      const quote = typeof quoteListFind === "function" ? hydrateQuotePhotos(quoteListFind(quoteId)) : null;
      const result = baseQuoteListConvertToOrderPhotoBridge(quoteId);
      if (result && typeof result.then === "function") await result;
      if (appState.orderFromQuoteDraft?.quote) hydrateQuotePhotos(appState.orderFromQuoteDraft.quote);
      const photos = quotePhotos(appState.orderFromQuoteDraft?.quote || quote);
      if (photos.length) {
        appState.draftOrderAttachments = photos.map(attachmentFromPhoto).filter(Boolean);
      }
      return result;
    };
  }

  const baseSaveDraftOrderPhotoBridge = saveDraftOrder;
  saveDraftOrder = async function saveDraftOrderWithQuotePhotosBridge() {
    const quote = hydrateQuotePhotos(appState.orderFromQuoteDraft?.quote || null);
    const quoteId = quote?.id || appState.selectedQuoteId || "";
    const photos = quotePhotos(quote);
    if (photos.length) appState.draftOrderAttachments = photos.map(attachmentFromPhoto).filter(Boolean);
    await baseSaveDraftOrderPhotoBridge();
    const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
    const displayId = Number(order?.id || appState.selectedOrderId || 0);
    if (displayId && photos.length) {
      mergeOrderPhotos(displayId, photos);
      saveOrderPhotos(displayId, quoteId, photos);
      if (appState.orderQuoteSourceByOrderId) appState.orderQuoteSourceByOrderId[displayId] = quoteId;
      renderApp();
    }
  };

  const baseRenderAppPhotoBridge = renderApp;
  renderApp = function renderAppQuotePhotosBridge() {
    if (appState.currentView === "order-detail") {
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const photos = photosForOrder(order);
      if (order && photos.length) mergeOrderPhotos(Number(order.id), photos);
    }
    baseRenderAppPhotoBridge();
  };

  if (document.getElementById("app")?.innerHTML) renderApp();
})();
