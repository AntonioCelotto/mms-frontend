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

  function lightQuoteCopy(quote) {
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

  function quoteLooksLikePlaceholder() {
    const client = text(appState.draftOrder?.client).toUpperCase();
    const articles = Array.isArray(appState.quoteArticles) ? appState.quoteArticles : [];
    const hasMeaningfulArticle = articles.some((article) => {
      const name = text(article?.name);
      const hasNamedArticle = name && name.toLowerCase() !== "articolo 1";
      const hasValue = Number(String(article?.cost || "0").replace(",", ".")) > 0;
      const hasMaterial = (Array.isArray(article?.materials) ? article.materials : []).some(
        (material) => text(material?.material) || Number(String(material?.price || "0").replace(",", ".")) > 0
      );
      return hasNamedArticle || hasValue || hasMaterial;
    });
    return client === "ROBY" && !hasMeaningfulArticle;
  }

  async function patchQuote(id, quote) {
    const response = await fetch(QUOTES_API, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, quote: lightQuoteCopy({ ...quote, id }) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || payload.error || "Preventivo non aggiornato");
    return payload.quote || null;
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
    quoteListSaveCurrent = async function quoteListSaveCurrentWithEdit() {
      const editingId = text(appState.editingQuoteId);
      if (!editingId) {
        if (quoteLooksLikePlaceholder()) {
          const confirmed = window.confirm(
            "Il preventivo sembra ancora incompleto: cliente ROBY, totale zero, articolo generico e nessun materiale. Salvarlo comunque?"
          );
          if (!confirmed) {
            setFlashMessage("Salvataggio annullato: completa cliente, articolo, importi o materiali.");
            renderApp();
            return;
          }
        }
        return baseQuoteListSaveCurrent();
      }

      if (typeof ensureQuoteState === "function") ensureQuoteState();
      const quote = quoteById(editingId);
      if (!quote) {
        setFlashMessage(`Il preventivo ${editingId} non e' piu' disponibile. Riaprilo dall'archivio.`);
        appState.currentView = "quotes";
        resetEditingState();
        renderApp();
        return;
      }

      const client = text(appState.draftOrder?.client);
      if (!client) {
        setFlashMessage("Inserisci almeno il cliente prima di aggiornare il preventivo");
        renderApp();
        return;
      }

      const updatedQuote = {
        ...quote,
        id: editingId,
        client,
        clientInfo: clone(appState.quoteClientDraft, {}),
        category: appState.draftOrder.category || "Sartoria interna",
        priority: appState.draftOrder.priority || "Standard",
        quoteDate: appState.draftOrder.orderDate || new Date().toISOString().slice(0, 10),
        note: appState.draftOrder.note || "",
        articles: clone(appState.quoteArticles, []),
        photos: clone(appState.quotePhotos, quote.photos || []),
        total: typeof quoteGrandTotal === "function" ? quoteGrandTotal() : quote.total || 0,
        updatedAt: new Date().toISOString(),
      };

      appState.busy = true;
      setFlashMessage(`Aggiornamento ${editingId} in corso...`);
      renderApp();
      try {
        const remoteQuote = await patchQuote(editingId, updatedQuote);
        const savedQuote = {
          ...updatedQuote,
          ...(remoteQuote || {}),
          id: editingId,
          photos: updatedQuote.photos,
        };
        const index = (appState.savedQuotes || []).findIndex((item) => item.id === editingId);
        if (index >= 0) appState.savedQuotes[index] = savedQuote;
        appState.selectedQuoteId = editingId;
        appState.currentView = "quotes";
        resetEditingState();
        writeQuotesLocal();
        setFlashMessage(`Preventivo ${editingId} aggiornato nel database`);
      } catch (error) {
        appState.currentView = "new-order";
        setFlashMessage(error.message || `Preventivo ${editingId} non aggiornato. I dati restano aperti per riprovare.`);
      } finally {
        appState.busy = false;
        renderApp();
      }
    };
  }

  function ensureQuoteActionStyle() {
    if (document.getElementById("quote-edit-delete-style")) return;
    const style = document.createElement("style");
    style.id = "quote-edit-delete-style";
    style.textContent = `
      .mini-btn.danger-btn{border-color:rgba(185,28,28,.28)!important;color:#991b1b!important;background:#fff5f5!important}
      .mini-btn.danger-btn:hover{background:#fee2e2!important}
      .quote-edit-save-dock{position:fixed;right:24px;bottom:24px;z-index:120;display:flex;justify-content:flex-end;pointer-events:none}
      .quote-edit-save-dock .action-pill{min-height:48px;padding:13px 20px;font-weight:700;box-shadow:0 14px 34px rgba(229,12,57,.34);pointer-events:auto}
      @media (max-width:760px){
        .quote-edit-save-dock{left:12px;right:12px;bottom:12px}
        .quote-edit-save-dock .action-pill{width:100%}
      }
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

  function mountEditingLabels() {
    const editingId = text(appState.editingQuoteId);
    if (!editingId || appState.currentView !== "new-order") return;
    const view = document.querySelector(".view.active");
    const title = view?.querySelector(".screen-header h2");
    const description = view?.querySelector(".screen-header p");
    if (title) title.textContent = `Modifica preventivo ${editingId}`;
    if (description) description.textContent = "Aggiorna il preventivo esistente. Il numero resta invariato e tornerai all'archivio solo dopo il salvataggio nel database.";
    view?.querySelectorAll("[data-action='save-quote']").forEach((button) => {
      button.textContent = appState.busy ? "Aggiornamento..." : `Aggiorna ${editingId}`;
    });
    if (view && !view.querySelector("[data-quote-edit-save]")) {
      view.insertAdjacentHTML(
        "beforeend",
        `<div class="quote-edit-save-dock"><button class="action-pill" data-quote-edit-save type="button" ${appState.busy ? "disabled" : ""}>${appState.busy ? "Aggiornamento..." : `Aggiorna ${quoteHtml(editingId)}`}</button></div>`
      );
    }
  }

  const baseRenderAppQuoteEditDelete = renderApp;
  renderApp = function renderAppQuoteEditDelete() {
    baseRenderAppQuoteEditDelete();
    mountEditingLabels();
    mountQuoteActionButtons();
  };

  document.addEventListener(
    "click",
    (event) => {
      const editSaveButton = event.target.closest?.("[data-quote-edit-save]");
      if (editSaveButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!appState.busy && typeof quoteListSaveCurrent === "function") quoteListSaveCurrent();
        return;
      }

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