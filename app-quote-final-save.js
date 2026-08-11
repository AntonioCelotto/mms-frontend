(function () {
  const SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";
  const SELECT =
    "id,quote_number,client_name,category,priority,quote_date,status,note,subtotal,discount_type,discount_value,discount_amount,taxable_amount,vat_rate,vat_amount,total,payload,created_at,updated_at";

  function text(value) {
    return String(value ?? "").trim();
  }

  function number(value) {
    const parsed = Number(String(value ?? "0").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function round(value) {
    return Math.round((number(value) + Number.EPSILON) * 100) / 100;
  }

  function clone(value, fallback) {
    try {
      return JSON.parse(JSON.stringify(value ?? fallback));
    } catch (error) {
      return fallback;
    }
  }

  function articleSubtotal(articles) {
    return round(
      articles.reduce((sum, article) => {
        const base = number(article.quantity || 1) * number(article.cost);
        const materials = (Array.isArray(article.materials) ? article.materials : []).reduce(
          (materialSum, material) => materialSum + number(material.quantity) * number(material.price),
          0
        );
        return sum + base + materials;
      }, 0)
    );
  }

  function totals(articles) {
    const subtotal = articleSubtotal(articles);
    const draft = appState.quoteDiscountDraft || {};
    const rawType = text(draft.type).toLowerCase();
    const discountType = ["percentage", "fixed"].includes(rawType) ? rawType : "none";
    let discountValue = Math.max(0, round(draft.value));
    let discountAmount = 0;
    if (discountType === "percentage") {
      discountValue = Math.min(discountValue, 100);
      discountAmount = round((subtotal * discountValue) / 100);
    } else if (discountType === "fixed") {
      discountAmount = Math.min(discountValue, subtotal);
    } else {
      discountValue = 0;
    }
    const taxableAmount = round(subtotal - discountAmount);
    const vatRate = 22;
    const vatAmount = round((taxableAmount * vatRate) / 100);
    return {
      subtotal,
      discountType,
      discountValue,
      discountAmount,
      taxableAmount,
      vatRate,
      vatAmount,
      total: round(taxableAmount + vatAmount),
    };
  }

  async function token() {
    try {
      const session = await window.mmsSupabaseAuth?.auth?.getSession?.();
      return session?.data?.session?.access_token || SUPABASE_ANON_KEY;
    } catch (error) {
      return SUPABASE_ANON_KEY;
    }
  }

  function localWrite() {
    if (typeof quoteHistoryRecoveryWrite === "function") quoteHistoryRecoveryWrite(appState.savedQuotes || []);
    if (typeof quoteStorageWrite === "function") quoteStorageWrite();
  }

  function shapedQuote(row, fallback) {
    const stored = row?.payload && typeof row.payload === "object" ? row.payload : fallback;
    return {
      ...stored,
      id: row.quote_number || stored.id,
      client: row.client_name || stored.client,
      category: row.category || stored.category || "",
      priority: row.priority || stored.priority || "",
      quoteDate: row.quote_date || stored.quoteDate || "",
      status: row.status || stored.status || "Bozza",
      note: row.note ?? stored.note ?? "",
      subtotal: Number(row.subtotal ?? stored.subtotal ?? 0),
      discountType: row.discount_type || stored.discountType || "none",
      discountValue: Number(row.discount_value ?? stored.discountValue ?? 0),
      discountAmount: Number(row.discount_amount ?? stored.discountAmount ?? 0),
      taxableAmount: Number(row.taxable_amount ?? stored.taxableAmount ?? 0),
      vatRate: Number(row.vat_rate ?? stored.vatRate ?? 0),
      vatAmount: Number(row.vat_amount ?? stored.vatAmount ?? 0),
      total: Number(row.total ?? stored.total ?? 0),
      articles: Array.isArray(stored.articles) ? stored.articles : [],
      photos: Array.isArray(stored.photos) ? stored.photos : [],
      createdAt: stored.createdAt || row.created_at || "",
      updatedAt: row.updated_at || stored.updatedAt || "",
    };
  }

  const previousSave = typeof quoteListSaveCurrent === "function" ? quoteListSaveCurrent : null;
  quoteListSaveCurrent = async function quoteListSaveCurrentConfirmed() {
    const editingId = text(appState.editingQuoteId);
    if (!editingId) return previousSave?.();
    if (appState.busy) return;

    if (typeof ensureQuoteState === "function") ensureQuoteState();
    const client = text(appState.draftOrder?.client);
    if (!client) {
      setFlashMessage("Inserisci il cliente prima di salvare il preventivo");
      renderApp();
      return;
    }

    const articles = clone(appState.quoteArticles, []);
    const values = totals(articles);
    const current =
      (typeof quoteListFind === "function" ? quoteListFind(editingId) : null) ||
      (appState.savedQuotes || []).find((quote) => quote.id === editingId) ||
      {};
    const photos = (Array.isArray(appState.quotePhotos) ? appState.quotePhotos : current.photos || []).map(
      (photo) => ({ name: photo?.name || "Foto preventivo", size: photo?.size || 0, type: photo?.type || "" })
    );
    const quote = {
      ...current,
      id: editingId,
      client,
      clientInfo: clone(appState.quoteClientDraft, {}),
      category: appState.draftOrder.category || "Sartoria interna",
      priority: appState.draftOrder.priority || "Standard",
      quoteDate: appState.draftOrder.orderDate || new Date().toISOString().slice(0, 10),
      note: appState.draftOrder.note || "",
      status: current.status || "Bozza",
      articles,
      photos,
      ...values,
      updatedAt: new Date().toISOString(),
    };
    const row = {
      quote_number: editingId,
      client_name: client,
      category: quote.category,
      priority: quote.priority,
      quote_date: quote.quoteDate,
      status: quote.status,
      note: quote.note || null,
      subtotal: values.subtotal,
      discount_type: values.discountType,
      discount_value: values.discountValue,
      discount_amount: values.discountAmount,
      taxable_amount: values.taxableAmount,
      vat_rate: values.vatRate,
      vat_amount: values.vatAmount,
      total: values.total,
      payload: quote,
    };

    appState.busy = true;
    setFlashMessage(`Salvataggio ${editingId} nel database...`);
    renderApp();
    try {
      const authToken = await token();
      const response = await window.fetch(
        `${SUPABASE_URL}/rest/v1/quotes?quote_number=${encodeURIComponent(`eq.${editingId}`)}&select=${encodeURIComponent(SELECT)}`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(row),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.details || payload.hint || payload.error || "Salvataggio non riuscito");
      }
      if (!Array.isArray(payload) || !payload.length) throw new Error("Preventivo non trovato nel database");

      const saved = shapedQuote(payload[0], quote);
      const index = (appState.savedQuotes || []).findIndex((item) => item.id === editingId);
      if (index >= 0) appState.savedQuotes[index] = saved;
      else appState.savedQuotes.unshift(saved);
      appState.selectedQuoteId = editingId;
      appState.editingQuoteId = "";
      appState.currentView = "quotes";
      localWrite();
      const materialCount = saved.articles.reduce(
        (sum, article) => sum + (Array.isArray(article.materials) ? article.materials.length : 0),
        0
      );
      setFlashMessage(
        `Preventivo ${editingId} salvato nel database: ${saved.articles.length} articoli e ${materialCount} materiali.`
      );
    } catch (error) {
      appState.currentView = "new-order";
      setFlashMessage(error.message || "Preventivo non salvato. I dati restano aperti.");
    } finally {
      appState.busy = false;
      renderApp();
    }
  };
})();
