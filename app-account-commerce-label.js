(function () {
  const COMMERCE_SKILLS = ["Clienti", "Preventivi", "Ordini", "Pagamenti", "Magazzino"];
  const OPERATOR_SKILLS = ["Cartamodello", "Taglio", "Confezione", "avanzamento lavori"];
  const PROFILE_OPTIONS = [
    ["amministratore", "Amministratore"],
    ["commercio", "Commercio"],
    ["operatore", "Operatore"],
  ];

  function text(value) {
    return String(value ?? "").trim();
  }

  function key(value) {
    return text(value).toLowerCase();
  }

  function uniqueSkills(skills) {
    const seen = new Set();
    return skills
      .map(text)
      .filter(Boolean)
      .filter((skill) => {
        const skillKey = key(skill);
        if (seen.has(skillKey)) return false;
        seen.add(skillKey);
        return true;
      });
  }

  function splitSkills(rawValue) {
    if (typeof accountDraftSkills === "function") return accountDraftSkills(rawValue);
    return text(rawValue)
      .split(",")
      .map(text)
      .filter(Boolean);
  }

  function draftSkills(target) {
    return target ? splitSkills(target.skills) : [];
  }

  function withoutCommerceSkills(skills) {
    const commerceKeys = new Set(COMMERCE_SKILLS.map(key));
    return skills.filter((skill) => !commerceKeys.has(key(skill)));
  }

  function hasCommerceSkills(skills) {
    const skillText = skills.join(" ").toLowerCase();
    return COMMERCE_SKILLS.some((skill) => skillText.includes(key(skill)));
  }

  function targetDraft(editMode = false) {
    return editMode ? appState.accountEditDraft : appState.accountDraft;
  }

  function ensureProfileDraft(target) {
    if (!target) return;
    const normalized = normalizeProfileKey(target.profile);
    target.profile = normalized || (target.role === "admin" ? "amministratore" : "operatore");
  }

  function normalizeProfileKey(value) {
    const normalized = key(value);
    if (["admin", "administrator", "amministratore"].includes(normalized)) return "amministratore";
    if (["commerce", "commerciale", "commercio"].includes(normalized)) return "commercio";
    if (["operator", "viewer", "operatore", "operatore produzione"].includes(normalized)) return "operatore";
    return "";
  }

  function applyProfile(profileKey, editMode = false) {
    const target = targetDraft(editMode);
    if (!target) return;
    const profile = normalizeProfileKey(profileKey) || "operatore";
    const currentSkills = draftSkills(target);
    target.profile = profile;

    if (profile === "amministratore") {
      target.role = "admin";
      target.skills = uniqueSkills(currentSkills).join(", ");
    } else if (profile === "commercio") {
      target.role = "viewer";
      target.skills = uniqueSkills([...withoutCommerceSkills(currentSkills), ...COMMERCE_SKILLS]).join(", ");
    } else {
      target.role = "viewer";
      target.skills = uniqueSkills([...withoutCommerceSkills(currentSkills), ...OPERATOR_SKILLS]).join(", ");
    }

    renderApp();
  }

  if (typeof syncAccountProfile === "function") {
    const baseSyncAccountProfileCommerce = syncAccountProfile;
    syncAccountProfile = function syncAccountProfileWithStableProfiles(profileKey, editMode = false) {
      const normalized = normalizeProfileKey(profileKey);
      if (normalized) return applyProfile(normalized, editMode);
      return baseSyncAccountProfileCommerce(profileKey, editMode);
    };
  }

  if (typeof accountDraftFromAccount === "function") {
    const baseAccountDraftFromAccountCommerce = accountDraftFromAccount;
    accountDraftFromAccount = function accountDraftFromAccountWithStableProfile(account) {
      const draft = baseAccountDraftFromAccountCommerce(account);
      const skills = Array.isArray(account?.skillsList) ? account.skillsList : draftSkills(draft);
      if (draft.role === "admin" || account?.roleKey === "admin" || account?.displayRole === "Amministratore") {
        draft.profile = "amministratore";
      } else if (hasCommerceSkills(skills)) {
        draft.profile = "commercio";
      } else {
        draft.profile = "operatore";
      }
      return draft;
    };
  }

  if (typeof accountProfileFromSkills === "function") {
    accountProfileFromSkills = function accountProfileFromSkillsStable(account) {
      if (account?.isClientAccess) return "Accesso cliente";
      if (account?.roleKey === "admin" || account?.displayRole === "Amministratore") return "Amministratore";
      const skills = Array.isArray(account?.skillsList) ? account.skillsList : [];
      if (hasCommerceSkills(skills)) return "Commercio";
      return "Operatore";
    };
  }

  if (typeof accountCreatePayload === "function") {
    const baseAccountCreatePayloadCommerce = accountCreatePayload;
    accountCreatePayload = function accountCreatePayloadWithStableProfile() {
      ensureProfileDraft(appState.accountDraft);
      return baseAccountCreatePayloadCommerce();
    };
  }

  function normalizeAccountProfileSelects() {
    if (typeof appState === "undefined" || appState.currentView !== "accounts") return;
    ensureProfileDraft(appState.accountDraft);
    ensureProfileDraft(appState.accountEditDraft);

    document.querySelectorAll("[data-account-profile], [data-account-edit-profile]").forEach((select) => {
      const draft = select.matches("[data-account-edit-profile]") ? appState.accountEditDraft : appState.accountDraft;
      const currentProfile = normalizeProfileKey(draft?.profile) || normalizeProfileKey(select.value) || "operatore";
      select.innerHTML = PROFILE_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
      select.value = currentProfile;
    });
  }

  const baseRenderAppAccountCommerce = renderApp;
  renderApp = function renderAppAccountCommerce() {
    baseRenderAppAccountCommerce();
    normalizeAccountProfileSelects();
  };

  if (document.getElementById("app")?.innerHTML) normalizeAccountProfileSelects();
})();
