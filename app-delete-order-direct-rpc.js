(function () {
  const SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";

  function isDeleteRecordUrl(input) {
    const url = typeof input === "string" ? input : input?.url || "";
    return url === "/api/delete-record" || url.endsWith("/api/delete-record");
  }

  function positiveInt(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function resolveOrderRef(payload) {
    return (
      positiveInt(payload.order_db_id) ||
      positiveInt(payload.db_id) ||
      positiveInt(payload.internal_id) ||
      positiveInt(payload.order_id) ||
      positiveInt(payload.id)
    );
  }

  async function sessionToken() {
    try {
      const session = await window.mmsSupabaseAuth?.auth?.getSession?.();
      return session?.data?.session?.access_token || SUPABASE_ANON_KEY;
    } catch (error) {
      return SUPABASE_ANON_KEY;
    }
  }

  function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const baseFetch = window.fetch.bind(window);
  window.fetch = async function fetchWithDirectOrderDelete(input, init = {}) {
    if (!isDeleteRecordUrl(input) || String(init?.method || "GET").toUpperCase() !== "POST") {
      return baseFetch(input, init);
    }

    let payload = null;
    try {
      payload = JSON.parse(init.body || "{}");
    } catch (error) {
      payload = null;
    }

    if (!payload || String(payload.entity || "").toLowerCase() !== "order") {
      return baseFetch(input, init);
    }

    const orderRef = resolveOrderRef(payload);
    if (!orderRef) {
      return jsonResponse({ error: "Ordine non valido o non trovato" }, 400);
    }

    try {
      const token = await sessionToken();
      const response = await baseFetch(`${SUPABASE_URL}/rest/v1/rpc/delete_order_safely`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_order_ref: orderRef }),
      });
      const raw = await response.text().catch(() => "");
      let body = {};
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch (error) {
          body = { detail: raw.slice(0, 240) };
        }
      }
      return jsonResponse(body, response.status);
    } catch (error) {
      return jsonResponse({ error: "Eliminazione non riuscita", detail: error.message || String(error) }, 500);
    }
  };
})();
