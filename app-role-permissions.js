(function () {
  const VIEW_LABELS = {
    dashboard: "Dashboard",
    "new-order": "Preventivi",
    quotes: "Preventivi",
    orders: "Ordini",
    clients: "Clienti",
    client: "Scheda cliente",
    inventory: "Magazzino",
    payments: "Pagamenti",
    calendar: "Calendario",
    "order-detail": "Scheda ordine",
    "operator-order": "Scheda lavorazione",
    "order-create": "Creazione ordine",
    accounts: "Account",
    "ai-assistant": "Assistente AI",
  };

  const ALLOWED_VIEWS = {
    admin: "all",
    commerce: new Set(["dashboard", "new-order", "quotes", "orders", "clients", "client", "inventory", "payments", "calendar", "order-detail", "operator-order", "order-create"]),
    operator: new Set(["calendar", "operator-order"]),
  };

  const COMMERCE_SKILLS = ["clienti", "preventivi", "ordini", "pagamenti", "magazzino"];
  let cachedProfile = null;
  let loadingProfile = false;
  let profileLoadedOnce = false;
  let lastProfileLoadAt = 0;

  function normalizeProfile(profile) {
    if (!profile) return "loading";
    const raw = String(profile.access_profile || profile.profile || profile.role || "").toLowerCase();
    if (raw === "admin" || raw === "amministratore") return "admin";
    if (raw === "commerce" || raw === "commercio") return "commerce";
    const skills = Array.isArray(profile.skills) ? profile.skills.join(" ").toLowerCase() : "";
    if (COMMERCE_SKILLS.some((skill) => skills.includes(skill))) return "commerce";
    return "operator";
  }

  function activeProfile() {
    return window.mmsAuthProfile || cachedProfile || null;
  }

  function sameProfile(a, b) {
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function currentRole() {
    return normalizeProfile(activeProfile());
  }

  function roleReady() {
    return currentRole() !== "loading";
  }

  function roleLabel(role = currentRole()) {
    if (role === "admin") return "Amministratore";
    if (role === "commerce") return "Commercio";
    if (role === "operator") return "Operatore";
    return "Caricamento profilo";
  }

  function isAllowed(view) {
    const role = currentRole();
    if (role === "loading") return true;
    const allowed = ALLOWED_VIEWS[role] || ALLOWED_VIEWS.operator;
    return allowed === "all" || allowed.has(view);
  }

  function fallbackView() {
    return currentRole() === "operator" ? "calendar" : "dashboard";
  }

  function updateAuthUserbarRole() {
    const roleNode = document.querySelector("#mms-auth-userbar span");
    if (roleNode) roleNode.textContent = roleLabel();
  }

  async function loadProfile({ force = false } = {}) {
    const now = Date.now();
    if (loadingProfile) return;
    if (!force && profileLoadedOnce && activeProfile()) return;
    if (!force && now - lastProfileLoadAt < 10000) return;
    loadingProfile = true;
    lastProfileLoadAt = now;
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
        const changed = !sameProfile(activeProfile(), payload.profile);
        cachedProfile = payload.profile;
        window.mmsAuthProfile = payload.profile;
        profileLoadedOnce = true;
        enforcePermissions();
        if (changed && typeof renderApp === "function") renderApp();
      }
    } catch (error) {
      console.warn("Permessi account non disponibili", error);
    } finally {
      profileLoadedOnce = true;
      loadingProfile = false;
    }
  }

  function hideBlockedNavigation() {
    if (!roleReady()) return;
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
    if (!roleReady()) return;
    if (!isAllowed(appState.currentView)) {
      appState.currentView = fallbackView();
    }
  }

  function enforcePermissions() {
    enforceCurrentView();
    hideBlockedNavigation();
    updateAuthUserbarRole();
  }

  const baseNavigateRolePermissions = typeof navigate === "function" ? navigate : null;
  if (baseNavigateRolePermissions) {
    navigate = function navigateWithRolePermissions(view, orderId) {
      if (!roleReady()) return baseNavigateRolePermissions(view, orderId);
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
      if (!target || !roleReady()) return;
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

  window.addEventListener("mms-auth-profile", (event) => {
    const nextProfile = event.detail?.profile || null;
    const changed = !sameProfile(cachedProfile, nextProfile);
    cachedProfile = nextProfile;
    profileLoadedOnce = !!nextProfile;
    enforcePermissions();
    if (changed && typeof renderApp === "function") renderApp();
  });

  loadProfile({ force: true });
  if (document.getElementById("app")?.innerHTML) enforcePermissions();
})();