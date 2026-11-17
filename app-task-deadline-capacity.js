(function () {
  const DAY_KEYS = ["domenica", "lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato"];
  const DEFAULT_DAYS = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi"];
  const DEFAULT_HOURS = 8;

  function text(value) {
    return String(value ?? "").trim();
  }

  function normalize(value) {
    return text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  }

  function numberValue(value) {
    const parsed = Number(text(value).replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function parseDate(value) {
    const match = text(value).match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) return null;
    const date = new Date(`${match[1]}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function today() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  }

  function accountName(account) {
    return account?.name || account?.displayName || [account?.first_name, account?.last_name].filter(Boolean).join(" ") || account?.email || "Operatrice";
  }

  function accountFor(assignedUserId) {
    return (appData.accounts || []).find((account) => String(account.id) === String(assignedUserId)) || null;
  }

  function workingDays(account) {
    const raw = account?.working_days || account?.workingDays;
    const values = Array.isArray(raw) ? raw : text(raw).split(",");
    const normalized = values.map(normalize).filter(Boolean);
    return new Set(normalized.length ? normalized : DEFAULT_DAYS);
  }

  function dailyHours(account) {
    return numberValue(account?.daily_work_hours || account?.dailyWorkHours) || DEFAULT_HOURS;
  }

  function isWorkingDay(date, days) {
    return days.has(DAY_KEYS[date.getDay()]);
  }

  function isCompleted(task) {
    return normalize(task?.state || task?.status).includes("complet");
  }

  function schedulingRows(candidate) {
    const rows = new Map(), aliases = new Map();
    let serial = 0;
    const currentOrder = String(appState.selectedOrderId || candidate.orderId || candidate.order_id || "preview");
    function add(task, orderId, fallback) {
      const ids = [task?.id && `id:${task.id}`, (task?.clientTaskKey || task?.client_task_key) && `client:${task.clientTaskKey || task.client_task_key}`].filter(Boolean);
      const key = ids.map(id => aliases.get(id)).find(Boolean) || ids[0] || fallback;
      const previous = rows.get(key);
      rows.set(key, {key, task: {...previous?.task, ...task}, orderId: String(orderId || previous?.orderId || currentOrder), serial: previous?.serial ?? serial++});
      ids.forEach(id => aliases.set(id, key));
      return key;
    }
    Object.entries(appData.orderTasks || {}).forEach(([orderId, tasks]) => {
      (Array.isArray(tasks) ? tasks : []).forEach((task,index) => add(task,orderId,`saved:${orderId}:${index}`));
    });
    const draft = currentDraft();
    if (Array.isArray(draft?.tasks)) {
      // The current editor is authoritative for its rows, including removals.
      if (currentOrder !== "preview") for (const [key,row] of rows) if (row.orderId === currentOrder) rows.delete(key);
      draft.tasks.forEach((task,index) => add(task,currentOrder,`draft:${index}`));
    }
    const candidateKey = add(candidate,currentOrder,"candidate");
    const maxId = Math.max(0,...Array.from(rows.values(),row => /^\d+$/.test(text(row.task.id)) ? Number(row.task.id) : 0));
    const adapted = Array.from(rows.values(),row => {
      const task=row.task;
      const rawDate=text(task.time || task.planned_date || task.dueDate || task.due_date);
      const date=rawDate.slice(0,10), explicit=task.plannedTime ?? rawDate.match(/[ T](\d{2}:\d{2})/)?.[1] ?? "";
      const assignee=task.assignedUserId ?? task.assigned_user_id;
      const external=String(assignee||"").startsWith("external:") ? decodeURIComponent(String(assignee).slice(9)) : task.externalSupplierName || task.external_supplier_name;
      const id=/^\d+$/.test(text(task.id)) ? Number(task.id) : maxId+row.serial+1;
      const order=(appData.orders || []).find(order=>String(order.id)===row.orderId);
      return {id,order_id:order?.db_id || order?.internal_id || row.orderId,assigned_user_id:external?null:assignee,
        external_supplier_name:external || "",task_phase:task.phase || task.task_phase || "altro",
        estimated_hours:numberValue(task.hours ?? task.estimated_hours ?? task.estimatedHours),
        actual_hours:numberValue(task.actualHours ?? task.actual_hours),
        status:isCompleted(task)?"completato":normalize(task.state || task.status).replace(/\s+/g,"_"),
        planned_date:parseDate(date)?[date,explicit].filter(Boolean).join(" "):"",
        due_date:text(task.dueDate || task.due_date || date).slice(0,10),
        article_key:task.articleKey || task.article_key || "",sequence_order:task.sequenceOrder || task.sequence_order || 99,
        previewKey:row.key};
    });
    return {rows:adapted,candidate:adapted.find(row=>row.previewKey===candidateKey)};
  }

  function formatDate(value) {
    const date = parseDate(value);
    return date ? date.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" }) : value;
  }

  function checkTask(task) {
    const assignedUserId = task?.assignedUserId || task?.assigned_user_id || "";
    const hours = numberValue(task?.hours || task?.estimated_hours || task?.estimatedHours);
    const deadline = parseDate(task?.dueDate || task?.due_date || task?.time || task?.planned_date);
    if (!assignedUserId || !hours || !deadline) return { state: "neutral" };
    if (!window.mmsTaskSchedulePreview) return {state:"neutral",unavailable:true};
    const account = accountFor(assignedUserId);
    const preview=schedulingRows({...task,assignedUserId});
    const accounts=(appData.accounts || []).map(person=>({...person,
      daily_work_hours:person.daily_work_hours || person.dailyWorkHours,
      working_days:person.working_days || person.workingDays}));
    const schedule=window.mmsTaskSchedulePreview.schedule(preview.rows,accounts);
    const segments=schedule[preview.candidate.id] || [];
    const firstDate=segments.at(-1)?.date || "";
    const deadlineIso=isoDate(deadline);
    const dayUsed=preview.rows.filter(row=>row.id!==preview.candidate.id && String(row.assigned_user_id||"")===String(assignedUserId))
      .flatMap(row=>schedule[row.id] || []).filter(segment=>segment.date===deadlineIso).reduce((n,segment)=>n+segment.hours,0);
    const freeHours=isWorkingDay(deadline,workingDays(account)) ? Math.max(0,Math.min(8,dailyHours(account))-dayUsed) : 0;
    const overdue=preview.rows.filter(row=>row.id!==preview.candidate.id && String(row.assigned_user_id||"")===String(assignedUserId)
      && row.status!=="completato" && row.due_date && row.due_date<isoDate(today()));
    return {
      state: firstDate && firstDate<=deadlineIso ? "ok" : "error",
      operator: accountName(account),
      freeHours,
      firstDate,
      segments,
      overdueCount:overdue.length,
      overdueHours:overdue.reduce((n,row)=>n+row.estimated_hours,0),
      deadline: deadlineIso,
    };
  }

  function warningMarkup(result, index) {
    if (result.state === "neutral") {
      if(result.unavailable) return '<div class="task-capacity-note neutral">Verifica calendario non disponibile. Ricarica la pagina prima di pianificare.</div>';
      return '<div class="task-capacity-note neutral">Assegna operatrice, ore e data di consegna per verificare la disponibilità.</div>';
    }
    const escape=value=>text(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const arrears=result.overdueCount ? `<span class="task-capacity-arrears">Da verificare separatamente: ${result.overdueCount} task precedenti ancora aperte (${String(result.overdueHours).replace(".",",")} ore). Non sono state spostate né completate automaticamente.</span>` : "";
    if (result.state === "ok") {
      const slots=result.segments.map(part=>`${formatDate(part.date)}: ${part.label}`).join("; ");
      return `<div class="task-capacity-note ok"><div><strong>Consegna possibile entro il ${formatDate(result.deadline)}.</strong><span>${escape(result.operator)}: ${String(result.freeHours).replace(".", ",")} ore disponibili il giorno richiesto, prima di questa task.</span><span>Orario previsto: ${escape(slots)}.</span>${arrears}</div></div>`;
    }
    return `<div class="task-capacity-note error"><div><strong>Consegna non possibile entro il ${formatDate(result.deadline)}.</strong><span>${escape(result.operator)}: ${result.firstDate ? `in base a orari, altri impegni e fasi precedenti, prima data di completamento disponibile: ${formatDate(result.firstDate)}.` : "nessun intervallo pianificabile. Verifica assegnazione e fasi precedenti."}</span>${arrears}</div>${result.firstDate ? `<button class="mini-btn" type="button" data-task-use-first-date="${index}" data-first-date="${result.firstDate}">Usa prima data disponibile</button>` : ""}</div>`;
  }

  function currentDraft() {
    return typeof orderDetailEditCurrentDraft === "function" ? orderDetailEditCurrentDraft() : null;
  }

  function refreshWarnings() {
    if (appState.currentView !== "order-detail") return;
    const draft = currentDraft();
    if (!draft || !Array.isArray(draft.tasks)) return;
    document.querySelectorAll(".order-detail-edit-task").forEach((row, index) => {
      let note = row.querySelector(".task-capacity-note");
      const html = warningMarkup(checkTask(draft.tasks[index]), index);
      if (note) note.outerHTML = html;
      else row.insertAdjacentHTML("beforeend", html);
    });
  }
  window.mmsRefreshTaskCapacity = refreshWarnings;

  function ensureStyles() {
    if (document.getElementById("task-deadline-capacity-styles")) return;
    const style = document.createElement("style");
    style.id = "task-deadline-capacity-styles";
    style.textContent = `
      .task-capacity-note{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 13px;border-radius:8px;border:1px solid var(--line);font-size:14px}
      .task-capacity-note strong,.task-capacity-note span{display:block}
      .task-capacity-note span{margin-top:3px;font-size:13px}
      .task-capacity-note.ok{background:#ecfdf3;border-color:#86efac;color:#166534}
      .task-capacity-note.error{background:#fff1f2;border-color:#fda4af;color:#9f1239}
      .task-capacity-note.neutral{background:#f8fafc;color:var(--muted)}
      .task-capacity-arrears{color:#854d0e}
      .task-capacity-note.error .mini-btn{flex:0 0 auto;background:#fff}
      @media(max-width:760px){.task-capacity-note{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  const baseRenderAppCapacity = renderApp;
  renderApp = function renderAppWithTaskCapacity() {
    baseRenderAppCapacity();
    ensureStyles();
    refreshWarnings();
  };

  const baseAttachEventsCapacity = attachEvents;
  if (typeof orderDetailEditHandleField === "function") {
    const baseField = orderDetailEditHandleField;
    orderDetailEditHandleField = function capacityAfterField(target) {
      const handled = baseField(target);
      if (handled && target.dataset?.orderDetailTaskField) Promise.resolve().then(refreshWarnings);
      return handled;
    };
  }
  attachEvents = function attachEventsWithTaskCapacity() {
    baseAttachEventsCapacity();
    document.querySelectorAll("[data-order-detail-task-field]").forEach((input) => {
      input.addEventListener("input", refreshWarnings);
      input.addEventListener("change", refreshWarnings);
    });
  };
  // Warnings are replaced as fields change; delegation keeps new buttons live.
  document.addEventListener("click", (event) => {
        const button=event.target?.closest?.("[data-task-use-first-date]");
        if(!button) return;
        event.preventDefault();
        const draft = currentDraft();
        const index = Number(button.dataset.taskUseFirstDate);
        const firstDate = button.dataset.firstDate || "";
        if (!draft?.tasks?.[index] || !parseDate(firstDate)) return;
        // Preserve requested start/time. Only the explicit deadline changes;
        // moving the start to a multiday task's end would postpone it again.
        draft.tasks[index].dueDate = firstDate;
        const input = document.querySelector(`[data-order-detail-task-index="${index}"][data-order-detail-task-field="dueDate"]`);
        if (input) input.value = firstDate;
        refreshWarnings();
        if (typeof setFlashMessage === "function") setFlashMessage(`Data aggiornata al ${formatDate(firstDate)}`);
  });

  if (document.getElementById("app")?.innerHTML) renderApp();
})();
