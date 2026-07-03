(function () {
  const WORK_DAYS = [
    ["lunedi", "Lun"],
    ["martedi", "Mar"],
    ["mercoledi", "Mer"],
    ["giovedi", "Gio"],
    ["venerdi", "Ven"],
    ["sabato", "Sab"],
    ["domenica", "Dom"],
  ];
  const DEFAULT_DAYS = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi"];

  function text(value) {
    return String(value ?? "").trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function numberValue(value, fallback) {
    const parsed = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function daysValue(value) {
    if (Array.isArray(value)) return value.map((item) => text(item).toLowerCase()).filter(Boolean);
    return text(value)
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  function ensureAccountScheduleDraft(target) {
    if (!target) return;
    if (target.daily_work_hours == null || target.daily_work_hours === "") target.daily_work_hours = "8";
    if (target.hourly_cost == null || target.hourly_cost === "") target.hourly_cost = "10";
    if (!Array.isArray(target.working_days)) target.working_days = DEFAULT_DAYS.slice();
  }

  function accountScheduleDays(account) {
    const days = daysValue(account?.working_days);
    return days.length ? days : DEFAULT_DAYS;
  }

  function accountScheduleDaysLabel(days) {
    const selected = new Set(accountScheduleDays({ working_days: days }));
    return WORK_DAYS.filter(([key]) => selected.has(key))
      .map(([, label]) => label)
      .join(", ");
  }

  function renderWorkDays(target, editMode = false) {
    ensureAccountScheduleDraft(target);
    const selected = new Set(accountScheduleDays(target));
    const attr = editMode ? "data-account-edit-workday" : "data-account-workday";
    return `
      <div class="field span-2 account-work-days-field">
        <label>Giorni lavorativi</label>
        <div class="account-work-days">
          ${WORK_DAYS.map(
            ([key, label]) => `
              <label class="workday-chip">
                <input type="checkbox" ${attr}="${key}" ${selected.has(key) ? "checked" : ""} />
                <span>${label}</span>
              </label>
            `
          ).join("")}
        </div>
      </div>
    `;
  }

  function scheduleFields(target, editMode = false) {
    ensureAccountScheduleDraft(target);
    const fieldAttr = editMode ? "data-account-edit-field" : "data-account-field";
    return `
      <div class="field">
        <label>Ore lavoro giornaliere</label>
        <input class="field-value" type="number" min="0" step="0.25" ${fieldAttr}="daily_work_hours" value="${escapeHtml(target.daily_work_hours)}" />
      </div>
      <div class="field">
        <label>Costo orario</label>
        <input class="field-value" type="number" min="0" step="0.50" ${fieldAttr}="hourly_cost" value="${escapeHtml(target.hourly_cost)}" />
      </div>
      ${renderWorkDays(target, editMode)}
    `;
  }

  function replaceNth(source, needle, replacement, nth) {
    let index = -1;
    let from = 0;
    for (let count = 0; count < nth; count += 1) {
      index = source.indexOf(needle, from);
      if (index === -1) return source;
      from = index + needle.length;
    }
    return `${source.slice(0, index)}${replacement}${source.slice(index)}`;
  }

  if (typeof accountDraftFromAccount === "function") {
    const baseAccountDraftFromAccountSchedule = accountDraftFromAccount;
    accountDraftFromAccount = function accountDraftFromAccountWithSchedule(account) {
      const draft = baseAccountDraftFromAccountSchedule(account);
      draft.daily_work_hours = account?.daily_work_hours ?? account?.dailyWorkHours ?? "8";
      draft.hourly_cost = account?.hourly_cost ?? account?.hourlyCost ?? "10";
      draft.working_days = accountScheduleDays(account);
      return draft;
    };
  }

  if (typeof accountCreatePayload === "function") {
    const baseAccountCreatePayloadSchedule = accountCreatePayload;
    accountCreatePayload = function accountCreatePayloadWithSchedule() {
      ensureAccountScheduleDraft(appState.accountDraft);
      return {
        ...baseAccountCreatePayloadSchedule(),
        daily_work_hours: numberValue(appState.accountDraft.daily_work_hours, 8),
        hourly_cost: numberValue(appState.accountDraft.hourly_cost, 10),
        working_days: accountScheduleDays(appState.accountDraft),
      };
    };
  }

  if (typeof renderAccountRows === "function") {
    renderAccountRows = function renderAccountRowsWithSchedule(accounts) {
      return accounts
        .map((account) => {
          const deleteLabel = account.taskCount > 0 ? "Disattiva" : "Elimina";
          const dailyHours = account.daily_work_hours ?? account.dailyWorkHours ?? 8;
          const hourlyCost = account.hourly_cost ?? account.hourlyCost ?? 10;
          return `
            <tr>
              <td>
                <strong>${escapeHtml(account.displayName)}</strong>
                <div class="muted">${escapeHtml(account.email) || "Email da completare"}</div>
              </td>
              <td><span class="table-status ${account.displayRole === "Amministratore" ? "progress" : "done"}">${escapeHtml(accountProfileFromSkills(account))}</span></td>
              <td>${escapeHtml(account.phone) || "Telefono da completare"}</td>
              <td>${account.skillsList.length ? escapeHtml(account.skillsList.join(", ")) : "Skill da inserire"}</td>
              <td>${account.taskCount}</td>
              <td><strong>${escapeHtml(dailyHours)} h/g</strong><div class="muted">${escapeHtml(accountScheduleDaysLabel(account.working_days))}</div></td>
              <td>${escapeHtml(hourlyCost)} euro/h</td>
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
    };
  }

  if (typeof renderAccounts === "function") {
    const baseRenderAccountsSchedule = renderAccounts;
    renderAccounts = function renderAccountsWithSchedule() {
      ensureAccountScheduleDraft(appState.accountDraft);
      ensureAccountScheduleDraft(appState.accountEditDraft);
      let html = baseRenderAccountsSchedule();
      const createNeedle = `<div style="height:14px;"></div>\n            <div class="pill-row">`;
      html = replaceNth(html, createNeedle, `${scheduleFields(appState.accountDraft, false)}\n            ${createNeedle}`, 1);
      if (appState.accountEditDraft) {
        html = replaceNth(html, createNeedle, `${scheduleFields(appState.accountEditDraft, true)}\n        ${createNeedle}`, 2);
      }
      html = html.replace(
        `<th>Task</th>\n                  <th>Stato</th>`,
        `<th>Task</th>\n                  <th>Ore/giorni</th>\n                  <th>Costo ora</th>\n                  <th>Stato</th>`
      );
      return html;
    };
  }

  if (typeof updateAccountDraft === "function") {
    updateAccountDraft = async function updateAccountDraftWithSchedule() {
      const draft = appState.accountEditDraft;
      if (!draft?.user_id) return;
      ensureAccountScheduleDraft(draft);
      const skills = typeof accountDraftSkills === "function" ? accountDraftSkills(draft.skills) : text(draft.skills).split(",").map(text).filter(Boolean);
      if (!text(draft.first_name) || !text(draft.email)) {
        setFlashMessage("Inserisci almeno nome ed email dell'account");
        return;
      }

      setBusy(true);
      try {
        const response = await fetch("/api/accounts", {
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
            daily_work_hours: numberValue(draft.daily_work_hours, 8),
            hourly_cost: numberValue(draft.hourly_cost, 10),
            working_days: accountScheduleDays(draft),
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
    };
  }

  const baseAttachEventsSchedule = attachEvents;
  attachEvents = function attachEventsAccountSchedule() {
    baseAttachEventsSchedule();

    document.querySelectorAll("[data-account-workday]").forEach((input) => {
      input.addEventListener("change", () => {
        ensureAccountScheduleDraft(appState.accountDraft);
        const day = input.dataset.accountWorkday;
        const days = new Set(accountScheduleDays(appState.accountDraft));
        if (input.checked) days.add(day);
        else days.delete(day);
        appState.accountDraft.working_days = [...days];
        renderApp();
      });
    });

    document.querySelectorAll("[data-account-edit-workday]").forEach((input) => {
      input.addEventListener("change", () => {
        ensureAccountScheduleDraft(appState.accountEditDraft);
        const day = input.dataset.accountEditWorkday;
        const days = new Set(accountScheduleDays(appState.accountEditDraft));
        if (input.checked) days.add(day);
        else days.delete(day);
        appState.accountEditDraft.working_days = [...days];
        renderApp();
      });
    });
  };

  function ensureStyles() {
    if (document.getElementById("account-work-schedule-styles")) return;
    const style = document.createElement("style");
    style.id = "account-work-schedule-styles";
    style.textContent = `
      .account-work-days{display:flex;flex-wrap:wrap;gap:8px}
      .workday-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:rgba(255,255,255,.72);font-size:12px;cursor:pointer}
      .workday-chip input{margin:0;accent-color:var(--accent)}
      .account-work-days-field{align-self:end}
    `;
    document.head.appendChild(style);
  }

  const baseRenderAppSchedule = renderApp;
  renderApp = function renderAppAccountWorkSchedule() {
    ensureStyles();
    baseRenderAppSchedule();
  };

  if (document.getElementById("app")?.innerHTML) renderApp();
})();