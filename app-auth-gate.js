(function () {
  const SUPABASE_URL = "https://fzdqemzowxjuotqalaol.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk";
  const PROFILE_API = "/api/auth-profile";

  const authState = {
    mode: "login",
    busy: false,
    message: "",
    profile: null,
  };

  function getClient() {
    if (!window.supabase?.createClient) return null;
    if (!window.mmsSupabaseAuth) {
      window.mmsSupabaseAuth = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return window.mmsSupabaseAuth;
  }

  function html(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function authRoleLabel(profile) {
    const raw = String(profile?.access_profile || profile?.profile || profile?.role || "").toLowerCase();
    if (raw === "admin" || raw === "amministratore") return "Amministratore";
    if (raw === "commerce" || raw === "commercio") return "Commercio";
    const skills = Array.isArray(profile?.skills) ? profile.skills.join(" ").toLowerCase() : "";
    if (["clienti", "preventivi", "ordini", "pagamenti", "magazzino"].some((skill) => skills.includes(skill))) return "Commercio";
    return "Operatore";
  }

  function publishProfile(profile) {
    window.mmsAuthProfile = profile || null;
    window.dispatchEvent(new CustomEvent("mms-auth-profile", { detail: { profile: window.mmsAuthProfile } }));
  }

  function ensureStyles() {
    if (document.getElementById("mms-auth-style")) return;
    const style = document.createElement("style");
    style.id = "mms-auth-style";
    style.textContent = `
      .auth-checking #app,
      .auth-locked #app { display: none !important; }
      .mms-auth-shell {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 28px;
        background: #f5f6f7;
        color: #111827;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .mms-auth-panel {
        width: min(440px, 100%);
        background: #fff;
        border: 1px solid rgba(17, 24, 39, 0.12);
        border-radius: 8px;
        box-shadow: 0 18px 55px rgba(17, 24, 39, 0.14);
        padding: 24px;
      }
      .mms-auth-logo { font-size: 13px; font-weight: 800; letter-spacing: 0; text-transform: uppercase; color: #64748b; margin-bottom: 10px; }
      .mms-auth-panel h1 { margin: 0; font-size: 26px; letter-spacing: 0; }
      .mms-auth-panel p { margin: 8px 0 18px; color: #4b5563; line-height: 1.45; }
      .mms-auth-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 18px 0; }
      .mms-auth-tabs button,
      .mms-auth-submit,
      .mms-auth-logout {
        border: 1px solid rgba(17, 24, 39, 0.14);
        border-radius: 8px;
        min-height: 42px;
        background: #f3f4f6;
        color: #111827;
        font-weight: 700;
        cursor: pointer;
      }
      .mms-auth-tabs button.active,
      .mms-auth-submit {
        background: #1f2937;
        border-color: #1f2937;
        color: #fff;
      }
      .mms-auth-grid { display: grid; gap: 12px; }
      .mms-auth-field { display: grid; gap: 6px; }
      .mms-auth-field label { font-size: 12px; font-weight: 800; color: #4b5563; }
      .mms-auth-field input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(17, 24, 39, 0.16);
        border-radius: 8px;
        min-height: 44px;
        padding: 0 12px;
        font: inherit;
      }
      .mms-auth-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .mms-auth-message {
        margin-top: 14px;
        padding: 10px 12px;
        border-radius: 8px;
        background: #f3f4f6;
        color: #374151;
        font-size: 13px;
        line-height: 1.4;
      }
      .mms-auth-userbar {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 80;
        display: flex;
        gap: 8px;
        align-items: center;
        background: #fff;
        border: 1px solid rgba(17, 24, 39, 0.12);
        border-radius: 8px;
        box-shadow: 0 12px 32px rgba(17, 24, 39, 0.14);
        padding: 8px 10px;
        font: 13px Inter, ui-sans-serif, system-ui, sans-serif;
      }
      .mms-auth-userbar strong { display: block; font-size: 12px; }
      .mms-auth-userbar span { color: #4b5563; font-size: 11px; }
      .mms-auth-logout { min-height: 32px; padding: 0 10px; }
      @media (max-width: 620px) {
        .mms-auth-shell { padding: 16px; }
        .mms-auth-panel { padding: 18px; }
        .mms-auth-row { grid-template-columns: 1fr; }
        .mms-auth-userbar { left: 12px; right: 12px; bottom: 12px; justify-content: space-between; }
      }
    `;
    document.head.appendChild(style);
  }

  function root() {
    return document.getElementById("app");
  }

  function overlay() {
    let node = document.getElementById("mms-auth-root");
    if (!node) {
      node = document.createElement("div");
      node.id = "mms-auth-root";
      document.body.appendChild(node);
    }
    return node;
  }

  function userbar() {
    let node = document.getElementById("mms-auth-userbar");
    if (!node) {
      node = document.createElement("div");
      node.id = "mms-auth-userbar";
      node.className = "mms-auth-userbar";
      document.body.appendChild(node);
    }
    return node;
  }

  function formMarkup() {
    const isRegister = authState.mode === "register";
    return `
      <div class="mms-auth-shell">
        <div class="mms-auth-panel">
          <div class="mms-auth-logo">MMS Studio</div>
          <h1>${isRegister ? "Registrazione dipendente" : "Accesso gestionale"}</h1>
          <p>${isRegister ? "Crea il tuo accesso con email e password. Se l'email esiste gia' negli Account, verra' collegata al profilo dipendente." : "Accedi con la tua email aziendale e password per entrare nel gestionale."}</p>
          <div class="mms-auth-tabs">
            <button type="button" data-auth-mode="login" class="${!isRegister ? "active" : ""}">Accedi</button>
            <button type="button" data-auth-mode="register" class="${isRegister ? "active" : ""}">Registrati</button>
          </div>
          <form class="mms-auth-grid" data-auth-form>
            ${
              isRegister
                ? `<div class="mms-auth-row">
                    <div class="mms-auth-field"><label>Nome</label><input name="first_name" autocomplete="given-name" required /></div>
                    <div class="mms-auth-field"><label>Cognome</label><input name="last_name" autocomplete="family-name" /></div>
                  </div>`
                : ""
            }
            <div class="mms-auth-field"><label>Email</label><input name="email" type="email" autocomplete="email" required /></div>
            <div class="mms-auth-field"><label>Password</label><input name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" minlength="6" required /></div>
            <button class="mms-auth-submit" type="submit">${authState.busy ? "Attendi..." : isRegister ? "Crea accesso" : "Entra"}</button>
          </form>
          ${authState.message ? `<div class="mms-auth-message">${html(authState.message)}</div>` : ""}
        </div>
      </div>
    `;
  }

  function renderAuth() {
    ensureStyles();
    publishProfile(null);
    document.documentElement.classList.add("auth-locked");
    document.documentElement.classList.remove("auth-checking");
    overlay().innerHTML = formMarkup();
    const bar = document.getElementById("mms-auth-userbar");
    if (bar) bar.remove();
    attachAuthEvents();
  }

  function renderAuthenticated(profile) {
    publishProfile(profile);
    document.documentElement.classList.remove("auth-checking", "auth-locked");
    overlay().innerHTML = "";
    authState.profile = profile;
    const name = profile?.name || profile?.email || "Utente";
    const role = authRoleLabel(profile);
    const bar = userbar();
    bar.innerHTML = `
      <div><strong>${html(name)}</strong><span>${html(role)}</span></div>
      <button class="mms-auth-logout" type="button" data-auth-logout>Esci</button>
    `;
    bar.querySelector("[data-auth-logout]")?.addEventListener("click", signOut);
  }

  function attachAuthEvents() {
    overlay().querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        authState.mode = button.dataset.authMode;
        authState.message = "";
        renderAuth();
      });
    });
    overlay().querySelector("[data-auth-form]")?.addEventListener("submit", handleSubmit);
  }

  async function syncProfile(session) {
    const response = await fetch(PROFILE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || payload.detail || "Profilo non autorizzato");
    }
    if (payload.profile?.is_active === false) {
      throw new Error("Account disattivato. Contatta l'amministratore.");
    }
    publishProfile(payload.profile);
    return payload.profile;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const client = getClient();
    if (!client) {
      authState.message = "Modulo accesso non disponibile. Ricarica la pagina.";
      return renderAuth();
    }
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    authState.busy = true;
    authState.message = "";
    renderAuth();
    let completed = false;
    try {
      if (authState.mode === "register") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              first_name: String(form.get("first_name") || "").trim(),
              last_name: String(form.get("last_name") || "").trim(),
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          authState.message = "Registrazione creata. Se Supabase richiede conferma email, apri il link ricevuto e poi accedi.";
          authState.busy = false;
          renderAuth();
          return;
        }
        const profile = await syncProfile(data.session);
        completed = true;
        renderAuthenticated(profile);
        return;
      }
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const profile = await syncProfile(data.session);
      completed = true;
      renderAuthenticated(profile);
    } catch (error) {
      authState.message = error.message || "Accesso non riuscito";
    } finally {
      authState.busy = false;
      if (!completed && document.documentElement.classList.contains("auth-locked")) {
        renderAuth();
      }
    }
  }

  async function signOut() {
    const client = getClient();
    await client?.auth.signOut();
    authState.profile = null;
    authState.message = "";
    renderAuth();
  }

  async function boot() {
    ensureStyles();
    const client = getClient();
    if (!client || !root()) {
      authState.message = "Modulo accesso non disponibile. Ricarica la pagina.";
      return renderAuth();
    }
    const { data } = await client.auth.getSession();
    if (!data.session) {
      return renderAuth();
    }
    try {
      const profile = await syncProfile(data.session);
      renderAuthenticated(profile);
    } catch (error) {
      await client.auth.signOut();
      authState.message = error.message || "Sessione scaduta. Accedi di nuovo.";
      renderAuth();
    }
    client.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        renderAuth();
        return;
      }
      try {
        const profile = await syncProfile(session);
        renderAuthenticated(profile);
      } catch (error) {
        authState.message = error.message || "Sessione non valida";
        renderAuth();
      }
    });
  }

  document.documentElement.classList.add("auth-checking");
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
