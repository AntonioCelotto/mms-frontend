(function () {
  const COMMERCE_SKILLS = ["Clienti", "Preventivi", "Ordini", "Pagamenti", "Magazzino"];
  const OPERATOR_SKILLS = ["Cartamodello", "Taglio", "Confezione", "avanzamento lavori"];

  function uniqueSkills(skills) {
    const seen = new Set();
    return skills.filter((skill) => {
      const key = String(skill || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function draftSkills(target) {
    if (!target) return [];
    return typeof accountDraftSkills === "function"
      ? accountDraftSkills(target.skills)
      : String(target.skills || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
  }

  function applyAdminProfile(editMode = false) {
    const target = editMode ? appState.accountEditDraft : appState.accountDraft;
    if (!target) return;
    target.role = "admin";
    target.profile = "amministratore";
    target.skills = uniqueSkills(draftSkills(target)).join(", ");
    renderApp();
  }

  function applyCommerceProfile(editMode = false) {
    const target = editMode ? appState.accountEditDraft : appState.accountDraft;
    if (!target) return;
    target.role = "viewer";
    target.profile = "commercio";
    target.skills = uniqueSkills([...draftSkills(target), ...COMMERCE_SKILLS]).join(", ");
    renderApp();
  }

  function applyOperatorProfile(editMode = false) {
    const target = editMode ? appState.accountEditDraft : appState.accountDraft;
    if (!target) return;
    const commerceKeys = new Set(COMMERCE_SKILLS.map((skill) => skill.toLowerCase()));
    target.role = "viewer";
    target.profile = "operatore";
    target.skills = uniqueSkills([...draftSkills(target).filter((skill) => !commerceKeys.has(skill.toLowerCase())), ...OPERATOR_SKILLS]).join(", ");
    renderApp();
  }

  if (typeof syncAccountProfile === "function") {
    const baseSyncAccountProfileCommerce = syncAccountProfile;
    syncAccountProfile = function syncAccountProfileWithCommerce(profileKey, editMode = false) {
      const normalized = text(profileKey).toLowerCase();
      if (normalized === "amministratore" || normalized === "admin") return applyAdminProfile(editMode);
      if (normalized === "commercio" || normalized === "commerce") return applyCommerceProfile(editMode);
      if (normalized === "operatore" || normalized === "operator") return applyOperatorProfile(editMode);
      return baseSyncAccountProfileCommerce(profileKey, editMode);
    };
  }

  if (typeof accountDraftFromAccount === "function") {
    const baseAccountDraftFromAccountCommerce = accountDraftFromAccount;
    accountDraftFromAccount = function accountDraftFromAccountWithProfile(account) {
      const draft = baseAccountDraftFromAccountCommerce(account);
      const skills = Array.isArray(account?.skillsList) ? account.skillsList : draftSkills(draft);
      const skillText = skills.join(" ").toLowerCase();
      if (draft.role === "admin" || account?.roleKey === "admin" || account?.displayRole === "Amministratore") {
        draft.profile = "amministratore";
      } else if (COMMERCE_SKILLS.some((skill) => skillText.includes(skill.toLowerCase()))) {
        draft.profile = "commercio";
      } else {
        draft.profile = "operatore";
      }
      return draft;
    };
  }

  if (typeof accountProfileFromSkills === "function") {
    const baseAccountProfileFromSkillsCommerce = accountProfileFromSkills;
    accountProfileFromSkills = function accountProfileFromSkillsWithCommerce(account) {
      const skills = (account.skillsList || []).join(" ").toLowerCase();
      if (COMMERCE_SKILLS.some((skill) => skills.includes(skill.toLowerCase())) && account.displayRole !== "Amministratore") {
        return "Commercio";
      }
      const label = baseAccountProfileFromSkillsCommerce(account);
      if (label === "Coordinamento" || label === "Amministrazione") return "Amministratore";
      if (label === "Operatore produzione") return "Operatore";
      return label;
    };
  }

  function normalizeAccountProfileSelects() {
    if (appState.currentView !== "accounts") return;
    document.querySelectorAll("[data-account-profile], [data-account-edit-profile]").forEach((select) => {
      const draft = select.matches("[data-account-edit-profile]") ? appState.accountEditDraft : appState.accountDraft;
      const currentProfile = String(draft?.profile || "").toLowerCase();
      const value = currentProfile || (select.value === "coordinamento" || select.value === "amministrazione" ? "amministratore" : select.value);
      select.innerHTML = [
        `<option value="amministratore">Amministratore</option>`,
        `<option value="commercio">Commercio</option>`,
        `<option value="operatore">Operatore</option>`,
      ].join("");
      select.value = value === "cliente" ? "operatore" : value;
    });
  }

  const baseRenderAppAccountCommerce = renderApp;
  renderApp = function renderAppAccountCommerce() {
    baseRenderAppAccountCommerce();
    normalizeAccountProfileSelects();
  };

  if (document.getElementById("app")?.innerHTML) normalizeAccountProfileSelects();
})();
