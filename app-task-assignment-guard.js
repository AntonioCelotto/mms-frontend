const TASK_ASSIGNMENT_SKILL_MAP = {
  cartamodello: ["cartamodello", "modello", "modellistica", "pattern"],
  taglio: ["taglio", "cut"],
  confezione: ["confezione", "cucito", "sartoria", "avanzamento lavori", "produzione"],
};

const TASK_ASSIGNMENT_EXCLUDED_SKILLS = [
  "vista lavorazione cliente",
  "dashboard",
  "pagamenti",
  "permessi",
  "configurazioni",
  "preventivi",
  "approvazioni",
];

let taskAssignmentSupabaseAccounts = [];
let taskAssignmentLoadingAccounts = false;

function taskAssignmentEscape(value) {
  if (typeof orderFlowEscape === "function") return orderFlowEscape(value);
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function taskAssignmentNormalize(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function taskAssignmentAccountName(account) {
  return account.name || [account.first_name, account.last_name].filter(Boolean).join(" ").trim() || [account.firstName, account.lastName].filter(Boolean).join(" ").trim() || account.email || "Operatore";
}

function taskAssignmentAccountSkills(account) {
  const raw = account.skills || account.skill_names || account.skillNames || account.skillName || account.roleSkills || "";
  if (Array.isArray(raw)) return raw.map((item) => String(item || "").trim()).filter(Boolean);
  return String(raw || "").split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
}

function taskAssignmentIsExternalOption(account) {
  return String(account.id || "").startsWith("external:") || !account.id;
}

function taskAssignmentIsActive(account) {
  return !(account.is_active === false || account.isActive === false || account.active === false);
}

function taskAssignmentIsOperationalAccount(account) {
  const name = taskAssignmentNormalize(taskAssignmentAccountName(account));
  const email = taskAssignmentNormalize(account.email || "");
  const role = taskAssignmentNormalize(account.role || "");
  const skills = taskAssignmentAccountSkills(account).map(taskAssignmentNormalize);

  if (!taskAssignmentIsActive(account)) return false;
  if (name.includes("cliente portal") || email.includes("cliente@portal")) return false;
  if (taskAssignmentIsExternalOption(account)) return true;

  const hasProductionSkill = skills.some((skill) =>
    ["cartamodello", "taglio", "confezione", "cucito", "sartoria", "produzione", "laboratori", "controllo ordini", "avanzamento lavori"].some((needle) => skill.includes(needle))
  );
  const hasOnlyExcludedSkills = skills.length > 0 && skills.every((skill) => TASK_ASSIGNMENT_EXCLUDED_SKILLS.some((needle) => skill.includes(needle)));

  if (hasOnlyExcludedSkills) return false;
  if (role.includes("admin") || role.includes("amministratore")) return hasProductionSkill;
  return hasProductionSkill || skills.length === 0;
}

function taskAssignmentScoreForPhase(account, phase) {
  const normalizedPhase = taskAssignmentNormalize(phase);
  const needles = TASK_ASSIGNMENT_SKILL_MAP[normalizedPhase] || [];
  const skills = taskAssignmentAccountSkills(account).map(taskAssignmentNormalize);
  if (!needles.length || !skills.length) return 0;
  return skills.some((skill) => needles.some((needle) => skill.includes(taskAssignmentNormalize(needle)))) ? 2 : 0;
}

function taskAssignmentAccountValue(account) {
  if (account.id) return String(account.id).startsWith("external:") ? String(account.id) : String(account.id);
  return `external:${encodeURIComponent(taskAssignmentAccountName(account))}`;
}

function taskAssignmentShapeAccount(account) {
  const skills = taskAssignmentAccountSkills(account);
  return {
    value: taskAssignmentAccountValue(account),
    label: taskAssignmentAccountName(account),
    skills,
    search: taskAssignmentNormalize(`${taskAssignmentAccountName(account)} ${skills.join(" ")}`),
    external: taskAssignmentIsExternalOption(account),
  };
}

async function taskAssignmentLoadSupabaseAccounts(force = false) {
  if (taskAssignmentLoadingAccounts) return;
  if (!force && taskAssignmentSupabaseAccounts.length) return;
  if (typeof orderFlowRequest !== "function") return;

  taskAssignmentLoadingAccounts = true;
  try {
    const [users, skills] = await Promise.all([
      orderFlowRequest("/rest/v1/users?select=id,first_name,last_name,email,role,is_active&order=first_name.asc"),
      orderFlowRequest("/rest/v1/user_skills?select=user_id,skill_name&order=skill_name.asc"),
    ]);
    const skillsByUser = new Map();
    (Array.isArray(skills) ? skills : []).forEach((skill) => {
      const userId = Number(skill.user_id);
      if (!skillsByUser.has(userId)) skillsByUser.set(userId, []);
      if (skill.skill_name) skillsByUser.get(userId).push(skill.skill_name);
    });
    taskAssignmentSupabaseAccounts = (Array.isArray(users) ? users : []).map((user) => ({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      skills: skillsByUser.get(Number(user.id)) || [],
    }));
  } catch (error) {
    console.warn("Dipendenti non caricati per assegnazione task", error);
  } finally {
    taskAssignmentLoadingAccounts = false;
  }
}

function taskAssignmentRawAccounts() {
  const fallback = typeof getFallbackAssignableAccounts === "function" ? getFallbackAssignableAccounts() : [];
  if (Array.isArray(appData.accounts) && appData.accounts.length) return appData.accounts;
  if (taskAssignmentSupabaseAccounts.length) return taskAssignmentSupabaseAccounts;
  taskAssignmentLoadSupabaseAccounts().then(() => {
    if (appState.currentView === "new-order" || appState.currentView === "calendar") renderApp();
  }).catch(() => {});
  return fallback;
}

function taskAssignmentAccounts() {
  const accounts = taskAssignmentRawAccounts();
  const operational = accounts.filter(taskAssignmentIsOperationalAccount);
  const usable = operational.length ? operational : accounts.filter((account) => taskAssignmentIsActive(account) && !taskAssignmentNormalize(taskAssignmentAccountName(account)).includes("cliente portal"));
  return usable.map(taskAssignmentShapeAccount);
}

function orderFlowEmployeeOptions() {
  return taskAssignmentAccounts();
}

function taskAssignmentOptionsMarkup(phase, selectedValue) {
  const accounts = taskAssignmentAccounts()
    .map((account) => ({ ...account, score: taskAssignmentScoreForPhase({ skills: account.skills }, phase) }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  if (!accounts.length) return `<option value="">${taskAssignmentLoadingAccounts ? "Caricamento dipendenti..." : "Nessun dipendente operativo configurato"}</option>`;

  const exact = accounts.filter((account) => account.score > 0);
  const others = accounts.filter((account) => account.score === 0);
  const renderOption = (account) => {
    const skills = account.skills.length ? ` - ${account.skills.join(", ")}` : "";
    return `<option value="${taskAssignmentEscape(account.value)}" ${String(selectedValue || "") === String(account.value) ? "selected" : ""}>${taskAssignmentEscape(account.label + skills)}</option>`;
  };

  return `
    <option value="">Seleziona dipendente</option>
    ${exact.length ? `<optgroup label="Consigliati per ${taskAssignmentEscape(phase)}">${exact.map(renderOption).join("")}</optgroup>` : ""}
    ${others.length ? `<optgroup label="Altri operatori">${others.map(renderOption).join("")}</optgroup>` : ""}
  `;
}

function taskAssignmentMissingPlanItems() {
  if (typeof orderFlowPlan !== "function") return [];
  return orderFlowPlan().filter((item) => item.enabled && !item.assignedUserId);
}

function taskAssignmentAssigneePayload(value) {
  if (typeof orderFlowParseAssignee === "function") return orderFlowParseAssignee(value);
  const raw = String(value || "");
  if (!raw) return { assigned_user_id: null, external_supplier_name: null };
  if (raw.startsWith("external:")) return { assigned_user_id: null, external_supplier_name: decodeURIComponent(raw.slice(9)) };
  const parsed = Number(raw.replace(/^user:/, ""));
  if (Number.isFinite(parsed) && parsed > 0) return { assigned_user_id: parsed, external_supplier_name: null };
  return { assigned_user_id: null, external_supplier_name: raw };
}

function taskAssignmentDateTime(dateValue, timeValue) {
  if (typeof orderFlowDateTime === "function") return orderFlowDateTime(dateValue, timeValue);
  const date = String(dateValue || "").trim();
  const time = String(timeValue || "").trim();
  return date ? (time ? `${date} ${time}` : date) : null;
}

async function taskAssignmentPatchTask(taskId, assigneeValue, plannedDate, plannedTime, notes) {
  const assignee = taskAssignmentAssigneePayload(assigneeValue);
  if (!taskId || (!assignee.assigned_user_id && !assignee.external_supplier_name)) throw new Error("Dipendente non valido");
  const planned = taskAssignmentDateTime(plannedDate, plannedTime);
  const calendarDay = typeof getCalendarDayFromDate === "function" ? getCalendarDayFromDate(plannedDate) : null;
  const payload = {
    task_id: Number(taskId),
    assigned_user_id: assignee.assigned_user_id,
    external_supplier_name: assignee.external_supplier_name,
    planned_date: planned || null,
    calendar_day_label: calendarDay && calendarDay !== "Da pianificare" ? calendarDay : null,
    notes: notes || "Assegnazione task",
  };

  try {
    const response = await fetch("/api/assign-task", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) return true;
  } catch (error) {
    console.warn("API assegnazione non disponibile, uso Supabase diretto", error);
  }

  await orderFlowRequest(`/rest/v1/order_tasks?id=eq.${Number(taskId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      assigned_user_id: assignee.assigned_user_id,
      external_supplier_name: assignee.external_supplier_name,
      planned_date: planned || null,
      calendar_day_label: payload.calendar_day_label,
      notes: payload.notes,
    }),
  });
  return true;
}

async function orderFlowApplyTaskPlan(order) {
  const selected = orderFlowPlan().filter((item) => item.enabled && item.assignedUserId);
  if (!selected.length) return 0;
  const tasks = await orderFlowLoadTasks(order);
  let count = 0;
  for (const plan of selected) {
    const task = tasks.find((item) => String(item.phase || "").toLowerCase() === String(plan.phase || "").toLowerCase());
    if (!task?.id) continue;
    await taskAssignmentPatchTask(task.id, plan.assignedUserId, plan.plannedDate, plan.plannedTime, "Assegnazione impostata durante la creazione ordine");
    count += 1;
  }
  if (count) await orderFlowLoadTasks(order);
  return count;
}

function orderFlowTaskPanelMarkup() {
  const plan = orderFlowPlan();
  return `
    <div class="surface order-task-plan-panel" style="margin-top:16px; border:1px solid rgba(120, 80, 40, 0.22);">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Task e assegnazioni iniziali</h3>
            <p>Assegna subito ogni lavorazione attiva al dipendente corretto. Il menu mette in alto chi ha competenze adatte alla fase.</p>
          </div>
          <div class="ghost-pill">Responsabile obbligatorio</div>
        </div>
        <div class="task-list">
          ${plan.map((item, index) => `
            <div class="task-item" style="grid-template-columns: minmax(150px, 1fr) minmax(220px, 1.3fr) minmax(140px, .8fr) minmax(120px, .7fr); align-items:end;">
              <div>
                <label class="muted" style="display:block; margin-bottom:6px;"><input type="checkbox" data-order-flow-plan-index="${index}" data-order-flow-plan-field="enabled" ${item.enabled ? "checked" : ""} /> Attivo</label>
                <strong>${taskAssignmentEscape(item.label)} ordine</strong>
              </div>
              <div>
                <label class="muted" style="display:block; margin-bottom:6px;">Assegna a</label>
                <select class="filter-chip" data-order-flow-plan-index="${index}" data-order-flow-plan-field="assignedUserId" ${item.enabled ? "required" : ""}>
                  ${taskAssignmentOptionsMarkup(item.phase, item.assignedUserId)}
                </select>
              </div>
              <div>
                <label class="muted" style="display:block; margin-bottom:6px;">Data</label>
                <input class="field-value" type="date" data-order-flow-plan-index="${index}" data-order-flow-plan-field="plannedDate" value="${taskAssignmentEscape(item.plannedDate)}" />
              </div>
              <div>
                <label class="muted" style="display:block; margin-bottom:6px;">Ora</label>
                <input class="field-value" type="time" data-order-flow-plan-index="${index}" data-order-flow-plan-field="plannedTime" value="${taskAssignmentEscape(item.plannedTime)}" />
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function taskAssignmentSelectedCalendarTask() {
  const taskId = Number(appState.assignmentDraft?.taskId || 0);
  const tasks = appData.orderTasks?.[appState.selectedOrderId] || [];
  return tasks.find((task) => Number(task.id) === taskId) || null;
}

function taskAssignmentEnhanceCalendar() {
  if (appState.currentView !== "calendar") return;
  const section = document.querySelector("section.view.active");
  if (!section) return;
  const selects = Array.from(section.querySelectorAll("select"));
  const assigneeSelect = selects.find((select) => {
    const label = select.closest(".field")?.querySelector("label")?.textContent || "";
    const text = `${label} ${Array.from(select.options || []).map((option) => option.textContent || "").join(" ")}`.toLowerCase();
    return text.includes("dipendente") || text.includes("seleziona dipendente");
  });
  if (!assigneeSelect) return;

  const task = taskAssignmentSelectedCalendarTask();
  const selected = String(appState.assignmentDraft?.assignedUserId || assigneeSelect.value || "");
  const markup = taskAssignmentOptionsMarkup(task?.phase || "", selected);
  if (assigneeSelect.dataset.taskAssignmentMarkup !== markup) {
    assigneeSelect.innerHTML = markup;
    assigneeSelect.value = selected;
    assigneeSelect.dataset.taskAssignmentMarkup = markup;
  }
  assigneeSelect.onchange = (event) => {
    appState.assignmentDraft.assignedUserId = event.target.value;
  };
}

const baseSaveDraftOrderTaskAssignmentGuard = saveDraftOrder;
saveDraftOrder = async function saveDraftOrderWithTaskAssignmentGuard() {
  const missing = taskAssignmentMissingPlanItems();
  if (missing.length) {
    setFlashMessage(`Prima di salvare assegna: ${missing.map((item) => item.label).join(", ")}. Se non serve, disattiva il task.`);
    renderApp();
    return;
  }
  await baseSaveDraftOrderTaskAssignmentGuard();
};

saveTaskAssignment = async function saveTaskAssignmentWithTaskAssignmentGuard() {
  const taskId = Number(appState.assignmentDraft?.taskId || 0);
  const assignee = String(appState.assignmentDraft?.assignedUserId || "");
  if (!taskId || !assignee) {
    setFlashMessage("Seleziona task e dipendente");
    renderApp();
    return;
  }
  setBusy(true);
  try {
    await taskAssignmentPatchTask(taskId, assignee, appState.assignmentDraft.plannedDate, appState.assignmentDraft.plannedTime, "Assegnazione aggiornata dalla UI calendario");
    await refreshBootstrap();
    setFlashMessage("Assegnazione calendario salvata");
  } catch (error) {
    setFlashMessage(error.message || "Errore nell'assegnazione");
  } finally {
    appState.busy = false;
    renderApp();
  }
};

const baseRenderAppTaskAssignmentGuard = renderApp;
renderApp = function renderAppWithTaskAssignmentGuard() {
  baseRenderAppTaskAssignmentGuard();
  taskAssignmentEnhanceCalendar();
};

taskAssignmentLoadSupabaseAccounts().then(() => {
  if (appState.currentView === "new-order" || appState.currentView === "calendar") renderApp();
}).catch(() => {});
