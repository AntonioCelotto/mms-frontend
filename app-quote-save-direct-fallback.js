(function () {
  const QUOTES_API_PATH = "/api/quotes";
  const SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";
  const QUOTE_SELECT = "id,quote_number,client_name,category,priority,quote_date,status,note,subtotal,discount_type,discount_value,discount_amount,taxable_amount,vat_rate,vat_amount,total,payload,created_at,updated_at";

  function isQuotePatch(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    return (url === QUOTES_API_PATH || url.endsWith(QUOTES_API_PATH)) && String(init?.method || "GET").toUpperCase() === "PATCH";
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  function amount(value) {
    const parsed = Number(String(value ?? "0").replace(",", "."));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
  }

  function quoteValues(quote) {
    const subtotal = amount(quote.subtotal ?? quote.total);
    const rawType = clean(quote.discountType || quote.discount_type).toLowerCase();
    const discountType = ["percentage", "fixed"].includes(rawType) ? rawType : "none";
    let discountValue = Math.max(0, amount(quote.discountValue ?? quote.discount_value));
    let discountAmount = 0;
    if (discountType === "percentage") {
      discountValue = Math.min(discountValue, 100);
      discountAmount = amount((subtotal * discountValue) / 100);
    } else if (discountType === "fixed") {
      discountAmount = Math.min(discountValue, subtotal);
    } else {
      discountValue = 0;
    }
    const taxableAmount = amount(subtotal - discountAmount);
    const vatRate = Math.min(100, Math.max(0, amount(quote.vatRate ?? quote.vat_rate ?? 22)));
    const vatAmount = amount((taxableAmount * vatRate) / 100);
    return {
      subtotal,
      discountType,
      discountValue,
      discountAmount,
      taxableAmount,
      vatRate,
      vatAmount,
      total: amount(taxableAmount + vatAmount),
    };
  }

  async function sessionToken() {
    try {
      const session = await window.mmsSupabaseAuth?.auth?.getSession?.();
      return session?.data?.session?.access_token || SUPABASE_ANON_KEY;
    } catch (error) {
      return SUPABASE_ANON_KEY;
    }
  }

  function shapeQuote(row, fallback) {
    const stored = row?.payload && typeof row.payload === "object" ? row.payload : fallback;
    return {
      ...stored,
      id: row?.quote_number || stored.id,
      client: row?.client_name || stored.client,
      category: row?.category || stored.category || "",
      priority: row?.priority || stored.priority || "",
      quoteDate: row?.quote_date || stored.quoteDate || "",
      status: row?.status || stored.status || "Bozza",
      note: row?.note ?? stored.note ?? "",
      total: Number(row?.total ?? stored.total ?? 0),
      articles: Array.isArray(stored.articles) ? stored.articles : [],
      photos: Array.isArray(stored.photos) ? stored.photos : [],
      createdAt: stored.createdAt || row?.created_at || "",
      updatedAt: row?.updated_at || stored.updatedAt || "",
    };
  }

  function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const baseFetch = window.fetch.bind(window);
  window.fetch = async function fetchWithQuotePatchFallback(input, init = {}) {
    if (!isQuotePatch(input, init)) return baseFetch(input, init);

    let apiResponse = null;
    try {
      apiResponse = await baseFetch(input, init);
      if (apiResponse.ok) return apiResponse;
    } catch (error) {
      apiResponse = null;
    }

    let requestBody = {};
    try {
      requestBody = JSON.parse(init.body || "{}");
    } catch (error) {
      return apiResponse || jsonResponse({ error: "Dati preventivo non validi" }, 400);
    }

    const quote = requestBody.quote && typeof requestBody.quote === "object" ? requestBody.quote : {};
    const quoteNumber = clean(requestBody.id || requestBody.quote_number || quote.id || quote.quote_number);
    const clientName = clean(quote.client || quote.client_name);
    if (!quoteNumber || !clientName) {
      return apiResponse || jsonResponse({ error: "Numero o cliente preventivo mancante" }, 400);
    }

    const values = quoteValues(quote);
    const normalizedQuote = {
      ...quote,
      id: quoteNumber,
      client: clientName,
      status: clean(quote.status) || "Bozza",
      articles: Array.isArray(quote.articles) ? quote.articles : [],
      photos: Array.isArray(quote.photos) ? quote.photos : [],
      ...values,
    };
    const row = {
      quote_number: quoteNumber,
      client_name: clientName,
      category: clean(quote.category) || null,
      priority: clean(quote.priority) || null,
      quote_date: clean(quote.quoteDate || quote.quote_date).slice(0, 10) || null,
      status: normalizedQuote.status,
      note: clean(quote.note) || null,
      subtotal: values.subtotal,
      discount_type: values.discountType,
      discount_value: values.discountValue,
      discount_amount: values.discountAmount,
      taxable_amount: values.taxableAmount,
      vat_rate: values.vatRate,
      vat_amount: values.vatAmount,
      total: values.total,
      payload: normalizedQuote,
    };

    try {
      const token = await sessionToken();
      const directResponse = await baseFetch(
        `${SUPABASE_URL}/rest/v1/quotes?quote_number=${encodeURIComponent(`eq.${quoteNumber}`)}&select=${encodeURIComponent(QUOTE_SELECT)}`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(row),
        }
      );
      const payload = await directResponse.json().catch(() => ({}));
      if (!directResponse.ok) {
        return jsonResponse(
          {
            error: "Preventivo non aggiornato",
            detail: payload.message || payload.details || payload.hint || payload.error || "Scrittura database non riuscita",
          },
          directResponse.status || 500
        );
      }
      if (!Array.isArray(payload) || !payload.length) {
        return jsonResponse({ error: "Preventivo non trovato nel database" }, 404);
      }
      return jsonResponse({ quote: shapeQuote(payload[0], normalizedQuote), storage: "supabase-direct" });
    } catch (error) {
      return jsonResponse(
        { error: "Preventivo non aggiornato", detail: error.message || String(error) },
        502
      );
    }
  };
})();
