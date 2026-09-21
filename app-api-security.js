(function () {
  const SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";
  const nativeFetch = window.fetch.bind(window);

  if (!window.mmsSupabaseAuth && window.supabase?.createClient) {
    window.mmsSupabaseAuth = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  function isProtectedApi(input) {
    const raw = typeof input === "string" ? input : input?.url;
    if (!raw) return false;
    try {
      const url = new URL(raw, window.location.origin);
      return url.origin === window.location.origin && url.pathname.startsWith("/api/") && url.pathname !== "/api/health";
    } catch (_) {
      return false;
    }
  }

  window.fetch = async function authenticatedFetch(input, init = {}) {
    if (!isProtectedApi(input)) return nativeFetch(input, init);
    const session = await window.mmsSupabaseAuth?.auth?.getSession?.();
    const token = session?.data?.session?.access_token;
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return nativeFetch(input, { ...init, headers });
  };
})();
