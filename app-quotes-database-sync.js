(function () {
  const QUOTE_DATABASE_API = "/api/quotes";
  let quoteDatabaseLoaded = false;
  let quoteDatabaseLoading = false;
  let quoteDatabaseSaving = false;

  function quoteDatabaseNormalize(quote) {
    if (!quote || typeof quote !== "object") return null;
    const id = String(quote.id || quote.quote_number || "").trim();
    const client = String(quote.client || quote.client_name || "").trim();
    if (!id || !client) return null;
    return {
      ...quote,
      id,
      client,
      status: quote.status || "Bozza",
      articles: Array.isArray(quote.articles) ? quote.articles : [],
      photos: Array.isArray(quote.photos) ? quote.photos : [],
      createdAt: quote.createdAt || quote.created_at || quote.quoteDate || quote.quote_date || "",
      updatedAt: quote.updatedAt || quote.updated_at || "",
    };
  }

  function quoteDatabaseTime(quote) {
    return Date.parse(quote?.updatedAt || quote?.createdAt || quote?.quoteDate || "") || 0;
  }

  function quoteDatabasePhotoScore(photos) {
    return (Array.isArray(photos) ? photos : []).reduce((score, photo) => score + (photo?.dataUrl ? 2 : 1), 0);
  }

  function quoteDatabaseLightCopy(quote) {
    return {
      ...quote,
      photos: Array.isArray(quote.photos)
        ? quote.photos.map((photo) => ({
            name: photo?.name || "Foto preventivo",
            size: photo?.size || 0,
            type: photo?.type || "",
          }))
        : [],
    };
  }

  function quoteDatabaseMerge(localQuotes, remoteQuotes) {
    const byId = new Map();
    [...(Array.isArray(localQuotes) ? localQuotes : []), ...(Array.isArray(remoteQuotes) ? remoteQuotes : [])].forEach((rawQuote) => {
      const quote = quoteDatabaseNormalize(rawQuote);
      if (!quote) return;
      const current = byId.get(quote.id);
      if (!current || quoteDatabaseTime(quote) >= quoteDatabaseTime(current)) {
        byId.set(quote.id, {
          ...(current || {}),
          ...quote,
          articles: quote.articles?.length ? quote.articles : current?.articles || [],
          photos: quoteDatabasePhotoScore(quote.photos) >= quoteDatabasePhotoScore(current?.photos) ? quote.photos : current?.photos || [],
        });
      }
    });
    return Array.from(byId.values()).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }

  async function quoteDatabaseRequest(method, body) {
    const response = await fetch(QUOTE_DATABASE_API, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || payload.error || "Preventivi database non disponibili");
    return payload;
  }

  function quoteDatabaseWriteLocal() {
    if (typeof quoteHistoryRecoveryWrite === "function") quoteHistoryRecoveryWrite(appState.savedQuotes || []);
    if (typeof quoteStorageWrite === "function") quoteStorageWrite();
  }

  async function quoteDatabaseLoad({ rerender = false } = {}) {
    if (quoteDatabaseLoaded || quoteDatabaseLoading || typeof quoteListEnsureState !== "function") return;
    quoteDatabaseLoading = true;
    try {
      quoteListEnsureState();
      const payload = await quoteDatabaseRequest("GET");
      const merged = quoteDatabaseMerge(appState.savedQuotes || [], payload.quotes || []);
      if (merged.length) {
        const before = (appState.savedQuotes || []).map((quote) => quote.id).join("|");
        appState.savedQuotes = merged;
        if (!appState.selectedQuoteId || !merged.some((quote) => quote.id === appState.selectedQuoteId)) {
          appState.selectedQuoteId = merged[0].id;
        }
        quoteDatabaseWriteLocal();
        if (rerender && before !== merged.map((quote) => quote.id).join("|") && document.getElementById("app")?.innerHTML) {
          renderApp();
        }
      }
      quoteDatabaseLoaded = true;
    } catch (error) {
      console.warn("Storico preventivi database non caricato", error);
    } finally {
      quoteDatabaseLoading = false;
    }
  }

  async function quoteDatabaseSave(quote) {
    const normalized = quoteDatabaseNormalize(quote);
    if (!normalized || quoteDatabaseSaving) return;
    quoteDatabaseSaving = true;
    try {
      const payload = await quoteDatabaseRequest("POST", { quote: quoteDatabaseLightCopy(normalized) });
      if (payload.quote) {
        appState.savedQuotes = quoteDatabaseMerge(appState.savedQuotes || [], [payload.quote]);
        quoteDatabaseWriteLocal();
      }
    } catch (error) {
      console.warn("Preventivo non sincronizzato su database", error);
      setFlashMessage("Preventivo salvato localmente. Sincronizzazione database non riuscita, riprova tra poco.");
      if (document.getElementById("app")?.innerHTML) renderApp();
    } finally {
      quoteDatabaseSaving = false;
    }
  }

  const baseQuoteListEnsureStateDatabase = typeof quoteListEnsureState === "function" ? quoteListEnsureState : null;
  if (baseQuoteListEnsureStateDatabase) {
    quoteListEnsureState = function quoteListEnsureStateWithDatabase() {
      baseQuoteListEnsureStateDatabase();
      quoteDatabaseLoad({ rerender: true });
    };
  }

  const baseQuoteListSaveCurrentDatabase = typeof quoteListSaveCurrent === "function" ? quoteListSaveCurrent : null;
  if (baseQuoteListSaveCurrentDatabase) {
    quoteListSaveCurrent = function quoteListSaveCurrentWithDatabase() {
      baseQuoteListSaveCurrentDatabase();
      const quote = typeof quoteListFind === "function" ? quoteListFind(appState.selectedQuoteId) : null;
      quoteDatabaseSave(quote);
    };
  }

  const baseQuoteListSetStatusDatabase = typeof quoteListSetStatus === "function" ? quoteListSetStatus : null;
  if (baseQuoteListSetStatusDatabase) {
    quoteListSetStatus = function quoteListSetStatusWithDatabase(quoteId, status) {
      baseQuoteListSetStatusDatabase(quoteId, status);
      const quote = typeof quoteListFind === "function" ? quoteListFind(quoteId) : null;
      quoteDatabaseSave(quote);
    };
  }

  const baseQuoteListConvertToOrderDatabase = typeof quoteListConvertToOrder === "function" ? quoteListConvertToOrder : null;
  if (baseQuoteListConvertToOrderDatabase) {
    quoteListConvertToOrder = async function quoteListConvertToOrderWithDatabase(quoteId) {
      const result = baseQuoteListConvertToOrderDatabase(quoteId);
      if (result && typeof result.then === "function") await result;
      const quote = typeof quoteListFind === "function" ? quoteListFind(quoteId) : null;
      await quoteDatabaseSave(quote);
      return result;
    };
  }

  window.quoteDatabaseLoad = quoteDatabaseLoad;
  window.quoteDatabaseSave = quoteDatabaseSave;
  quoteDatabaseLoad({ rerender: true });
})();