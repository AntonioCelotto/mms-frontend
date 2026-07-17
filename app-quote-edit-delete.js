(function () {
  const QUOTES_API = "/api/quotes";

  function text(value) {
    return String(value ?? "").trim();
  }

  function clone(value, fallback) {
    try {
      return JSON.parse(JSON.stringify(value ?? fallback));
    } catch (error) {
      return fallback;
    }
  }

  function writeQuotesLocal() {
    if (typeof quoteHistoryRecoveryWrite === "function") quoteHistoryRecoveryWrite(appState.savedQuotes || []);
    if (typeof quoteStorageWrite === "function") quoteStorageWrite();
  }

  function quoteById(id) {
    return typeof quoteListFind === "function" ? quoteListFind(id) : (appState.savedQuotes || []).find((quote) => quote.id === id);
  }

  function resetEditingState() {
    appState.editingQuoteId = "";
  }

  function editQuote(id) {
    const quote = quoteById(id);
    if (!quote) return;
    appState.editingQuoteId = quote.id;
    appState.draftOrder = {
      ...(appState.draftOrder || {}),
      client: quote.client || "",
      category: quote.category || "Sartoria interna",
      priority: quote.priority || "Standard",
      orderDate: quote.quoteDate || new Date().toISOString().slice(0, 10),
      note: quote.note || "",
    };
    appState.quoteArticles = clone(quote.articles, []);
    if (!Array.isArray(appState.quoteArticles) || !appState.quoteArticles.length) {
      appState.quoteArticles = [typeof emptyQuoteArticle === "function" ? emptyQuoteArticle() : { name: "", quantity: "1", cost: "", materials: [{ material: "", quantity: "", price: "" }] }];
    }
    appState.quoteClientDraft = clone(quote.clientInfo, typeof emptyQuoteClientDraft === "function" ? emptyQuoteClientDraft() : {});
    appState.quotePhotos = clone(quote.photos, []);
    appState.currentView = "new-order";
    setFlashMessage(`Modifica preventivo ${quote.id}`);
    renderApp();
  }

  async function deleteQuote(id) {
    const quote = quoteById(id);
    if (!quote || !window.confirm(`Eliminare definitivamente il preventivo ${quote.id}?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`${QUOTES_API}?id=${encodeURIComponent(quote.id)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.error || "Preventivo non eliminato");
      appState.savedQuotes = (appState.savedQuotes || []).filter((item) => item.id !== quote.id);
      if (appState.selectedQuoteId === quote.id) appState.selectedQuoteId = appState.savedQuotes[0]?.id || "";
      if (appState.editingQuoteId === quote.id) resetEditingState();
      writeQuotesLocal();
      setFlashMessage(`Preventivo ${quote.id} eliminato`);
    } catch (error) {
      setFlashMessage(error.message || "Preventivo non eliminato");
    } finally {
      appState.busy = false;
      renderApp();
    }
  }

  if (typeof quoteListSaveCurrent === "function") {
    const baseQuoteListSaveCurrent = quoteListSaveCurrent;
    quoteListSaveCurrent = function quoteListSaveCurrentWithEdit() {
      const editingId = text(appState.editingQuoteId);
      if (!editingId) return baseQuoteListSaveCurrent();

      if (typeof ensureQuoteState === "function") ensureQuoteState();
      const quote = quoteById(editingId);
      if (!quote) {
        resetEditingState();
        return baseQuoteListSaveCurrent();
      }

      const client = text(appState.draftOrder?.client);
      if (!client) {
        setFlashMessage("Inserisci almeno il cliente prima di salvare il preventivo");
        renderApp();
        return;
      }

      quote.client = client;
      quote.clientInfo = clone(appState.quoteClientDraft, {});
      quote.category = appState.draftOrder.category || "Sartoria interna";
      quote.priority = appState.draftOrder.priority || "Standard";
      quote.quoteDate = appState.draftOrder.orderDate || new Date().toISOString().slice(0, 10);
      quote.note = appState.draftOrder.note || "";
      quote.articles = clone(appState.quoteArticles, []);
      quote.photos = clone(appState.quotePhotos, quote.photos || []);
      quote.total = typeof quoteGrandTotal === "function" ? quoteGrandTotal() : quote.total || 0;
      quote.updatedAt = new Date().toISOString();
      appState.selectedQuoteId = quote.id;
      appState.currentView = "quotes";
      resetEditingState();
      writeQuotesLocal();
      if (typeof window.quoteDatabaseSave === "function") window.quoteDatabaseSave(quote);
      setFlashMessage(`Preventivo ${quote.id} aggiornato`);
      renderApp();
    };
  }

  function ensureQuoteActionStyle() {
    if (document.getElementById("quote-edit-delete-style")) return;
    const style = document.createElement("style");
    style.id = "quote-edit-delete-style";
    style.textContent = `
      .mini-btn.danger-btn{border-color:rgba(185,28,28,.28)!important;color:#991b1b!important;background:#fff5f5!important}
      .mini-btn.danger-btn:hover{background:#fee2e2!important}
    `;
    document.head.appendChild(style);
  }

  function addButtonsNear(anchor, quoteId) {
    if (!anchor || !quoteId) return;
    const container = anchor.closest(".pill-row") || anchor.parentElement;
    if (!container || Array.from(container.querySelectorAll("[data-quote-edit]")).some((button) => button.dataset.quoteEdit === quoteId)) return;
    anchor.insertAdjacentHTML(
      "afterend",
      `<button class="mini-btn" data-quote-edit="${quoteHtml(quoteId)}" type="button">Modifica</button><button class="mini-btn danger-btn" data-quote-delete="${quoteHtml(quoteId)}" type="button">Elimina</button>`
    );
  }

  function mountQuoteActionButtons() {
    if (appState.currentView !== "quotes") return;
    ensureQuoteActionStyle();
    document.querySelectorAll("[data-quote-pdf]").forEach((button) => addButtonsNear(button, button.dataset.quotePdf));
  }

  const baseRenderAppQuoteEditDelete = renderApp;
  renderApp = function renderAppQuoteEditDelete() {
    baseRenderAppQuoteEditDelete();
    mountQuoteActionButtons();
  };

  document.addEventListener(
    "click",
    (event) => {
      const editButton = event.target.closest?.("[data-quote-edit]");
      if (editButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        editQuote(editButton.dataset.quoteEdit);
        return;
      }

      const deleteButton = event.target.closest?.("[data-quote-delete]");
      if (deleteButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        deleteQuote(deleteButton.dataset.quoteDelete);
        return;
      }

      const newQuoteButton = event.target.closest?.("[data-open='new-order'], [data-nav='new-order']");
      if (newQuoteButton && !event.target.closest?.("[data-quote-edit]")) {
        resetEditingState();
      }
    },
    true
  );

  if (document.getElementById("app")?.innerHTML) mountQuoteActionButtons();
})();