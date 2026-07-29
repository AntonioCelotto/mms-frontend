(function () {
  let skipRefreshUntil = 0;
  const baseFetch = window.fetch.bind(window);

  function isDeleteRecordUrl(input) {
    const url = typeof input === "string" ? input : input?.url || "";
    return url === "/api/delete-record" || url.endsWith("/api/delete-record");
  }

  function isOrderDelete(init) {
    if (String(init?.method || "GET").toUpperCase() !== "POST") return false;
    try {
      const payload = JSON.parse(init.body || "{}");
      return String(payload.entity || "").toLowerCase() === "order";
    } catch (error) {
      return false;
    }
  }

  window.fetch = async function fetchWithFastDeleteGuard(input, init = {}) {
    const marksOrderDelete = isDeleteRecordUrl(input) && isOrderDelete(init);
    const response = await baseFetch(input, init);
    if (marksOrderDelete && response.ok) {
      skipRefreshUntil = Date.now() + 4500;
    }
    return response;
  };

  function wrapRefreshBootstrap() {
    if (typeof window.refreshBootstrap !== "function" || window.refreshBootstrap.__mmsFastDeleteGuard) return;
    const baseRefreshBootstrap = window.refreshBootstrap;
    window.refreshBootstrap = async function refreshBootstrapFastDeleteGuard(...args) {
      if (Date.now() < skipRefreshUntil && appState.currentView === "orders") {
        return appData;
      }
      return baseRefreshBootstrap.apply(this, args);
    };
    window.refreshBootstrap.__mmsFastDeleteGuard = true;
  }

  wrapRefreshBootstrap();
  window.setTimeout(wrapRefreshBootstrap, 500);
  window.setTimeout(wrapRefreshBootstrap, 1500);
})();
