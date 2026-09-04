(() => {
  const STATUS_OPTIONS = [
    ["da_avviare", "Da avviare"],
    ["in_produzione", "In produzione"],
    ["completato", "Completato"],
    ["sospeso", "Sospeso"],
    ["annullato", "Annullato"],
  ];
  const LABEL_BY_KEY = Object.fromEntries(STATUS_OPTIONS);
  const state = { saving: new Set() };

  function statusKey(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const aliases = {
      da_avviare: "da_avviare",
      in_produzione: "in_produzione",
      in_lavorazione: "in_produzione",
      in_corso: "in_produzione",
      completato: "completato",
      completata: "completato",
      evaso: "completato",
      sospeso: "sospeso",
      stand_by: "sospeso",
      annullato: "annullato",
      annullata: "annullato",
    };
    return aliases[normalized] || "da_avviare";
  }

  function statusLabel(value) {
    return LABEL_BY_KEY[statusKey(value)] || LABEL_BY_KEY.da_avviare;
  }

  function formatStatusDate(value) {
    if (!value) return "Non registrata";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed);
  }

  function statusFieldsMarkup(order, draft) {
    const current = statusKey(draft?.status || order?.statusKey || order?.status);
    const options = STATUS_OPTIONS.map(
      ([key, label]) => `<option value="${label}" ${key === current ? "selected" : ""}>${label}</option>`
    ).join("");
    return `
      <div class="field">
        <label>Stato ordine</label>
        <select class="filter-chip" data-order-detail-field="status" data-order-status-control>
          ${options}
        </select>
      </div>
      <div class="field">
        <label>Data avvio produzione</label>
        <div class="field-value order-status-date" data-order-status-started>${formatStatusDate(order?.productionStartedAt)}</div>
      </div>
      <div class="field">
        <label>Data completamento</label>
        <div class="field-value order-status-date" data-order-status-completed>${formatStatusDate(order?.completedAt)}</div>
      </div>
    `;
  }

  if (typeof orderDetailEditMarkup === "function") {
    const baseMarkup = orderDetailEditMarkup;
    orderDetailEditMarkup = function orderDetailEditMarkupWithStatusWorkflow() {
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const draft = order && typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
      const markup = baseMarkup();
      if (!order || !draft) return markup;
      return markup.replace(
        /<div class="field"><label>Stato ordine<\/label><input class="field-value" data-order-detail-field="status" value="[^"]*" \/><\/div>/,
        statusFieldsMarkup(order, draft)
      );
    };
  }

  async function persistStatus(order, key) {
    const dbId = Number(order?.db_id || order?.internal_id || 0);
    if (!dbId) throw new Error("ID database dell'ordine non disponibile");
    if (typeof orderFlowRequest !== "function") throw new Error("Collegamento al database non disponibile");
    const rows = await orderFlowRequest(
      `/rest/v1/orders?id=eq.${dbId}&select=id,status,production_started_at,completed_at,actual_delivery_date`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ status: key }),
      }
    );
    const updated = Array.isArray(rows) ? rows[0] : null;
    if (!updated) throw new Error("L'ordine non e' stato aggiornato");
    return updated;
  }

  function applyStatusResult(order, draft, row) {
    const label = statusLabel(row.status);
    order.statusKey = row.status;
    order.status = label;
    order.productionStartedAt = row.production_started_at || "";
    order.completedAt = row.completed_at || "";
    order.actualDeliveryDate = row.actual_delivery_date || "";
    draft.status = label;
    if (typeof orderDetailEditWriteStored === "function") {
      orderDetailEditWriteStored(Number(order.id), draft);
    }
  }

  if (typeof orderDetailEditSave === "function") {
    const baseSave = orderDetailEditSave;
    orderDetailEditSave = function orderDetailEditSaveWithStatusWorkflow() {
      const order = typeof getSelectedOrder === "function" ? getSelectedOrder() : null;
      const draft = order && typeof orderDetailEditDraftFor === "function" ? orderDetailEditDraftFor(order) : null;
      const previousKey = statusKey(order?.statusKey || order?.status);
      const previousLabel = statusLabel(previousKey);
      const nextKey = statusKey(draft?.status);
      const result = baseSave();

      const dbId = Number(order?.db_id || order?.internal_id || 0);
      if (!order || !draft || previousKey === nextKey || state.saving.has(dbId)) return result;

      state.saving.add(dbId);
      persistStatus(order, nextKey)
        .then((row) => {
          applyStatusResult(order, draft, row);
          setFlashMessage(
            `Ordine #${order.id}: stato aggiornato a ${statusLabel(row.status)}`
          );
          renderApp();
        })
        .catch((error) => {
          order.statusKey = previousKey;
          order.status = previousLabel;
          draft.status = previousLabel;
          if (typeof orderDetailEditWriteStored === "function") {
            orderDetailEditWriteStored(Number(order.id), draft);
          }
          setFlashMessage(`Stato ordine non salvato: ${error.message}`);
          renderApp();
        })
        .finally(() => state.saving.delete(dbId));

      return result;
    };
  }

  const style = document.createElement("style");
  style.id = "order-status-workflow-styles";
  style.textContent = `
    [data-order-status-control] {
      width: 100%;
      min-height: 44px;
      font-weight: 700;
      cursor: pointer;
    }
    .order-status-date {
      min-height: 44px;
      display: flex;
      align-items: center;
      color: var(--text, #1d2433);
      background: #f7f8fa;
    }
  `;
  if (!document.getElementById(style.id)) document.head.appendChild(style);

  if (document.getElementById("app")?.innerHTML) renderApp();
})();