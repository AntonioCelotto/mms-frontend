const QUOTE_STORAGE_KEY = "mms.savedQuotes.v1";

function quoteStorageRead() {
  try {
    const raw = window.localStorage.getItem(QUOTE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function quoteStorageWrite() {
  try {
    quoteListEnsureState();
    window.localStorage.setItem(QUOTE_STORAGE_KEY, JSON.stringify(appState.savedQuotes || []));
  } catch (error) {
    setFlashMessage("Preventivo salvato nella sessione, ma il browser non ha permesso il salvataggio locale.");
  }
}

function quoteStorageHydrate() {
  quoteListEnsureState();
  const saved = quoteStorageRead();
  if (!saved.length) return;
  const existingIds = new Set((appState.savedQuotes || []).map((quote) => quote.id));
  const missing = saved.filter((quote) => quote?.id && !existingIds.has(quote.id));
  if (missing.length) appState.savedQuotes = [...appState.savedQuotes, ...missing];
  if (!appState.selectedQuoteId && appState.savedQuotes[0]) appState.selectedQuoteId = appState.savedQuotes[0].id;
}

const baseQuoteListEnsureStatePersistence = quoteListEnsureState;
quoteListEnsureState = function quoteListEnsureStateWithStorage() {
  baseQuoteListEnsureStatePersistence();
  if (quoteListEnsureState.storageLoaded) return;
  quoteListEnsureState.storageLoaded = true;
  const saved = quoteStorageRead();
  if (saved.length && !appState.savedQuotes.length) {
    appState.savedQuotes = saved;
    appState.selectedQuoteId = appState.selectedQuoteId || saved[0].id;
  }
};

const baseQuoteListSaveCurrentPersistence = quoteListSaveCurrent;
quoteListSaveCurrent = function quoteListSaveCurrentWithStorage() {
  baseQuoteListSaveCurrentPersistence();
  quoteStorageWrite();
};

const baseQuoteListSetStatusPersistence = quoteListSetStatus;
quoteListSetStatus = function quoteListSetStatusWithStorage(quoteId, status) {
  baseQuoteListSetStatusPersistence(quoteId, status);
  quoteStorageWrite();
};

const baseQuoteListConvertToOrderPersistence = quoteListConvertToOrder;
quoteListConvertToOrder = async function quoteListConvertToOrderWithStorage(quoteId) {
  const result = baseQuoteListConvertToOrderPersistence(quoteId);
  if (result && typeof result.then === "function") await result;
  quoteStorageWrite();
  return result;
};

quoteStorageHydrate();
if (document.getElementById("app")?.innerHTML) renderApp();