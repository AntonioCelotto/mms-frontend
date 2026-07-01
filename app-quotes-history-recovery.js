const QUOTE_HISTORY_RECOVERY_KEYS = [
  "mms.savedQuotes.v1",
  "mms.savedQuotes.light.v2",
  "mms_quotes",
  "mms.savedQuotes",
];

function quoteHistoryRecoveryReadKey(key) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function quoteHistoryRecoveryCandidateKeys() {
  const keys = new Set(QUOTE_HISTORY_RECOVERY_KEYS);
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (/quote|preventiv/i.test(key || "")) keys.add(key);
    }
  } catch (error) {
    return Array.from(keys);
  }
  return Array.from(keys);
}

function quoteHistoryRecoveryNormalize(quote) {
  if (!quote || typeof quote !== "object") return null;
  const id = String(quote.id || "").trim();
  const client = String(quote.client || quote.customer || quote.brand || "").trim();
  if (!id || !client) return null;
  return {
    ...quote,
    id,
    client,
    status: quote.status || "Bozza",
    articles: Array.isArray(quote.articles) ? quote.articles : [],
    photos: Array.isArray(quote.photos) ? quote.photos : [],
    createdAt: quote.createdAt || quote.quoteDate || "",
  };
}

function quoteHistoryRecoveryMerge(lists) {
  const byId = new Map();
  lists.flat().forEach((rawQuote) => {
    const quote = quoteHistoryRecoveryNormalize(rawQuote);
    if (!quote) return;
    const current = byId.get(quote.id) || {};
    byId.set(quote.id, {
      ...current,
      ...quote,
      articles: quote.articles?.length ? quote.articles : current.articles || [],
      photos: quote.photos?.length ? quote.photos : current.photos || [],
    });
  });
  return Array.from(byId.values()).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function quoteHistoryRecoveryMergeWithCurrent(current, storedLists) {
  const stored = quoteHistoryRecoveryMerge(storedLists);
  const currentQuotes = (Array.isArray(current) ? current : []).map(quoteHistoryRecoveryNormalize).filter(Boolean);
  return quoteHistoryRecoveryMerge([stored, currentQuotes]);
}

function quoteHistoryRecoveryLightCopy(quote) {
  return {
    ...quote,
    photos: Array.isArray(quote.photos)
      ? quote.photos.map((photo) => ({
          name: photo?.name || "Foto preventivo",
          size: photo?.size || 0,
          type: photo?.type || "",
          dataUrl: "",
        }))
      : [],
  };
}

function quoteHistoryRecoveryWrite(quotes) {
  try {
    window.localStorage.setItem("mms.savedQuotes.v1", JSON.stringify(quotes));
  } catch (error) {
    // Lo storico completo puo' superare lo spazio disponibile se contiene foto vecchie.
  }
  try {
    window.localStorage.setItem("mms.savedQuotes.light.v2", JSON.stringify(quotes.map(quoteHistoryRecoveryLightCopy)));
  } catch (error) {
    console.warn("Storico preventivi leggero non salvato", error);
  }
}

function quoteHistoryRecoveryHydrate() {
  if (typeof quoteListEnsureState !== "function") return false;
  quoteListEnsureState();
  const storedLists = quoteHistoryRecoveryCandidateKeys().map(quoteHistoryRecoveryReadKey);
  const merged = quoteHistoryRecoveryMergeWithCurrent(appState.savedQuotes || [], storedLists);
  if (!merged.length) return false;
  const before = (appState.savedQuotes || []).map((quote) => quote.id).join("|");
  appState.savedQuotes = merged;
  if (!appState.selectedQuoteId || !merged.some((quote) => quote.id === appState.selectedQuoteId)) {
    appState.selectedQuoteId = merged[0].id;
  }
  quoteHistoryRecoveryWrite(merged);
  return before !== merged.map((quote) => quote.id).join("|");
}

const baseQuoteListEnsureStateHistoryRecovery = quoteListEnsureState;
quoteListEnsureState = function quoteListEnsureStateWithHistoryRecovery() {
  baseQuoteListEnsureStateHistoryRecovery();
  if (quoteListEnsureState.historyRecoveryLoaded) return;
  quoteListEnsureState.historyRecoveryLoaded = true;
  quoteHistoryRecoveryHydrate();
};

const baseQuoteStorageWriteHistoryRecovery = typeof quoteStorageWrite === "function" ? quoteStorageWrite : null;
if (baseQuoteStorageWriteHistoryRecovery) {
  quoteStorageWrite = function quoteStorageWriteWithHistoryRecovery() {
    quoteHistoryRecoveryHydrate();
    baseQuoteStorageWriteHistoryRecovery();
    quoteHistoryRecoveryWrite(appState.savedQuotes || []);
  };
}

const baseRenderQuotesHistoryRecovery = typeof renderQuotes === "function" ? renderQuotes : null;
if (baseRenderQuotesHistoryRecovery) {
  renderQuotes = function renderQuotesWithHistoryRecovery() {
    quoteHistoryRecoveryHydrate();
    return baseRenderQuotesHistoryRecovery();
  };
}

if (quoteHistoryRecoveryHydrate() && document.getElementById("app")?.innerHTML) renderApp();
