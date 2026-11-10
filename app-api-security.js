(function () {
  const SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";
  const nativeFetch = window.fetch.bind(window);
  // Only these read endpoints may recover automatically. Writes (including
  // auth-profile POST) must never be replayed after an ambiguous response.
  const recoverableReads = new Set(["/api/bootstrap", "/api/inventory", "/api/list-attachments"]);
  const pendingReads = new Map();

  async function protectedFetch(input, init, url) {
    const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.origin !== window.location.origin || method !== "GET" || !recoverableReads.has(url.pathname)) {
      return nativeFetch(input, init);
    }
    const signal = init.signal || (input instanceof Request ? input.signal : null);
    const key = `${url.href}\n${init.headers.get("Authorization") || ""}`;
    // Don't combine callers with independent cancellation semantics.
    const share = !signal;
    if (share && pendingReads.has(key)) return (await pendingReads.get(key)).clone();
    const read = (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await nativeFetch(input, init);
          if (attempt || ![502, 503, 504].includes(response.status)) return response;
          if (response.body) await response.body.cancel().catch(() => {});
        } catch (error) {
          if (attempt || signal?.aborted || error.name === "AbortError" || !(error instanceof TypeError)) throw error;
        }
        // One bounded, jittered retry; every attempt still passes server auth.
        await new Promise((resolve, reject) => {
          if (signal?.aborted) return reject(signal.reason || new DOMException("Richiesta annullata", "AbortError"));
          const abort = () => {
            clearTimeout(timer);
            reject(signal.reason || new DOMException("Richiesta annullata", "AbortError"));
          };
          const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, 350 + Math.random() * 350);
          signal?.addEventListener("abort", abort, { once: true });
        });
      }
    })();
    if (share) pendingReads.set(key, read);
    try {
      const response = await read;
      return share ? response.clone() : response;
    } finally {
      if (share && pendingReads.get(key) === read) pendingReads.delete(key);
    }
  }

  if (!window.mmsSupabaseAuth && window.supabase?.createClient) {
    window.mmsSupabaseAuth = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  function requestUrl(input) {
    const raw = typeof input === "string" ? input : input?.url;
    if (!raw) return null;
    try {
      return new URL(raw, window.location.origin);
    } catch (_) {
      return null;
    }
  }

  function needsAuthenticatedToken(url) {
    if (!url) return false;
    const protectedApi =
      url.origin === window.location.origin &&
      url.pathname.startsWith("/api/") &&
      url.pathname !== "/api/health";
    const protectedSupabaseData =
      url.origin === SUPABASE_URL &&
      (url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/graphql/v1"));
    return protectedApi || protectedSupabaseData;
  }

  window.fetch = async function authenticatedFetch(input, init = {}) {
    const url = requestUrl(input);
    if (!needsAuthenticatedToken(url)) return nativeFetch(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    // Authentication calls already carry the user's token. Reuse it directly:
    // asking Supabase for the session inside an auth-state callback can block login.
    const authorization = headers.get("Authorization") || "";
    if (authorization && authorization !== `Bearer ${SUPABASE_ANON_KEY}`) {
      return protectedFetch(input, { ...init, headers }, url);
    }
    const session = await window.mmsSupabaseAuth?.auth?.getSession?.();
    const token = session?.data?.session?.access_token;
    // Legacy REST callers include the public anon key as Authorization.
    // Replace it with the signed-in user's token; RLS must never see anon here.
    if (token) headers.set("Authorization", `Bearer ${token}`);
    else headers.delete("Authorization");
    return protectedFetch(input, { ...init, headers }, url);
  };
})();
