const ORDER_FROM_QUOTE_VIEW = "order-create";

function orderFromQuoteEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function orderFromQuoteEnsureDraft() {
  if (!appState.orderFromQuoteDraft || typeof appState.orderFromQuoteDraft !== "object") {
    appState.orderFromQuoteDraft = null;
  }
}

function orderFromQuoteMaterialRows(quote) {
  const rows = [];
  (quote.articles || []).forEach((article, articleIndex) => {
    rows.push(`
      <tr>
        <td><strong>${articleIndex + 1}. ${orderFromQuoteEscape(article.name || "Articolo")}</strong></td>
        <td>${orderFromQuoteEscape(article.quantity || "1")}</td>
        <td>${typeof quoteMoney === "function" ? quoteMoney(article.cost) : orderFromQuoteEscape(article.cost)}</td>
        <td>${typeof quoteMoney === "function" ? quoteMoney(typeof quoteArticleTotal === "function" ? quoteArticleTotal(article) : article.cost) : ""}</td>
      </tr>
    `);
    (article.materials || []).forEach((material) => {
      rows.push(`
        <tr>
          <td style="padding-left:18px;">${orderFromQuoteEscape(material.material || "Materiale")}</td>
          <td>${orderFromQuoteEscape(material.quantity || "")}</td>
          <td>${typeof quoteMoney === "function" ? quoteMoney(material.price) : orderFromQuoteEscape(material.price)}</td>
          <td>${typeof quoteMoney === "function" && typeof quoteMaterialTotal === "function" ? quoteMoney(quoteMaterialTotal(material)) : ""}</td>
        </tr>
      `);
    });
  });
  return rows.join("");
}

function orderFromQuoteDraftMaterials(quote) {
  const materials = [];
  (quote.articles || []).forEach((article) => {
    (article.materials || []).forEach((material) => {
      const productName = String(material.material || "").trim();
      if (!productName) return;
      materials.push({
        product_name: productName,
        source_type: "mms",
        delivery_status: "non_consegnato",
        warehouse_status_note: `Da preventivo ${quote.id}`,
        preorder_note: `Articolo: ${article.name || "n/d"} - prezzo ${material.price || "n/d"}`,
        quantity_required: material.quantity || "1",
      });
    });
  });
  return materials.length ? materials : [{ ...EMPTY_MATERIAL_DRAFT }];
}

async function orderFromQuotePhotoAttachment(photo) {
  let file = null;
  try {
    if (photo.dataUrl) {
      const blob = await fetch(photo.dataUrl).then((response) => response.blob());
      file = new File([blob], photo.name || "foto-preventivo.jpg", { type: photo.type || blob.type || "image/jpeg" });
    }
  } catch (error) {
    file = null;
  }
  return {
    name: photo.name || "Foto preventivo",
    size: photo.size || file?.size || 0,
    sizeLabel: typeof formatAttachmentSize === "function" ? formatAttachmentSize(photo.size || file?.size || 0) : "",
    type: photo.type || file?.type || "image/jpeg",
    localUrl: photo.dataUrl || "",
    file,
    persisted: false,
  };
}

function orderFromQuoteSyncDraft() {
  const draft = appState.orderFromQuoteDraft;
  if (!draft) return;
  const paymentParts = [
    draft.paymentStatus || "Pagamento da definire",
    draft.depositAmount ? `Acconto ${draft.depositAmount}` : "",
    draft.balanceAmount ? `Saldo ${draft.balanceAmount}` : "",
  ].filter(Boolean);

  appState.draftOrder = {
    ...(appState.draftOrder || {}),
    client: draft.client,
    category: draft.category,
    priority: draft.priority,
    deposit: paymentParts.join(" - "),
    department: draft.category,
    orderDate: draft.orderDate,
    estimatedDelivery: draft.estimatedDelivery,
    warehouseLink: "Materiali riportati dal preventivo",
    note: [draft.note, draft.customerDelivery ? `Consegna cliente: ${draft.customerDelivery}` : ""].filter(Boolean).join("\n"),
  };
  appState.draftMaterials = Array.isArray(draft.materials) && draft.materials.length ? draft.materials : [{ ...EMPTY_MATERIAL_DRAFT }];
}

function renderOrderFromQuotePhotos(photos) {
  if (!photos.length) return `<div class="empty-state">Nessuna foto riportata dal preventivo.</div>`;
  return `
    <div class="attachment-grid">
      ${photos
        .map(
          (photo, index) => `
            <div class="attachment-card">
              <button class="attachment-preview" data-order-from-quote-photo="${index}" type="button">
                <img src="${photo.dataUrl}" alt="${orderFromQuoteEscape(photo.name)}" />
              </button>
              <div class="attachment-info">
                <strong>${orderFromQuoteEscape(photo.name)}</strong>
                <span>${typeof quotePhotoSize === "function" ? quotePhotoSize(photo.size) : ""}</span>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderOrderFromQuoteTasks() {
  const plan = typeof orderFlowPlan === "function" ? orderFlowPlan() : [];
  const employees = typeof orderFlowEmployeeOptions === "function" ? orderFlowEmployeeOptions() : [];
  return `
    <div class="surface">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Task per organizzare il lavoro</h3>
            <p>Da qui attivi e assegni le lavorazioni dopo l'accettazione del preventivo.</p>
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
                      ${employees
                        .map((employee) => `<option value="${orderFromQuoteEscape(employee.value)}" ${item.assignedUserId === employee.value ? "selected" : ""}>${orderFromQuoteEscape(employee.label)}</option>`)
                        .join("")}
                    </select>
                  </div>
                  <div>
                    <label class="muted" style="display:block; margin-bottom:6px;">Data</label>
                    <input class="field-value" type="date" data-order-flow-plan-index="${index}" data-order-flow-plan-field="plannedDate" value="${orderFromQuoteEscape(item.plannedDate)}" />
                  </div>
                  <div>
                    <label class="muted" style="display:block; margin-bottom:6px;">Ora</label>
                    <input class="field-value" type="time" data-order-flow-plan-index="${index}" data-order-flow-plan-field="plannedTime" value="${orderFromQuoteEscape(item.plannedTime)}" />
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
  if (!draft) {
    return `
      <section class="view ${active}">
        <div class="empty-state">Conferma un preventivo per preparare l'ordine operativo.</div>
      </section>
    `;
  }
  const quote = draft.quote || {};
  const photos = Array.isArray(quote.photos) ? quote.photos : [];
  return `
    <section class="view ${active}">
      <div class="screen-header">
        <div>
          <h2>Ordine da preventivo ${orderFromQuoteEscape(quote.id || "")}</h2>
          <p>Dati commerciali riportati dal preventivo, pagamento e task da attivare per la produzione.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">Totale: ${typeof quoteMoney === "function" ? quoteMoney(quote.total) : orderFromQuoteEscape(quote.total)}</div>
          <button class="action-pill" data-action="save-order" type="button">${appState.busy ? "Salvataggio..." : "Salva ordine"}</button>
        </div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Dati ordine</h3>
                <p>Le date diventano operative: data stimata interna e consegna promessa al cliente.</p>
              </div>
            </div>
            <div class="form-grid">
              <div class="field span-2">
                <label>Cliente / brand</label>
                <input class="field-value" data-order-from-quote-field="client" value="${orderFromQuoteEscape(draft.client)}" />
              </div>
              <div class="field">
                <label>Categoria</label>
                <input class="field-value" data-order-from-quote-field="category" value="${orderFromQuoteEscape(draft.category)}" />
              </div>
              <div class="field">
                <label>Priorita'</label>
                <input class="field-value" data-order-from-quote-field="priority" value="${orderFromQuoteEscape(draft.priority)}" />
              </div>
              <div class="field">
                <label>Data stimata</label>
                <input class="field-value" type="date" data-order-from-quote-field="estimatedDelivery" value="${orderFromQuoteEscape(draft.estimatedDelivery)}" />
              </div>
              <div class="field">
                <label>Consegna cliente</label>
                <input class="field-value" type="date" data-order-from-quote-field="customerDelivery" value="${orderFromQuoteEscape(draft.customerDelivery)}" />
              </div>
              <div class="field span-2">
                <label>Note ordine</label>
                <textarea class="field-value" data-order-from-quote-field="note" style="min-height:86px; align-items:flex-start; padding-top:12px;">${orderFromQuoteEscape(draft.note)}</textarea>
              </div>
            </div>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Stato pagamento</h3>
                <p>Passando a ordine puoi inserire acconto, saldo e stato pagamento.</p>
              </div>
            </div>
            <div class="form-grid">
              <div class="field span-2">
                <label>Stato pagamento</label>
                <select class="filter-chip" data-order-from-quote-field="paymentStatus">
                  ${["Da incassare", "Acconto ricevuto", "Saldo da incassare", "Saldato"]
                    .map((status) => `<option value="${status}" ${draft.paymentStatus === status ? "selected" : ""}>${status}</option>`)
                    .join("")}
                </select>
              </div>
              <div class="field">
                <label>Acconto</label>
                <input class="field-value" data-order-from-quote-field="depositAmount" value="${orderFromQuoteEscape(draft.depositAmount)}" placeholder="0,00" />
              </div>
              <div class="field">
                <label>Saldo</label>
                <input class="field-value" data-order-from-quote-field="balanceAmount" value="${orderFromQuoteEscape(draft.balanceAmount)}" placeholder="0,00" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Preventivo riportato in ordine</h3>
              <p>Articoli, quantita', costi e materiali passano qui prima del salvataggio ordine.</p>
            </div>
          </div>
          <table>
            <thead><tr><th>Voce</th><th>Quantita'</th><th>Prezzo</th><th>Totale</th></tr></thead>
            <tbody>${orderFromQuoteMaterialRows(quote)}</tbody>
          </table>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Foto riportate dal preventivo</h3>
              <p>Le foto restano visibili nell'ordine e vengono preparate come allegati ordine.</p>
            </div>
          </div>
          ${renderOrderFromQuotePhotos(photos)}
        </div>
      </div>

      ${renderOrderFromQuoteTasks()}
    </section>
  `;
}

const baseQuoteListConvertToOrderFromQuote = quoteListConvertToOrder;
quoteListConvertToOrder = async function quoteListConvertToOperationalOrder(quoteId) {
  const quote = quoteListFind(quoteId);
  if (!quote) return baseQuoteListConvertToOrderFromQuote(quoteId);
  quote.status = "Trasformato in ordine";
  const photos = Array.isArray(quote.photos) ? quote.photos : [];
  const attachments = await Promise.all(photos.map(orderFromQuotePhotoAttachment));
  appState.draftOrderAttachments = attachments;
  appState.orderFromQuoteDraft = {
    quote,
    client: quote.client || "",
    category: quote.category || "",
    priority: quote.priority || "Standard",
    orderDate: new Date().toISOString().slice(0, 10),
    estimatedDelivery: "",
    customerDelivery: "",
    paymentStatus: "Da incassare",
    depositAmount: "",
    balanceAmount: typeof quoteMoney === "function" ? quoteMoney(quote.total) : String(quote.total || ""),
    note: quote.note || "",
    materials: orderFromQuoteDraftMaterials(quote),
  };
  orderFromQuoteSyncDraft();
  appState.selectedQuoteId = quote.id;
  appState.currentView = ORDER_FROM_QUOTE_VIEW;
  setFlashMessage(`Preventivo ${quote.id} accettato. Completa date, pagamento e task per creare l'ordine.`);
  renderApp();
};

const baseRenderLayoutOrderFromQuote = renderLayout;
renderLayout = function renderLayoutWithOrderFromQuote() {
  let html = baseRenderLayoutOrderFromQuote();
  if (!html.includes('data-order-from-quote-view="true"')) {
    html = html.replace(
      "\n        </div>\n      </main>",
      `\n          <div data-order-from-quote-view="true">${renderOrderFromQuote()}</div>\n        </div>\n      </main>`
    );
  }
  return html;
};

function attachOrderFromQuoteEvents() {
  document.querySelectorAll("[data-order-from-quote-field]").forEach((input) => {
    const handler = (event) => {
      if (!appState.orderFromQuoteDraft) return;
      appState.orderFromQuoteDraft[event.target.dataset.orderFromQuoteField] = event.target.value;
      orderFromQuoteSyncDraft();
    };
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });

  document.querySelectorAll("[data-order-from-quote-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      const photo = appState.orderFromQuoteDraft?.quote?.photos?.[Number(button.dataset.orderFromQuotePhoto)];
      if (!photo?.dataUrl) return;
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`<img src="${photo.dataUrl}" alt="${orderFromQuoteEscape(photo.name)}" style="max-width:100%;height:auto;" />`);
      win.document.close();
    });
  });

  if (typeof orderFlowAttachPlanEvents === "function") orderFlowAttachPlanEvents();
}

const baseRenderAppOrderFromQuote = renderApp;
renderApp = function renderAppOrderFromQuote() {
  baseRenderAppOrderFromQuote();
  document.querySelectorAll("label").forEach((label) => {
    const text = label.textContent.trim();
    if (text === "Data consegna stimata") label.textContent = "Data stimata";
    if (text === "Finestra cliente") label.textContent = "Consegna cliente";
  });
  attachOrderFromQuoteEvents();
};

orderFromQuoteEnsureDraft();
if (document.getElementById("app")?.innerHTML) renderApp();