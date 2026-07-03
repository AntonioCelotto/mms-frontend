(function () {
  const COMMERCE_SKILLS = ["Clienti", "Preventivi", "Ordini", "Pagamenti", "Magazzino"];

  function uniqueSkills(skills) {
    const seen = new Set();
    return skills.filter((skill) => {
      const key = String(skill || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function applyCommerceProfile(editMode = false) {
    const target = editMode ? appState.accountEditDraft : appState.accountDraft;
    if (!target) return;
    const current = typeof accountDraftSkills === "function" ? accountDraftSkills(target.skills) : String(target.skills || "").split(",").map((item) => item.trim()).filter(Boolean);
    target.role = "viewer";
    target.profile = "commercio";
    target.skills = uniqueSkills([...current, ...COMMERCE_SKILLS]).join(", ");
    renderApp();
  }

  if (typeof syncAccountProfile === "function") {
    const baseSyncAccountProfileCommerce = syncAccountProfile;
    syncAccountProfile = function syncAccountProfileWithCommerce(profileKey, editMode = false) {
      if (profileKey === "commercio") return applyCommerceProfile(editMode);
      return baseSyncAccountProfileCommerce(profileKey, editMode);
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
      const value = select.value === "coordinamento" || select.value === "amministrazione" ? "amministratore" : select.value;
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
