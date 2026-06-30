const QUOTE_STORAGE_LIGHT_KEY = "mms.savedQuotes.light.v2";

function quoteStorageLightPhoto(photo) {
  return {
    name: photo?.name || "Foto preventivo",
    size: photo?.size || 0,
    type: photo?.type || "",
    dataUrl: "",
  };
}

function quoteStorageLightCopy(quote) {
  return {
    ...quote,
    photos: Array.isArray(quote.photos) ? quote.photos.map(quoteStorageLightPhoto) : [],
  };
}

function quoteStorageReadLight() {
  try {
    const raw = window.localStorage.getItem(QUOTE_STORAGE_LIGHT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function quoteStorageWriteLight() {
  try {
    quoteListEnsureState();
    const lightweight = (appState.savedQuotes || []).map(quoteStorageLightCopy);
    window.localStorage.setItem(QUOTE_STORAGE_LIGHT_KEY, JSON.stringify(lightweight));
  } catch (error) {
    setFlashMessage("Storico preventivi non salvato: controlla spazio o permessi del browser.");
  }
}

function quoteStorageMergeById(current, saved) {
  const byId = new Map();
  [...saved, ...current].forEach((quote) => {
    if (quote?.id) byId.set(quote.id, { ...(byId.get(quote.id) || {}), ...quote });
  });
  return Array.from(byId.values()).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function quoteStorageHydrateLight() {
  quoteListEnsureState();
  const saved = quoteStorageReadLight();
  if (!saved.length) return;
  appState.savedQuotes = quoteStorageMergeById(appState.savedQuotes || [], saved);
  if (!appState.selectedQuoteId && appState.savedQuotes[0]) appState.selectedQuoteId = appState.savedQuotes[0].id;
}

const baseQuoteStorageReadV2 = quoteStorageRead;
quoteStorageRead = function quoteStorageReadWithLightFallback() {
  const full = baseQuoteStorageReadV2();
  return full.length ? full : quoteStorageReadLight();
};

quoteStorageWrite = function quoteStorageWriteWithLightFallback() {
  try {
    quoteListEnsureState();
    window.localStorage.setItem(QUOTE_STORAGE_KEY, JSON.stringify(appState.savedQuotes || []));
  } catch (error) {
    quoteStorageWriteLight();
    return;
  }
  quoteStorageWriteLight();
};

const baseQuoteListSaveCurrentV2 = quoteListSaveCurrent;
quoteListSaveCurrent = function quoteListSaveCurrentPersistentHistory() {
  baseQuoteListSaveCurrentV2();
  quoteStorageWrite();
};

const baseQuoteListSetStatusV2 = quoteListSetStatus;
quoteListSetStatus = function quoteListSetStatusPersistentHistory(quoteId, status) {
  baseQuoteListSetStatusV2(quoteId, status);
  quoteStorageWrite();
};

const baseQuoteListConvertToOrderV2Persistence = quoteListConvertToOrder;
quoteListConvertToOrder = async function quoteListConvertToOrderPersistentHistory(quoteId) {
  const result = baseQuoteListConvertToOrderV2Persistence(quoteId);
  if (result && typeof result.then === "function") await result;
  quoteStorageWrite();
  return result;
};

quoteStorageHydrateLight();
if (document.getElementById("app")?.innerHTML) renderApp();