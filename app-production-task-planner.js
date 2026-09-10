(function () {
  const phaseOrder = { cartamodello: 1, taglio: 2, confezione: 3, controllo: 4, altro: 99 };

  function esc(value) {
    return typeof orderDetailEditEscape === "function" ? orderDetailEditEscape(value) : String(value || "");
  }

  function currentArticles() {
    const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
    const payload = order?.sourceQuotePayload || order?.source_quote_payload || {};
    const rows = Array.isArray(payload.articles) ? payload.articles : [];
    return rows.map((article, index) => {
      const materials = Array.isArray(article?.materials) ? article.materials : [];
      const detail = materials[0]?.material || materials[0]?.name || materials[0]?.sku || "";
      const base = article?.name || article?.product_name || `Articolo ${index + 1}`;
      return { key: String(article?.id || article?.code || `article-${index + 1}`), name: detail && !base.toLowerCase().includes(detail.toLowerCase()) ? `${base} - ${detail}` : base };
    });
  }

  function phaseLabel(value) {
    const phase = String(value || "altro").toLowerCase();
    return phase.charAt(0).toUpperCase() + phase.slice(1);
  }

  if (typeof orderDetailEditTaskRows === "function") {
    orderDetailEditTaskRows = function productionTaskRows(rows) {
      const articles = currentArticles();
      const people = typeof orderFlowEmployeeOptions === "function" ? orderFlowEmployeeOptions() : [];
      if (!rows.length) return `<div class="empty-state">Nessun task ancora inserito. Usa + Task per organizzare il lavoro.</div>`;
      return rows.map((row, index) => `
        <div class="task-item order-detail-edit-task">
          <div><label class="muted">Articolo della task</label><select class="filter-chip" data-order-detail-task-index="${index}" data-order-detail-task-field="articleKey">
            <option value="">Seleziona articolo</option>${articles.map((article) => `<option value="${esc(article.key)}" ${String(row.articleKey || "") === article.key ? "selected" : ""}>${esc(article.name)}</option>`).join("")}
          </select></div>
          <div><label class="muted">Fase</label><select class="filter-chip" data-order-detail-task-index="${index}" data-order-detail-task-field="phase">${Object.keys(phaseOrder).map((phase) => `<option value="${phase}" ${String(row.phase || "").toLowerCase() === phase ? "selected" : ""}>${phaseLabel(phase)}</option>`).join("")}</select></div>
          <div><label class="muted">Assegna a</label><select class="filter-chip" data-order-detail-task-index="${index}" data-order-detail-task-field="assignedUserId"><option value="">Da assegnare</option>${people.map((person) => `<option value="${esc(person.value)}" ${String(row.assignedUserId || "") === String(person.value) ? "selected" : ""}>${esc(person.label)}</option>`).join("")}</select></div>
          <div><label class="muted">Data consegna task</label><input class="field-value" type="date" data-order-detail-task-index="${index}" data-order-detail-task-field="dueDate" value="${esc(row.dueDate || row.time || "")}" /></div>
          <div><label class="muted">Ore lavoro</label><input class="field-value" type="number" min="0" step="0.5" data-order-detail-task-index="${index}" data-order-detail-task-field="hours" value="${esc(row.hours)}" /></div>
          <div><label class="muted">Stato</label><select class="filter-chip" data-order-detail-task-index="${index}" data-order-detail-task-field="state">${["Da avviare", "In corso", "Completato", "Da confermare", "Stand by"].map((state) => `<option value="${state}" ${row.state === state ? "selected" : ""}>${state}</option>`).join("")}</select></div>
          <div><button class="mini-btn" data-order-detail-remove-task="${index}" type="button">Rimuovi</button></div>
        </div>`).join("");
    };
  }

  // One authoritative add action, after all legacy patches.
  if (typeof orderDetailEditHandleClick === "function") {
    const baseClick = orderDetailEditHandleClick;
    orderDetailEditHandleClick = function productionTaskClick(target) {
      if (!target.closest?.("[data-order-detail-add-task]")) return baseClick(target);
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const draft = typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
      if (!draft) return false;
      const article = currentArticles()[0] || { key: "", name: "" };
      const phase = "cartamodello";
      draft.tasks.push({ id: `local-task-${order?.id || 0}-${Date.now()}`, articleKey: article.key, articleName: article.name, name: `${phaseLabel(phase)} - ${article.name || "articolo"}`, phase, sequenceOrder: 1, assignedUserId: "", team: "Da assegnare", hours: "", time: "", dueDate: "", state: "Da avviare", localOnly: true });
      renderApp();
      return true;
    };
  }

  document.addEventListener("change", (event) => {
    const field = event.target?.dataset?.orderDetailTaskField;
    if (field !== "articleKey" && field !== "phase" && field !== "dueDate") return;
    const draft = typeof orderDetailEditCurrentDraft === "function" ? orderDetailEditCurrentDraft() : null;
    const row = draft?.tasks?.[Number(event.target.dataset.orderDetailTaskIndex)];
    if (!row) return;
    if (field === "articleKey") {
      row.articleName = currentArticles().find((article) => article.key === event.target.value)?.name || "";
    }
    if (field === "dueDate") row.time = event.target.value;
    row.sequenceOrder = phaseOrder[String(row.phase || "altro").toLowerCase()] || 99;
    row.name = `${phaseLabel(row.phase)} - ${row.articleName || "articolo"}`;
  }, false);

  async function authHeaders() {
    const session = await window.mmsSupabaseAuth?.auth?.getSession?.();
    const token = session?.data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  let plannerTimer;
  window.productionPlannerSchedule = function () {
    clearTimeout(plannerTimer);
    plannerTimer = setTimeout(async () => {
      try {
        const headers = await authHeaders();
        const previewResponse = await fetch("/api/task-planner", { headers });
        const preview = await previewResponse.json();
        if (!previewResponse.ok) throw new Error(preview.detail || preview.error);
        const lines = (preview.changes || []).slice(0, 12).map((item) => `${item.task_name}: ${item.from || "da pianificare"} → ${item.to}${item.end !== item.to ? ` (fine ${item.end})` : ""}`);
        const conflicts = (preview.conflicts || []).map((item) => `ATTENZIONE: ${item.task_name} - ${item.message}`);
        if (!lines.length && !conflicts.length) return;
        const accepted = window.confirm(`La pianificazione deve essere aggiornata:\n\n${[...lines, ...conflicts].join("\n")}\n\nConfermi lo spostamento?`);
        if (!accepted || conflicts.length) {
          if (typeof setFlashMessage === "function") setFlashMessage(conflicts.length ? "Pianificazione non applicata: una o più consegne non sono rispettabili" : "Pianificazione lasciata invariata");
          return;
        }
        const response = await fetch("/api/task-planner", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ apply: true }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || result.error);
        if (typeof refreshBootstrap === "function") await refreshBootstrap();
        if (typeof setFlashMessage === "function") setFlashMessage("Calendario ripianificato rispettando articoli, sequenze e consegne");
      } catch (error) {
        if (typeof setFlashMessage === "function") setFlashMessage(`Controllo pianificazione non riuscito: ${error.message}`);
      }
    }, 900);
  };

  if (typeof orderDetailEditSave === "function") {
    const baseSave = orderDetailEditSave;
    orderDetailEditSave = function saveAndPlan() {
      const result = baseSave();
      window.productionPlannerSchedule();
      return result;
    };
  }

  function addInnerAccountButton() {
    if (appState?.currentView !== "accounts") return;
    const title = [...document.querySelectorAll("h3")].find((node) => node.textContent.trim() === "Crea account");
    const panel = title?.closest(".surface-inner");
    if (!panel || panel.querySelector("[data-account-create-inside]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action-pill";
    button.dataset.accountCreateInside = "true";
    button.textContent = "Crea questo account";
    button.addEventListener("click", () => { if (!appState.busy && typeof saveAccountDraft === "function") saveAccountDraft(); });
    panel.appendChild(button);
  }
  const baseRender = renderApp;
  renderApp = function renderProductionPlanner() { baseRender(); addInnerAccountButton(); };
  if (document.getElementById("app")?.innerHTML) renderApp();
})();
