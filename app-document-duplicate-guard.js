(function () {
  async function check(quoteNumber) {
    const response = await fetch(`/api/document-check?quote_number=${encodeURIComponent(quoteNumber)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Controllo duplicati non disponibile");
    return payload;
  }

  const saveQuote = quoteListSaveCurrent;
  quoteListSaveCurrent = async function saveNewQuoteWithDuplicateCheck(...args) {
    if (appState.editingQuoteId) return saveQuote(...args);
    const snapshot = typeof quoteListSnapshot === "function" ? quoteListSnapshot() : null;
    if (!snapshot?.id || !snapshot?.client) return saveQuote(...args);
    try {
      const existing = await check(snapshot.id);
      if (existing.quote_exists) {
        setFlashMessage(`Preventivo ${snapshot.id} già presente: apri il documento esistente prima di modificarlo.`);
        return;
      }
    } catch (error) {
      setFlashMessage(`Salvataggio sospeso: ${error.message}`);
      return;
    }
    return saveQuote(...args);
  };

  // The server enforces this too, including the race between the preflight
  // and the actual insert. Keep a stale screen from claiming a second order.
  const saveOrder = saveDraftOrder;
  saveDraftOrder = async function saveOrderWithDuplicateCheck(...args) {
    const source = String(appState.draftOrder?.sourceQuoteNumber || "").trim();
    if (source) {
      try {
        const existing = await check(source);
        if (existing.order) {
          await refreshBootstrap();
          const order = (appData.orders || []).find((row) =>
            Number(row.db_id || row.internal_id || row.id) === Number(existing.order.id));
          if (order) {
            appState.selectedOrderId = order.id;
            appState.currentView = "order-detail";
          }
          setFlashMessage(`Il preventivo ${source} è già collegato all'ordine ${existing.order.order_number || existing.order.id}.`);
          return;
        }
      } catch (error) {
        setFlashMessage(`Salvataggio sospeso: ${error.message}`);
        return;
      }
    }
    return saveOrder(...args);
  };
})();
