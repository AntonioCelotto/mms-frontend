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
  "Vista lavorazione cliente",
];

const ACCOUNT_API_PATH = "/api/accounts";


function accountText(value) {
  return String(value || "").trim();
}

function accountHtml(value) {
  return accountText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function accountName(account) {
  if (account.name) return account.name;
  return `${accountText(account.first_name)} ${accountText(account.last_name)}`.trim() || "Account senza nome";
}

function accountRoleKey(account) {
  const role = accountText(account.role_key || account.role).toLowerCase();
  if (role === "admin" || role === "amministratore") return "admin";
  return "viewer";
}

function accountRoleLabel(account) {
  return accountRoleKey(account) === "admin" ? "Amministratore" : "Operatore";
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

function accountIsActive(account) {
  return account.is_active !== false && account.isActive !== false;
}

function accountsWithTaskCounts() {
  const taskCountByUser = new Map();
  Object.values(appData.orderTasks || {}).flat().forEach((task) => {
    const userId = Number(task.assignedUserId || task.assigned_user_id || task.assignedUserID);
    if (userId) taskCountByUser.set(userId, (taskCountByUser.get(userId) || 0) + 1);
  });

  return (appData.accounts || []).map((account) => {
    const firstName = accountText(account.first_name || account.firstName || accountName(account).split(" ")[0]);
    const lastName =
      accountText(account.last_name || account.lastName) ||
      accountName(account)
        .split(" ")
        .slice(1)
        .join(" ");
    return {
      ...account,
      firstName,
      lastName,
      displayName: accountName(account),
      roleKey: accountRoleKey(account),
      displayRole: accountRoleLabel(account),
      skillsList: uniqueAccountSkills(accountSkills(account)),
      taskCount: Number(account.assigned_tasks || account.assignedTasks || taskCountByUser.get(Number(account.id)) || 0),
      isClientAccess: accountIsClientAccess(account),
      isActive: accountIsActive(account),
    };
  });
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

function accountDraftSkills(rawValue) {
  return uniqueAccountSkills(
    accountText(rawValue)
      .split(",")
      .map(accountText)
      .filter(Boolean)
  );
}

function accountDraftFromAccount(account) {
  return {
    user_id: account.id,
    first_name: account.firstName,
    last_name: account.lastName,
    phone: accountText(account.phone),
    email: accountText(account.email),
    role: account.roleKey,
    is_active: account.isActive,
    skills: account.skillsList.join(", "),
  };
}

function syncAccountProfile(profileKey, editMode = false) {
  const preset = ACCOUNT_PROFILE_PRESETS[profileKey];
  if (!preset) return;
  const target = editMode ? appState.accountEditDraft : appState.accountDraft;
  const currentSkills = accountDraftSkills(target.skills);
  target.role = preset.role;
  target.profile = profileKey;
  target.skills = uniqueAccountSkills([...currentSkills, ...preset.skills]).join(", ");
  renderApp();
}

function addAccountQuickSkill(skill, editMode = false) {
  const target = editMode ? appState.accountEditDraft : appState.accountDraft;
  target.skills = uniqueAccountSkills([...accountDraftSkills(target.skills), skill]).join(", ");
  renderApp();
}

function renderAccountSkillMap(accounts) {
  return ["Cartamodello", "Taglio", "Confezione", "Controllo ordini", "calendario", "pagamenti", "magazzino"]
    .map((skill) => {
      const owners = accounts
        .filter((account) => account.isActive && account.skillsList.some((item) => item.toLowerCase() === skill.toLowerCase()))
        .map((account) => account.displayName);
      return `
        <div class="alert-item">
          <strong>${accountHtml(skill)}</strong>
          <span>${owners.length ? accountHtml(owners.join(", ")) : "Da assegnare"}</span>
        </div>
      `;
    })
    .join("");
}

function renderAccountRows(accounts) {
  return accounts
    .map((account) => {
      const deleteLabel = account.taskCount > 0 ? "Disattiva" : "Elimina";
      return `
        <tr>
          <td>
            <strong>${accountHtml(account.displayName)}</strong>
            <div class="muted">${accountHtml(account.email) || "Email da completare"}</div>
          </td>
          <td><span class="table-status ${account.displayRole === "Amministratore" ? "progress" : "done"}">${accountHtml(accountProfileFromSkills(account))}</span></td>
          <td>${accountHtml(account.phone) || "Telefono da completare"}</td>
          <td>${account.skillsList.length ? accountHtml(account.skillsList.join(", ")) : "Skill da inserire"}</td>
          <td>${account.taskCount}</td>
          <td><span class="table-status ${account.isActive ? "done" : "hold"}">${account.isActive ? "Attivo" : "Disattivato"}</span></td>
          <td>
            <div class="pill-row">
              <button class="mini-btn" data-account-edit="${account.id}">Modifica</button>
              <button class="mini-btn" data-account-delete="${account.id}">${deleteLabel}</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderAccountEditPanel(accounts) {
  const selectedId = Number(appState.accountEditId || 0);
  const selected = accounts.find((account) => Number(account.id) === selectedId);
  if (!selected || !appState.accountEditDraft) return "";
  const draft = appState.accountEditDraft;

  return `
    <div class="surface">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Modifica account</h3>
            <p>${accountHtml(selected.displayName)} - aggiorna dati, ruolo, stato e competenze.</p>
          </div>
          <button class="mini-btn" data-account-cancel-edit>Annulla</button>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>Nome</label>
            <input class="field-value" data-account-edit-field="first_name" value="${accountHtml(draft.first_name)}" />
          </div>
          <div class="field">
            <label>Cognome</label>
            <input class="field-value" data-account-edit-field="last_name" value="${accountHtml(draft.last_name)}" />
          </div>
          <div class="field">
            <label>Telefono</label>
            <input class="field-value" data-account-edit-field="phone" value="${accountHtml(draft.phone)}" />
          </div>
          <div class="field">
            <label>Email</label>
            <input class="field-value" data-account-edit-field="email" value="${accountHtml(draft.email)}" />
          </div>
          <div class="field">
            <label>Profilo operativo</label>
            <select class="filter-chip" data-account-edit-profile>
              ${Object.entries(ACCOUNT_PROFILE_PRESETS)
                .map(([key, preset]) => `<option value="${key}" ${draft.profile === key ? "selected" : ""}>${preset.label}</option>`)
                .join("")}
            </select>
          </div>
          <div class="field">
            <label>Permesso base</label>
            <select class="filter-chip" data-account-edit-field="role">
              <option value="viewer" ${draft.role === "viewer" ? "selected" : ""}>Operatore / visualizzazione</option>
              <option value="admin" ${draft.role === "admin" ? "selected" : ""}>Amministratore</option>
            </select>
          </div>
          <div class="field">
            <label>Stato</label>
            <select class="filter-chip" data-account-edit-field="is_active">
              <option value="true" ${draft.is_active ? "selected" : ""}>Attivo</option>
              <option value="false" ${!draft.is_active ? "selected" : ""}>Disattivato</option>
            </select>
          </div>
          <div class="field span-2">
            <label>Competenze</label>
            <input class="field-value" data-account-edit-field="skills" value="${accountHtml(draft.skills)}" />
          </div>
        </div>
        <div style="height:14px;"></div>
        <div class="pill-row">
          ${ACCOUNT_QUICK_SKILLS.map((skill) => `<button class="mini-btn" data-account-edit-skill="${accountHtml(skill)}">+ ${accountHtml(skill)}</button>`).join("")}
        </div>
        <div style="height:16px;"></div>
        <button class="action-pill" data-account-save-edit>${appState.busy ? "Salvataggio..." : "Salva modifiche account"}</button>
      </div>
    </div>
  `;
}

function renderAccounts() {
  const accounts = accountsWithTaskCounts();
  const activeAccounts = accounts.filter((account) => account.isActive);
  const admins = activeAccounts.filter((account) => account.displayRole === "Amministratore");
  const operators = activeAccounts.filter((account) => account.displayRole !== "Amministratore" && !account.isClientAccess);
  const assignedTasks = accounts.reduce((sum, account) => sum + account.taskCount, 0);
  const clientAccesses = accounts.filter((account) => account.isClientAccess);
  const draft = appState.accountDraft;

  return `
    <section class="view ${appState.currentView === "accounts" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Account, ruoli e competenze</h2>
          <p>Gestione completa degli account: creazione, modifica, disattivazione, competenze e collegamento ai task.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">Account v9</div>
          <div class="ghost-pill">${accounts.length} account totali</div>
          <button class="action-pill" data-action="save-account">${appState.busy ? "Salvataggio..." : "Crea account"}</button>
        </div>
      </div>

      <div class="metric-boxes">
        <div class="metric-box surface"><small>Account attivi</small><strong>${activeAccounts.length}</strong><span>Utenti abilitati nel gestionale.</span></div>
        <div class="metric-box surface"><small>Operatori produzione</small><strong>${operators.length}</strong><span>Profili che ricevono task di lavorazione.</span></div>
        <div class="metric-box surface"><small>Amministratori</small><strong>${admins.length}</strong><span>Profili con gestione operativa estesa.</span></div>
        <div class="metric-box surface"><small>Task assegnati</small><strong>${assignedTasks}</strong><span>Lavorazioni collegate agli account.</span></div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Crea account</h3>
                <p>Compila i dati minimi e assegna subito profilo e competenze.</p>
              </div>
            </div>
            <div class="form-grid">
              <div class="field">
                <label>Nome</label>
                <input class="field-value" data-account-field="first_name" value="${accountHtml(draft.first_name)}" />
              </div>
              <div class="field">
                <label>Cognome</label>
                <input class="field-value" data-account-field="last_name" value="${accountHtml(draft.last_name)}" />
              </div>
              <div class="field">
                <label>Telefono</label>
                <input class="field-value" data-account-field="phone" value="${accountHtml(draft.phone)}" />
              </div>
              <div class="field">
                <label>Email</label>
                <input class="field-value" data-account-field="email" value="${accountHtml(draft.email)}" />
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
                <input class="field-value" data-account-field="skills" value="${accountHtml(draft.skills)}" placeholder="Esempio: Cartamodello, Taglio, Confezione" />
              </div>
            </div>
            <div style="height:14px;"></div>
            <div class="pill-row">
              ${ACCOUNT_QUICK_SKILLS.map((skill) => `<button class="mini-btn" data-account-skill="${accountHtml(skill)}">+ ${accountHtml(skill)}</button>`).join("")}
            </div>
          </div>
        </div>

        <div style="display:grid; gap:16px;">
          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Regole operative</h3>
                  <p>Gli account dei dipendenti saranno collegati ai task tramite le competenze.</p>
                </div>
              </div>
              <div class="alert-list">
                <div class="alert-item"><strong>Modifica account</strong><span>Aggiorna dati, ruolo, stato e skill senza ricreare l'utente.</span></div>
                <div class="alert-item"><strong>Elimina o disattiva</strong><span>Se non ha task viene eliminato; se ha storico lavori viene disattivato.</span></div>
                <div class="alert-item"><strong>Accesso cliente</strong><span>Resta visibile nella tabella, ma distinto dagli operatori interni.</span></div>
              </div>
            </div>
          </div>

          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Accessi cliente</h3>
                  <p>Account con visibilita' limitata sullo stato degli ordini.</p>
                </div>
              </div>
              <div class="alert-list">
                ${
                  clientAccesses.length
                    ? clientAccesses
                        .map(
                          (account) => `
                            <div class="alert-item">
                              <strong>${accountHtml(account.displayName)}</strong>
                              <span>${accountHtml(account.email)} - ${accountHtml(account.skillsList.join(", "))}</span>
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

      ${renderAccountEditPanel(accounts)}

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Account operativi</h3>
                <p>Tutti gli account del gestionale, inclusi accessi cliente e profili disattivati.</p>
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
                  <th>Azioni</th>
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

async function refreshAccountsWorkspaceData({ rerender = true } = {}) {
  try {
    const response = await fetch(ACCOUNT_API_PATH);
    if (!response.ok) return false;
    const payload = await response.json();
    if (payload && Array.isArray(payload.accounts)) {
      appData.accounts = payload.accounts;
      if (rerender && appState.currentView === "accounts") renderApp();
      return true;
    }
  } catch (error) {
    console.warn("Accounts API not available", error);
  }
  return false;
}

function accountCreatePayload() {
  return {
    first_name: accountText(appState.accountDraft.first_name),
    last_name: accountText(appState.accountDraft.last_name),
    phone: accountText(appState.accountDraft.phone),
    email: accountText(appState.accountDraft.email).toLowerCase(),
    role: appState.accountDraft.role === "admin" ? "admin" : "viewer",
    skills: accountDraftSkills(appState.accountDraft.skills),
  };
}

async function createAccountViaApi(payload) {
  const response = await fetch(ACCOUNT_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.detail || result.error || `Creazione account API non riuscita (${response.status})`);
  }
  return result;
}


async function updateAccountDraft() {
  const draft = appState.accountEditDraft;
  if (!draft?.user_id) return;
  const skills = accountDraftSkills(draft.skills);
  if (!accountText(draft.first_name) || !accountText(draft.email)) {
    setFlashMessage("Inserisci almeno nome ed email dell'account");
    return;
  }

  setBusy(true);
  try {
    const response = await fetch(ACCOUNT_API_PATH, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: draft.user_id,
        first_name: draft.first_name,
        last_name: draft.last_name,
        phone: draft.phone,
        email: draft.email,
        role: draft.role,
        is_active: draft.is_active !== false && draft.is_active !== "false",
        skills,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.detail || "Aggiornamento account non riuscito");
    }
    await refreshBootstrap();
    await refreshAccountsWorkspaceData({ rerender: false });
    appState.accountEditId = "";
    appState.accountEditDraft = null;
    setFlashMessage("Account aggiornato");
  } catch (error) {
    setFlashMessage(error.message || "Errore durante l'aggiornamento account");
  } finally {
    appState.busy = false;
    renderApp();
  }
}

async function deleteOrDeactivateAccount(accountId) {
  const accounts = accountsWithTaskCounts();
  const account = accounts.find((item) => Number(item.id) === Number(accountId));
  if (!account) return;
  const actionLabel = account.taskCount > 0 ? "disattivare" : "eliminare";
  if (!window.confirm(`Vuoi ${actionLabel} ${account.displayName}?`)) return;

  setBusy(true);
  try {
    const response = await fetch(ACCOUNT_API_PATH, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: account.id }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.detail || "Eliminazione account non riuscita");
    }
    const result = await response.json().catch(() => ({}));
    await refreshBootstrap();
    await refreshAccountsWorkspaceData({ rerender: false });
    appState.accountEditId = "";
    appState.accountEditDraft = null;
    setFlashMessage(result.message || "Account aggiornato");
  } catch (error) {
    setFlashMessage(error.message || "Errore durante l'eliminazione account");
  } finally {
    appState.busy = false;
    renderApp();
  }
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

  document.querySelectorAll("[data-account-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const account = accountsWithTaskCounts().find((item) => Number(item.id) === Number(button.dataset.accountEdit));
      if (!account) return;
      appState.accountEditId = account.id;
      appState.accountEditDraft = accountDraftFromAccount(account);
      renderApp();
    });
  });

  document.querySelectorAll("[data-account-edit-field]").forEach((input) => {
    const handler = (event) => {
      const field = event.target.dataset.accountEditField;
      appState.accountEditDraft[field] = field === "is_active" ? event.target.value === "true" : event.target.value;
    };
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });

  document.querySelectorAll("[data-account-edit-profile]").forEach((select) => {
    select.addEventListener("change", (event) => syncAccountProfile(event.target.value, true));
  });

  document.querySelectorAll("[data-account-edit-skill]").forEach((button) => {
    button.addEventListener("click", () => addAccountQuickSkill(button.dataset.accountEditSkill, true));
  });

  document.querySelectorAll("[data-account-cancel-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.accountEditId = "";
      appState.accountEditDraft = null;
      renderApp();
    });
  });

  document.querySelectorAll("[data-account-save-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!appState.busy) updateAccountDraft();
    });
  });

  document.querySelectorAll("[data-account-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!appState.busy) deleteOrDeactivateAccount(Number(button.dataset.accountDelete));
    });
  });
};

saveAccountDraft = async function saveAccountDraftAccountsWorkspace() {
  const payload = accountCreatePayload();
  appState.accountDraft.skills = payload.skills.join(", ");

  if (!payload.first_name || !payload.email) {
    setFlashMessage("Inserisci almeno nome ed email dell'account");
    return;
  }
  if (!payload.email.includes("@")) {
    setFlashMessage("Email account non valida");
    return;
  }

  setBusy(true);
  try {
    await createAccountViaApi(payload);
    await refreshBootstrap();
    await refreshAccountsWorkspaceData({ rerender: false });
    appState.accountDraft = { first_name: "", last_name: "", phone: "", email: "", role: "viewer", skills: "" };
    setFlashMessage("Account creato");
  } catch (error) {
    setFlashMessage(error.message || "Creazione account non riuscita");
  } finally {
    appState.busy = false;
    renderApp();
  }
};

const accountsWorkspaceRoot = document.getElementById("app");
if (accountsWorkspaceRoot && accountsWorkspaceRoot.innerHTML) {
  renderApp();
}

refreshAccountsWorkspaceData();