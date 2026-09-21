(function () {
  const SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";
  const nativeFetch = window.fetch.bind(window);

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
    const session = await window.mmsSupabaseAuth?.auth?.getSession?.();
    const token = session?.data?.session?.access_token;
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return nativeFetch(input, { ...init, headers });
  };
})();
