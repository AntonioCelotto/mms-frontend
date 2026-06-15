const ACCOUNT_PROFILE_PRESETS = {
  operatore: {
    role: "viewer",
    label: "Operatore produzione",
    skills: ["Cartamodello", "Taglio", "Confezione", "avanzamento lavori"],
  },
  coordinamento: {
    role: "admin",
    label: "Coordinamento",
    skills: ["Produzione", "calendario", "Controllo ordini"],
  },
  amministrazione: {
    role: "admin",
    label: "Amministrazione",
    skills: ["pagamenti", "magazzino", "Permessi"],
  },
  cliente: {
    role: "viewer",
    label: "Accesso cliente",
    skills: ["Vista lavorazione cliente", "approvazioni"],
  },
};

const ACCOUNT_QUICK_SKILLS = [
  "Cartamodello",
  "Taglio",
  "Confezione",
  "Controllo ordini",
  "calendario",
  "magazzino",
  "pagamenti",
  "Supervisione ordini",
];

function accountText(value) {
  return String(value || "").trim();
}

function accountName(account) {
  if (account.name) return account.name;
  return `${accountText(account.first_name)} ${accountText(account.last_name)}`.trim() || "Account senza nome";
}

function accountRole(account) {
  const role = accountText(account.role).toLowerCase();
  if (role === "admin" || role === "amministratore") return "Amministratore";
  return "Operatore";
}

function accountSkills(account) {
  if (Array.isArray(account.skills)) return account.skills.map(accountText).filter(Boolean);
  return accountText(account.skills)
    .split(",")
    .map(accountText)
    .filter(Boolean);
}

function uniqueAccountSkills(skills) {
  const seen = new Set();
  return skills.filter((skill) => {
    const key = skill.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function accountIsClientAccess(account) {
  const combined = `${accountName(account)} ${accountText(account.email)} ${accountSkills(account).join(" ")}`.toLowerCase();
  return combined.includes("cliente@portal.mms") || combined.includes("accesso cliente") || combined.includes("vista lavorazione cliente");
}

function accountsWithTaskCounts() {
  const taskCountByUser = new Map();
  Object.values(appData.orderTasks || {}).flat().forEach((task) => {
    const userId = Number(task.assignedUserId || task.assigned_user_id || task.assignedUserID);
    if (userId) taskCountByUser.set(userId, (taskCountByUser.get(userId) || 0) + 1);
  });

  return (appData.accounts || []).map((account) => ({
    ...account,
    displayName: accountName(account),
    displayRole: accountRole(account),
    skillsList: uniqueAccountSkills(accountSkills(account)),
    taskCount: Number(account.assigned_tasks || account.assignedTasks || taskCountByUser.get(Number(account.id)) || 0),
    isClientAccess: accountIsClientAccess(account),
  }));
}

function accountProfileFromSkills(account) {
  if (account.isClientAccess) return "Accesso cliente";
  if (account.displayRole === "Amministratore") {
    const skills = account.skillsList.join(" ").toLowerCase();
    if (skills.includes("pagamenti") || skills.includes("magazzino") || skills.includes("permessi")) return "Amministrazione";
    return "Coordinamento";
  }
  return "Operatore produzione";
}

function renderAccountSkillMap(accounts) {
  return ["Cartamodello", "Taglio", "Confezione", "Controllo ordini", "calendario", "pagamenti", "magazzino"]
    .map((skill) => {
      const owners = accounts
        .filter((account) => !account.isClientAccess && account.skillsList.some((item) => item.toLowerCase() === skill.toLowerCase()))
        .map((account) => account.displayName);
      return `
        <div class="alert-item">
          <strong>${skill}</strong>
          <span>${owners.length ? owners.join(", ") : "Da assegnare"}</span>
        </div>
      `;
    })
    .join("");
}

function renderAccountRows(accounts) {
  return accounts
    .filter((account) => !account.isClientAccess)
    .map(
      (account) => `
        <tr>
          <td>
            <strong>${account.displayName}</strong>
            <div class="muted">${accountText(account.email) || "Email da completare"}</div>
          </td>
          <td><span class="table-status ${account.displayRole === "Amministratore" ? "progress" : "done"}">${accountProfileFromSkills(account)}</span></td>
          <td>${accountText(account.phone) || "Telefono da completare"}</td>
          <td>${account.skillsList.length ? account.skillsList.join(", ") : "Skill da inserire"}</td>
          <td>${account.taskCount}</td>
          <td><span class="table-status done">Attivo</span></td>
        </tr>
      `
    )
    .join("");
}

function syncAccountProfile(profileKey) {
  const preset = ACCOUNT_PROFILE_PRESETS[profileKey];
  if (!preset) return;
  const currentSkills = accountText(appState.accountDraft.skills)
    .split(",")
    .map(accountText)
    .filter(Boolean);
  appState.accountDraft.role = preset.role;
  appState.accountDraft.profile = profileKey;
  appState.accountDraft.skills = uniqueAccountSkills([...currentSkills, ...preset.skills]).join(", ");
  renderApp();
}

function addAccountQuickSkill(skill) {
  const currentSkills = accountText(appState.accountDraft.skills)
    .split(",")
    .map(accountText)
    .filter(Boolean);
  appState.accountDraft.skills = uniqueAccountSkills([...currentSkills, skill]).join(", ");
  renderApp();
}

function renderAccounts() {
  const accounts = accountsWithTaskCounts();
  const internalAccounts = accounts.filter((account) => !account.isClientAccess);
  const admins = internalAccounts.filter((account) => account.displayRole === "Amministratore");
  const operators = internalAccounts.filter((account) => account.displayRole !== "Amministratore");
  const assignedTasks = internalAccounts.reduce((sum, account) => sum + account.taskCount, 0);
  const clientAccesses = accounts.filter((account) => account.isClientAccess);
  const draft = appState.accountDraft;

  return `
    <section class="view ${appState.currentView === "accounts" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Account, ruoli e competenze</h2>
          <p>Gestione degli accessi interni, delle competenze operative e del collegamento tra operatori e task.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">${internalAccounts.length} account operativi</div>
          <button class="action-pill" data-action="save-account">${appState.busy ? "Salvataggio..." : "Crea account"}</button>
        </div>
      </div>

      <div class="metric-boxes">
        <div class="metric-box surface"><small>Account attivi</small><strong>${internalAccounts.length}</strong><span>Utenti interni pronti per ordini e planning.</span></div>
        <div class="metric-box surface"><small>Operatori produzione</small><strong>${operators.length}</strong><span>Profili che ricevono task di lavorazione.</span></div>
        <div class="metric-box surface"><small>Amministratori</small><strong>${admins.length}</strong><span>Profili con gestione operativa estesa.</span></div>
        <div class="metric-box surface"><small>Task assegnati</small><strong>${assignedTasks}</strong><span>Lavorazioni gia' collegate agli account.</span></div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Crea o prepara account</h3>
                <p>Prima si sceglie il profilo operativo, poi si completano contatti e competenze.</p>
              </div>
            </div>
            <div class="form-grid">
              <div class="field">
                <label>Nome</label>
                <input class="field-value" data-account-field="first_name" value="${accountText(draft.first_name)}" />
              </div>
              <div class="field">
                <label>Cognome</label>
                <input class="field-value" data-account-field="last_name" value="${accountText(draft.last_name)}" />
              </div>
              <div class="field">
                <label>Telefono</label>
                <input class="field-value" data-account-field="phone" value="${accountText(draft.phone)}" />
              </div>
              <div class="field">
                <label>Email</label>
                <input class="field-value" data-account-field="email" value="${accountText(draft.email)}" />
              </div>
              <div class="field">
                <label>Profilo operativo</label>
                <select class="filter-chip" data-account-profile>
                  ${Object.entries(ACCOUNT_PROFILE_PRESETS)
                    .map(([key, preset]) => `<option value="${key}" ${draft.profile === key ? "selected" : ""}>${preset.label}</option>`)
                    .join("")}
                </select>
              </div>
              <div class="field">
                <label>Permesso base</label>
                <select class="filter-chip" data-account-field="role">
                  <option value="viewer" ${draft.role === "viewer" ? "selected" : ""}>Operatore / visualizzazione</option>
                  <option value="admin" ${draft.role === "admin" ? "selected" : ""}>Amministratore</option>
                </select>
              </div>
              <div class="field span-2">
                <label>Competenze</label>
                <input class="field-value" data-account-field="skills" value="${accountText(draft.skills)}" placeholder="Esempio: Cartamodello, Taglio, Confezione" />
              </div>
            </div>
            <div style="height:14px;"></div>
            <div class="pill-row">
              ${ACCOUNT_QUICK_SKILLS.map((skill) => `<button class="mini-btn" data-account-skill="${skill}">+ ${skill}</button>`).join("")}
            </div>
          </div>
        </div>

        <div style="display:grid; gap:16px;">
          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Regole operative</h3>
                  <p>Questa e' la base per collegare domani gli account reali dei dipendenti.</p>
                </div>
              </div>
              <div class="alert-list">
                <div class="alert-item">
                  <strong>Operatore produzione</strong>
                  <span>Vede i task assegnati, aggiorna avanzamento e stato lavorazione.</span>
                </div>
                <div class="alert-item">
                  <strong>Coordinamento e amministrazione</strong>
                  <span>Gestiscono ordini, planning, magazzino, pagamenti e correzioni operative.</span>
                </div>
                <div class="alert-item">
                  <strong>Accesso cliente</strong>
                  <span>Resta separato dagli operatori interni e mostrera' solo l'avanzamento autorizzato.</span>
                </div>
              </div>
            </div>
          </div>

          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Accessi cliente</h3>
                  <p>Da tenere separati dagli account di lavoro interni.</p>
                </div>
              </div>
              <div class="alert-list">
                ${
                  clientAccesses.length
                    ? clientAccesses
                        .map(
                          (account) => `
                            <div class="alert-item">
                              <strong>${account.displayName}</strong>
                              <span>${accountText(account.email)} - ${account.skillsList.join(", ")}</span>
                            </div>
                          `
                        )
                        .join("")
                    : `<div class="alert-item"><strong>Nessun accesso cliente attivo</strong><span>Si potra' creare quando definiremo il portale cliente.</span></div>`
                }
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Account operativi</h3>
                <p>Ogni riga mostra ruolo, competenze e carico task collegato.</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Profilo</th>
                  <th>Telefono</th>
                  <th>Competenze</th>
                  <th>Task</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                ${renderAccountRows(accounts)}
              </tbody>
            </table>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Mappa competenze</h3>
                <p>Serve per capire subito a chi assegnare le lavorazioni.</p>
              </div>
            </div>
            <div class="alert-list">
              ${renderAccountSkillMap(accounts)}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

const baseAttachEventsAccountsWorkspace = attachEvents;
attachEvents = function attachEventsAccountsWorkspace() {
  baseAttachEventsAccountsWorkspace();

  document.querySelectorAll("[data-account-profile]").forEach((select) => {
    select.addEventListener("change", (event) => syncAccountProfile(event.target.value));
  });

  document.querySelectorAll("[data-account-skill]").forEach((button) => {
    button.addEventListener("click", () => addAccountQuickSkill(button.dataset.accountSkill));
  });
};

const baseSaveAccountDraftAccountsWorkspace = saveAccountDraft;
saveAccountDraft = async function saveAccountDraftAccountsWorkspace() {
  appState.accountDraft.skills = uniqueAccountSkills(
    accountText(appState.accountDraft.skills)
      .split(",")
      .map(accountText)
      .filter(Boolean)
  ).join(", ");

  if (!accountText(appState.accountDraft.first_name) || !accountText(appState.accountDraft.email)) {
    setFlashMessage("Inserisci almeno nome ed email dell'account");
    return;
  }

  await baseSaveAccountDraftAccountsWorkspace();
};

const accountsWorkspaceRoot = document.getElementById("app");
if (accountsWorkspaceRoot && accountsWorkspaceRoot.innerHTML) {
  renderApp();
}