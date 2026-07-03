(function () {
  function quoteResetToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function quoteResetDraft() {
    appState.draftOrder = {
      ...(appState.draftOrder || {}),
      client: "",
      category: "Sartoria interna",
      priority: "Standard",
      orderDate: quoteResetToday(),
      note: "",
    };
    appState.quoteArticles = [typeof emptyQuoteArticle === "function" ? emptyQuoteArticle() : { name: "", quantity: "1", cost: "", materials: [{ material: "", quantity: "", price: "" }] }];
    appState.quoteClientDraft = typeof emptyQuoteClientDraft === "function" ? emptyQuoteClientDraft() : { email: "", phone: "", vat: "", pec: "", address: "", paymentTerms: "", note: "" };
    appState.quotePhotos = [];
  }

  if (typeof quoteListSaveCurrent === "function") {
    const baseQuoteListSaveCurrentReset = quoteListSaveCurrent;
    quoteListSaveCurrent = function quoteListSaveCurrentAndReset() {
      const beforeIds = (appState.savedQuotes || []).map((quote) => quote.id).join("|");
      baseQuoteListSaveCurrentReset();
      const afterIds = (appState.savedQuotes || []).map((quote) => quote.id).join("|");
      if (beforeIds !== afterIds && appState.currentView === "quotes") {
        quoteResetDraft();
      }
    };
  }

  if (!window.__quoteResetFixHandlers) {
    window.__quoteResetFixHandlers = true;
    document.addEventListener(
      "click",
      (event) => {
        const trigger = event.target.closest?.("[data-open='new-order'], [data-nav='new-order']");
        if (!trigger || appState.currentView === "new-order") return;
        quoteResetDraft();
      },
      true
    );
  }

  window.quoteResetDraft = quoteResetDraft;
})();
