(function () {
  const VIEW_LABELS = {
    dashboard: "Dashboard",
    "new-order": "Preventivi",
    quotes: "Preventivi",
    orders: "Ordini",
    clients: "Clienti",
    inventory: "Magazzino",
    payments: "Pagamenti",
    calendar: "Calendario",
    "operator-order": "Scheda lavorazione",
    accounts: "Account",
    "ai-assistant": "Assistente AI",
  };

  const ALLOWED_VIEWS = {
    admin: "all",
    commerce: new Set(["dashboard", "new-order", "quotes", "orders", "clients", "inventory", "payments", "calendar", "operator-order"]),
    operator: new Set(["calendar", "operator-order"]),
  };

  const COMMERCE_SKILLS = ["clienti", "preventivi", "ordini", "pagamenti", "magazzino"];
  let cachedProfile = null;
  let loadingProfile = false;

  function normalizeProfile(profile) {
    const raw = String(profile?.access_profile || profile?.profile || profile?.role || "").toLowerCase();
    if (raw === "admin" || raw === "amministratore") return "admin";
    if (raw === "commerce" || raw === "commercio") return "commerce";
    const skills = Array.isArray(profile?.skills) ? profile.skills.join(" ").toLowerCase() : "";
    if (COMMERCE_SKILLS.some((skill) => skills.includes(skill))) return "commerce";
    return "operator";
  }

  function currentRole() {
    return normalizeProfile(cachedProfile || window.mmsAuthProfile || {});
  }

  function isAllowed(view) {
    const role = currentRole();
    const allowed = ALLOWED_VIEWS[role] || ALLOWED_VIEWS.operator;
    return allowed === "all" || allowed.has(view);
  }

  function fallbackView() {
    return currentRole() === "operator" ? "calendar" : "dashboard";
  }

  async function loadProfile() {
    if (loadingProfile) return;
    loadingProfile = true;
    try {
      const session = await window.mmsSupabaseAuth?.auth?.getSession?.();
      const token = session?.data?.session?.access_token;
      if (!token) return;
      const response = await fetch("/api/auth-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.profile) {
        cachedProfile = payload.profile;
        window.mmsAuthProfile = payload.profile;
        enforcePermissions();
      }
    } catch (error) {
      console.warn("Permessi account non disponibili", error);
    } finally {
      loadingProfile = false;
    }
  }

  function hideBlockedNavigation() {
    document.querySelectorAll("[data-nav]").forEach((button) => {
      const view = button.dataset.nav;
      button.style.display = isAllowed(view) ? "" : "none";
    });
    document.querySelectorAll("[data-open]").forEach((button) => {
      const view = button.dataset.open;
      if (VIEW_LABELS[view]) button.style.display = isAllowed(view) ? "" : "none";
    });
  }

  function enforceCurrentView() {
    if (!isAllowed(appState.currentView)) {
      appState.currentView = fallbackView();
    }
  }

  function enforcePermissions() {
    enforceCurrentView();
    hideBlockedNavigation();
  }

  const baseNavigateRolePermissions = typeof navigate === "function" ? navigate : null;
  if (baseNavigateRolePermissions) {
    navigate = function navigateWithRolePermissions(view, orderId) {
      if (!isAllowed(view)) {
        appState.currentView = fallbackView();
        if (typeof setFlashMessage === "function") {
          setFlashMessage(`Accesso non abilitato: ${VIEW_LABELS[view] || view}`);
        }
        renderApp();
        return;
      }
      return baseNavigateRolePermissions(view, orderId);
    };
  }

  const baseRenderAppRolePermissions = renderApp;
  renderApp = function renderAppRolePermissions() {
    enforceCurrentView();
    baseRenderAppRolePermissions();
    enforcePermissions();
    loadProfile();
  };

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target.closest?.("[data-nav], [data-open]");
      if (!target) return;
      const view = target.dataset.nav || target.dataset.open;
      if (!VIEW_LABELS[view] || isAllowed(view)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      appState.currentView = fallbackView();
      if (typeof setFlashMessage === "function") setFlashMessage(`Accesso non abilitato: ${VIEW_LABELS[view]}`);
      renderApp();
    },
    true
  );

  loadProfile();
  if (document.getElementById("app")?.innerHTML) enforcePermissions();
})();
