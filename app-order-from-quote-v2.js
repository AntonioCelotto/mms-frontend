function orderFromQuoteV2Money(value) {
  if (typeof quoteMoney === "function") return quoteMoney(value);
  return String(value || "");
}

function orderFromQuoteV2PaymentRows() {
  const draft = appState.orderFromQuoteDraft;
  if (!draft) return [];
  if (!Array.isArray(draft.payments) || !draft.payments.length) {
    const initial = [];
    if (draft.depositAmount) initial.push({ type: "Acconto", amount: draft.depositAmount, date: "", note: "" });
    initial.push({ type: "Saldo", amount: draft.balanceAmount || "", date: "", note: "" });
    draft.payments = initial;
  }
  return draft.payments;
}

function orderFromQuoteV2PaymentSummary(draft) {
  const rows = Array.isArray(draft.payments) ? draft.payments : [];
  if (!rows.length) return "Pagamento da definire";
  return rows
    .filter((row) => row.amount || row.type)
    .map((row) => `${row.type || "Pagamento"} ${row.amount || ""}${row.date ? ` (${row.date})` : ""}`.trim())
    .join(" - ") || "Pagamento da definire";
}

function orderFromQuoteV2EnsureTaskHours() {
  if (typeof orderFlowPlan !== "function") return [];
  return orderFlowPlan().map((task) => {
    if (task.workHours === undefined) task.workHours = task.estimatedHours || "";
    return task;
  });
}

function orderFromQuoteV2SyncDraft() {
  const draft = appState.orderFromQuoteDraft;
  if (!draft) return;
  orderFromQuoteV2PaymentRows();
  appState.draftOrder = {
    ...(appState.draftOrder || {}),
    client: draft.client,
    category: draft.category,
    priority: draft.priority,
    deposit: orderFromQuoteV2PaymentSummary(draft),
    department: draft.category,
    orderDate: draft.orderDate,
    estimatedDelivery: draft.estimatedDelivery,
    warehouseLink: "Materiali riportati dal preventivo",
    note: [draft.note, draft.customerDelivery ? `Consegna cliente: ${draft.customerDelivery}` : ""].filter(Boolean).join("\n"),
  };
  appState.draftMaterials = Array.isArray(draft.materials) && draft.materials.length ? draft.materials : [{ ...EMPTY_MATERIAL_DRAFT }];
}

orderFromQuoteSyncDraft = orderFromQuoteV2SyncDraft;

function renderOrderFromQuoteV2PaymentPanel(draft) {
  const rows = orderFromQuoteV2PaymentRows();
  return `
    <div class="surface">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Stato pagamento</h3>
            <p>Aggiungi uno o piu' pagamenti: acconti multipli o saldo finale.</p>
          </div>
          <button class="mini-btn" data-order-from-quote-add-payment type="button">+ Pagamento</button>
        </div>
        <table>
          <thead>
            <tr><th>Tipo</th><th>Importo</th><th>Data</th><th>Nota</th><th></th></tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row, index) => `
                  <tr>
                    <td>
                      <select class="filter-chip" data-order-from-quote-payment-index="${index}" data-order-from-quote-payment-field="type">
                        ${["Acconto", "Saldo"].map((type) => `<option value="${type}" ${row.type === type ? "selected" : ""}>${type}</option>`).join("")}
                      </select>
                    </td>
                    <td><input class="field-value" data-order-from-quote-payment-index="${index}" data-order-from-quote-payment-field="amount" value="${orderFromQuoteEscape(row.amount)}" placeholder="0,00" /></td>
                    <td><input class="field-value" type="date" data-order-from-quote-payment-index="${index}" data-order-from-quote-payment-field="date" value="${orderFromQuoteEscape(row.date)}" /></td>
                    <td><input class="field-value" data-order-from-quote-payment-index="${index}" data-order-from-quote-payment-field="note" value="${orderFromQuoteEscape(row.note)}" placeholder="es. bonifico, contanti" /></td>
                    <td><button class="mini-btn" data-order-from-quote-remove-payment="${index}" type="button">Rimuovi</button></td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderOrderFromQuoteV2Materials(draft) {
  const materials = Array.isArray(draft.materials) ? draft.materials : [];
  return `
    <div class="surface">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Preventivo riportato in ordine</h3>
            <p>Articoli e materiali arrivano dal preventivo, ma qui puoi correggere materiali, quantita' e note prima di salvare l'ordine.</p>
          </div>
          <button class="mini-btn" data-order-from-quote-add-material type="button">+ Materiale</button>
        </div>
        <table>
          <thead>
            <tr><th>Materiale</th><th>Quantita'</th><th>Origine</th><th>Stato</th><th>Nota</th><th></th></tr>
          </thead>
          <tbody>
            ${materials
              .map(
                (material, index) => `
                  <tr>
                    <td><input class="field-value" data-order-from-quote-material-index="${index}" data-order-from-quote-material-field="product_name" value="${orderFromQuoteEscape(material.product_name)}" /></td>
                    <td><input class="field-value" data-order-from-quote-material-index="${index}" data-order-from-quote-material-field="quantity_required" value="${orderFromQuoteEscape(material.quantity_required || "1")}" /></td>
                    <td>
                      <select class="filter-chip" data-order-from-quote-material-index="${index}" data-order-from-quote-material-field="source_type">
                        <option value="mms" ${material.source_type === "mms" ? "selected" : ""}>MMS</option>
                        <option value="cliente" ${material.source_type === "cliente" ? "selected" : ""}>Cliente</option>
                      </select>
                    </td>
                    <td>
                      <select class="filter-chip" data-order-from-quote-material-index="${index}" data-order-from-quote-material-field="delivery_status">
                        <option value="non_consegnato" ${material.delivery_status !== "consegnato" ? "selected" : ""}>Non consegnato</option>
                        <option value="consegnato" ${material.delivery_status === "consegnato" ? "selected" : ""}>Consegnato</option>
                      </select>
                    </td>
                    <td><input class="field-value" data-order-from-quote-material-index="${index}" data-order-from-quote-material-field="preorder_note" value="${orderFromQuoteEscape(material.preorder_note)}" /></td>
                    <td><button class="mini-btn" data-order-from-quote-remove-material="${index}" type="button">Rimuovi</button></td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderOrderFromQuoteTasks() {
  const plan = orderFromQuoteV2EnsureTaskHours();
  const employees = typeof orderFlowEmployeeOptions === "function" ? orderFlowEmployeeOptions() : [];
  return `
    <div class="surface">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Task per organizzare il lavoro</h3>
            <p>Inserisci manualmente le ore necessarie per realizzare il task: servono per calendario, carico lavoro e pianificazione.</p>
          </div>
        </div>
        <div class="task-list">
          ${plan
            .map(
              (item, index) => `
                <div class="task-item" style="grid-template-columns: 1fr 1fr 1fr 1fr; align-items:end;">
                  <div>
                    <label class="muted" style="display:block; margin-bottom:6px;">
                      <input type="checkbox" data-order-flow-plan-index="${index}" data-order-flow-plan-field="enabled" ${item.enabled ? "checked" : ""} />
                      ${orderFromQuoteEscape(item.label)}
                    </label>
                    <strong>${orderFromQuoteEscape(item.label)} ordine</strong>
                  </div>
                  <div>
                    <label class="muted" style="display:block; margin-bottom:6px;">Assegna a</label>
                    <select class="filter-chip" data-order-flow-plan-index="${index}" data-order-flow-plan-field="assignedUserId">
                      <option value="">Da assegnare dopo</option>
                      ${employees.map((employee) => `<option value="${orderFromQuoteEscape(employee.value)}" ${item.assignedUserId === employee.value ? "selected" : ""}>${orderFromQuoteEscape(employee.label)}</option>`).join("")}
                    </select>
                  </div>
                  <div>
                    <label class="muted" style="display:block; margin-bottom:6px;">Data consegna task</label>
                    <input class="field-value" type="date" data-order-flow-plan-index="${index}" data-order-flow-plan-field="plannedDate" value="${orderFromQuoteEscape(item.plannedDate)}" />
                  </div>
                  <div>
                    <label class="muted" style="display:block; margin-bottom:6px;">Ore di lavoro</label>
                    <input class="field-value" type="number" min="0" step="0.5" data-order-flow-plan-index="${index}" data-order-flow-plan-field="workHours" value="${orderFromQuoteEscape(item.workHours)}" placeholder="es. 3" />
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function renderOrderFromQuote() {
  orderFromQuoteEnsureDraft();
  const draft = appState.orderFromQuoteDraft;
  const active = appState.currentView === ORDER_FROM_QUOTE_VIEW ? "active" : "";
  if (!draft) return `<section class="view ${active}"><div class="empty-state">Conferma un preventivo per preparare l'ordine operativo.</div></section>`;
  const quote = draft.quote || {};
  const photos = Array.isArray(quote.photos) ? quote.photos : [];
  return `
    <section class="view ${active}">
      <div class="screen-header">
        <div>
          <h2>Ordine da preventivo ${orderFromQuoteEscape(quote.id || "")}</h2>
          <p>Dati commerciali riportati dal preventivo, pagamento, materiali modificabili e task da pianificare.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">Totale: ${orderFromQuoteV2Money(quote.total)}</div>
          <button class="action-pill" data-action="save-order" type="button">${appState.busy ? "Salvataggio..." : "Salva ordine"}</button>
        </div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title"><div><h3>Dati ordine</h3><p>Le date diventano operative: data stimata interna e consegna promessa al cliente.</p></div></div>
            <div class="form-grid">
              <div class="field span-2"><label>Cliente / brand</label><input class="field-value" data-order-from-quote-field="client" value="${orderFromQuoteEscape(draft.client)}" /></div>
              <div class="field"><label>Categoria</label><input class="field-value" data-order-from-quote-field="category" value="${orderFromQuoteEscape(draft.category)}" /></div>
              <div class="field"><label>Priorita'</label><input class="field-value" data-order-from-quote-field="priority" value="${orderFromQuoteEscape(draft.priority)}" /></div>
              <div class="field"><label>Data stimata</label><input class="field-value" type="date" data-order-from-quote-field="estimatedDelivery" value="${orderFromQuoteEscape(draft.estimatedDelivery)}" /></div>
              <div class="field"><label>Consegna cliente</label><input class="field-value" type="date" data-order-from-quote-field="customerDelivery" value="${orderFromQuoteEscape(draft.customerDelivery)}" /></div>
              <div class="field span-2"><label>Note ordine</label><textarea class="field-value" data-order-from-quote-field="note" style="min-height:86px; align-items:flex-start; padding-top:12px;">${orderFromQuoteEscape(draft.note)}</textarea></div>
            </div>
          </div>
        </div>
        ${renderOrderFromQuoteV2PaymentPanel(draft)}
      </div>

      ${renderOrderFromQuoteV2Materials(draft)}

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title"><div><h3>Foto riportate dal preventivo</h3><p>Le foto restano visibili nell'ordine e vengono preparate come allegati ordine.</p></div></div>
          ${renderOrderFromQuotePhotos(photos)}
        </div>
      </div>

      ${renderOrderFromQuoteTasks()}
    </section>
  `;
}

const baseQuoteListConvertToOrderV2 = quoteListConvertToOrder;
quoteListConvertToOrder = async function quoteListConvertToOperationalOrderV2(quoteId) {
  await baseQuoteListConvertToOrderV2(quoteId);
  const draft = appState.orderFromQuoteDraft;
  if (!draft) return;
  draft.payments = [{ type: "Saldo", amount: orderFromQuoteV2Money(draft.quote?.total), date: "", note: "" }];
  orderFromQuoteV2EnsureTaskHours();
  orderFromQuoteV2SyncDraft();
  renderApp();
};

const baseOrderFlowAttachPlanEventsV2 = typeof orderFlowAttachPlanEvents === "function" ? orderFlowAttachPlanEvents : null;
if (baseOrderFlowAttachPlanEventsV2) {
  orderFlowAttachPlanEvents = function orderFlowAttachPlanEventsWithHours() {
    baseOrderFlowAttachPlanEventsV2();
    document.querySelectorAll("[data-order-flow-plan-field='workHours']").forEach((input) => {
      const handler = (event) => {
        const index = Number(event.target.dataset.orderFlowPlanIndex);
        const plan = orderFromQuoteV2EnsureTaskHours();
        if (plan[index]) plan[index].workHours = event.target.value;
      };
      input.oninput = handler;
      input.onchange = handler;
    });
  };
}

const baseOrderFlowApplyTaskPlanV2 = typeof orderFlowApplyTaskPlan === "function" ? orderFlowApplyTaskPlan : null;
if (baseOrderFlowApplyTaskPlanV2) {
  orderFlowApplyTaskPlan = async function orderFlowApplyTaskPlanWithHours(order) {
    const plan = orderFromQuoteV2EnsureTaskHours();
    plan.forEach((item) => {
      item.plannedTime = "";
      item.estimatedHours = item.workHours || item.estimatedHours || "";
    });
    const assigned = await baseOrderFlowApplyTaskPlanV2(order);
    const tasks = await orderFlowLoadTasks(order).catch(() => []);
    for (const item of plan.filter((row) => row.enabled && row.workHours)) {
      const task = tasks.find((row) => String(row.phase || "").toLowerCase() === item.phase);
      if (!task?.id) continue;
      await fetch("/api/assign-task", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id, estimated_hours: Number(String(item.workHours).replace(",", ".")) || null, notes: `Ore lavoro stimate: ${item.workHours}` }),
      }).catch(() => {});
    }
    await orderFlowLoadTasks(order).catch(() => []);
    return assigned;
  };
}

function attachOrderFromQuoteV2Events() {
  document.querySelectorAll("[data-order-from-quote-payment-field]").forEach((input) => {
    const handler = (event) => {
      const rows = orderFromQuoteV2PaymentRows();
      const row = rows[Number(event.target.dataset.orderFromQuotePaymentIndex)];
      if (!row) return;
      row[event.target.dataset.orderFromQuotePaymentField] = event.target.value;
      orderFromQuoteV2SyncDraft();
    };
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });

  document.querySelectorAll("[data-order-from-quote-add-payment]").forEach((button) => {
    button.addEventListener("click", () => {
      orderFromQuoteV2PaymentRows().push({ type: "Acconto", amount: "", date: "", note: "" });
      orderFromQuoteV2SyncDraft();
      renderApp();
    });
  });

  document.querySelectorAll("[data-order-from-quote-remove-payment]").forEach((button) => {
    button.addEventListener("click", () => {
      const rows = orderFromQuoteV2PaymentRows();
      if (rows.length === 1) rows[0] = { type: "Acconto", amount: "", date: "", note: "" };
      else rows.splice(Number(button.dataset.orderFromQuoteRemovePayment), 1);
      orderFromQuoteV2SyncDraft();
      renderApp();
    });
  });

  document.querySelectorAll("[data-order-from-quote-material-field]").forEach((input) => {
    const handler = (event) => {
      const draft = appState.orderFromQuoteDraft;
      const material = draft?.materials?.[Number(event.target.dataset.orderFromQuoteMaterialIndex)];
      if (!material) return;
      material[event.target.dataset.orderFromQuoteMaterialField] = event.target.value;
      orderFromQuoteV2SyncDraft();
    };
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });

  document.querySelectorAll("[data-order-from-quote-add-material]").forEach((button) => {
    button.addEventListener("click", () => {
      const draft = appState.orderFromQuoteDraft;
      if (!draft) return;
      if (!Array.isArray(draft.materials)) draft.materials = [];
      draft.materials.push({ ...EMPTY_MATERIAL_DRAFT, quantity_required: "1" });
      orderFromQuoteV2SyncDraft();
      renderApp();
    });
  });

  document.querySelectorAll("[data-order-from-quote-remove-material]").forEach((button) => {
    button.addEventListener("click", () => {
      const draft = appState.orderFromQuoteDraft;
      if (!draft?.materials) return;
      if (draft.materials.length === 1) draft.materials = [{ ...EMPTY_MATERIAL_DRAFT, quantity_required: "1" }];
      else draft.materials.splice(Number(button.dataset.orderFromQuoteRemoveMaterial), 1);
      orderFromQuoteV2SyncDraft();
      renderApp();
    });
  });
}

const baseRenderAppOrderFromQuoteV2 = renderApp;
renderApp = function renderAppOrderFromQuoteV2() {
  baseRenderAppOrderFromQuoteV2();
  attachOrderFromQuoteV2Events();
};

orderFromQuoteV2EnsureTaskHours();
if (document.getElementById("app")?.innerHTML) renderApp();