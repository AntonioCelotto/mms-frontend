(function () {
  const PHOTO_STORE_KEY = "mms.quoteOrderPhotos.v1";
  const SUMMARY_STORE_KEY = "mms_order_quote_summaries_v1";

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

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function currentRole() {
    const profile = window.mmsAuthProfile || {};
    const raw = text(profile.access_profile || profile.profile || profile.role).toLowerCase();
    if (raw === "admin" || raw === "amministratore") return "admin";
    if (raw === "commerce" || raw === "commercio") return "commerce";
    const skills = Array.isArray(profile.skills) ? profile.skills.join(" ").toLowerCase() : "";
    return ["clienti", "preventivi", "ordini", "pagamenti", "magazzino"].some((skill) => skills.includes(skill)) ? "commerce" : "operator";
  }

  function isOperatorOnly() {
    return currentRole() === "operator";
  }

  function selectedOperatorOrderId() {
    return Number(appState.operatorOrderId || appState.selectedOrderId || 0);
  }

  function findOrder(orderId) {
    return (appData.orders || []).find((order) => Number(order.id) === Number(orderId) || Number(order.db_id) === Number(orderId)) || null;
  }

  function materialName(row) {
    return text(row.material || row.product_name || row.name || row.title) || "Materiale";
  }

  function materialQty(row) {
    return text(row.quantity_required || row.quantity || row.qty) || "1";
  }

  function materialSource(row) {
    const source = text(row.source || row.source_type).toLowerCase();
    if (source === "mms") return "MMS";
    if (source === "cliente") return "Cliente";
    if (source === "fornitore") return "Fornitore";
    return text(row.source || row.source_type) || "Da verificare";
  }

  function materialDelivery(row) {
    return text(row.delivery || row.delivery_status || row.status) || "Da verificare";
  }

  function materialWarehouse(row) {
    return text(row.warehouse || row.warehouse_status_note || row.sku || row.code) || "Inserimento manuale";
  }

  function materialNote(row) {
    return text(row.preorder || row.preorder_note || row.note || row.notes || row.description);
  }

  function summaryMaterials(orderId) {
    const summary = appState.orderQuoteSummaries?.[orderId] || readJson(SUMMARY_STORE_KEY, {})[String(orderId)] || null;
    const articleMaterials = (summary?.articles || []).flatMap((article) =>
      (article.materials || []).map((material) => ({
        product_name: material.name,
        quantity_required: material.quantity,
        source_type: material.source_type || "mms",
        delivery_status: material.delivery_status || "",
        warehouse_status_note: material.warehouse_status_note || "",
        preorder_note: material.preorder_note || `Articolo: ${article.name || ""}`,
      }))
    );
    if (articleMaterials.length) return articleMaterials;
    return (summary?.materials || []).map((material) => ({
      product_name: material.name,
      quantity_required: material.quantity,
      source_type: material.source_type || "mms",
      delivery_status: material.delivery_status || "",
      warehouse_status_note: material.warehouse_status_note || "",
      preorder_note: material.preorder_note || "",
    }));
  }

  function materialsForOrder(order) {
    const orderId = Number(order?.id || selectedOperatorOrderId());
    const dbId = Number(order?.db_id || 0);
    const byDisplayId = appData.orderMaterials?.[orderId] || appData.orderMaterials?.[String(orderId)] || [];
    const byDbId = dbId ? appData.orderMaterials?.[dbId] || appData.orderMaterials?.[String(dbId)] || [] : [];
    const rows = Array.isArray(byDisplayId) && byDisplayId.length ? byDisplayId : byDbId;
    return Array.isArray(rows) && rows.length ? rows : summaryMaterials(orderId);
  }

  function photoUrl(photo) {
    return photo?.dataUrl || photo?.url || photo?.localUrl || "";
  }

  function normalizePhoto(photo, index) {
    const url = photoUrl(photo);
    if (!url) return null;
    return {
      url,
      name: text(photo.name) || `Foto ${index + 1}`,
    };
  }

  function photosForOrder(order) {
    const orderId = Number(order?.id || selectedOperatorOrderId());
    const statePhotos = appState.orderAttachments?.[orderId] || appState.orderAttachments?.[String(orderId)] || [];
    const storedPhotos = readJson(PHOTO_STORE_KEY, {})[String(orderId)]?.photos || [];
    const merged = [...(Array.isArray(statePhotos) ? statePhotos : []), ...(Array.isArray(storedPhotos) ? storedPhotos : [])]
      .map(normalizePhoto)
      .filter(Boolean);
    const seen = new Set();
    return merged.filter((photo) => {
      if (seen.has(photo.url)) return false;
      seen.add(photo.url);
      return true;
    });
  }

  function tasksForOrder(order) {
    const orderId = Number(order?.id || selectedOperatorOrderId());
    const dbId = Number(order?.db_id || 0);
    return appData.orderTasks?.[orderId] || appData.orderTasks?.[String(orderId)] || (dbId ? appData.orderTasks?.[dbId] || [] : []);
  }

  function renderMaterials(order) {
    const rows = materialsForOrder(order);
    return `
      <div class="operator-order-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Materiale</th>
              <th>Q.ta</th>
              <th>Origine</th>
              <th>Magazzino</th>
              <th>Consegna</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map(
                      (row) => `
                <tr>
                  <td><strong>${escapeHtml(materialName(row))}</strong></td>
                  <td>${escapeHtml(materialQty(row))}</td>
                  <td>${escapeHtml(materialSource(row))}</td>
                  <td>${escapeHtml(materialWarehouse(row))}</td>
                  <td><span class="table-status ${typeof getStatusClass === "function" ? getStatusClass(materialDelivery(row)) : ""}">${escapeHtml(
                        materialDelivery(row)
                      )}</span></td>
                  <td>${escapeHtml(materialNote(row) || "-")}</td>
                </tr>
              `
                    )
                    .join("")
                : `<tr><td colspan="6"><div class="empty-state">Nessun materiale collegato a questo ordine.</div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPhotos(order) {
    const photos = photosForOrder(order);
    if (!photos.length) return `<div class="empty-state">Nessuna foto collegata a questo ordine.</div>`;
    return `
      <div class="operator-photo-grid">
        ${photos
          .map(
            (photo) => `
          <a class="operator-photo" href="${escapeHtml(photo.url)}" target="_blank" rel="noopener">
            <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name)}" />
            <span>${escapeHtml(photo.name)}</span>
          </a>
        `
          )
          .join("")}
      </div>
    `;
  }

  function renderTasks(order) {
    const tasks = tasksForOrder(order);
    if (!Array.isArray(tasks) || !tasks.length) return `<div class="empty-state">Nessun task operativo collegato.</div>`;
    return `
      <div class="calendar-task-list operator-task-list">
        ${tasks
          .map(
            (task) => `
          <div class="calendar-task-row">
            <div>
              <strong>${escapeHtml(task.name || task.task_name || "Task ordine")}</strong>
              <span>${escapeHtml(task.phase || task.task_phase || "Lavorazione")}</span>
            </div>
            <div>${escapeHtml(task.team || task.owner || "Non assegnato")}</div>
            <div>${escapeHtml(task.time || task.planned_date || "Da pianificare")}</div>
            <div><span class="table-status ${typeof getStatusClass === "function" ? getStatusClass(task.state || task.status || "Da avviare") : ""}">${escapeHtml(
              task.state || task.status || "Da avviare"
            )}</span></div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  function renderOperatorOrder() {
    const orderId = selectedOperatorOrderId();
    const order = findOrder(orderId);
    if (!order) {
      return `
        <section class="view ${appState.currentView === "operator-order" ? "active" : ""}">
          <div class="screen-header">
            <div>
              <h2>Scheda lavorazione</h2>
              <p>Ordine non trovato o non ancora caricato.</p>
            </div>
            <div class="screen-actions"><button class="action-pill" data-operator-back-calendar type="button">Torna al calendario</button></div>
          </div>
        </section>
      `;
    }

    const notes = text(order.notes || order.note || order.summary || order.clientVisibility) || "Nessuna nota operativa inserita.";
    return `
      <section class="view ${appState.currentView === "operator-order" ? "active" : ""}">
        <div class="screen-header">
          <div>
            <h2>Scheda lavorazione #${escapeHtml(order.id)}</h2>
            <p>Vista operatore con note, foto e materiali necessari alla produzione.</p>
          </div>
          <div class="screen-actions">
            <div class="ghost-pill">${escapeHtml(order.category || "Ordine")}</div>
            <button class="action-pill" data-operator-back-calendar type="button">Torna al calendario</button>
          </div>
        </div>

        <div class="operator-order-grid">
          <div class="surface operator-main-panel">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Note ordine</h3>
                  <p>Informazioni operative per eseguire la lavorazione.</p>
                </div>
              </div>
              <div class="operator-note-box">
                <strong>${escapeHtml(order.summary || "Contesto lavorazione")}</strong>
                <span>${escapeHtml(notes)}</span>
              </div>
            </div>
          </div>

          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Task collegati</h3>
                  <p>Solo elenco operativo, senza dati amministrativi.</p>
                </div>
              </div>
              ${renderTasks(order)}
            </div>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Foto ordine</h3>
                <p>Immagini caricate da preventivo o dalla scheda ordine.</p>
              </div>
            </div>
            ${renderPhotos(order)}
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Materiali e magazzino</h3>
                <p>Materiali MMS, cliente o fornitore necessari per questa lavorazione.</p>
              </div>
            </div>
            ${renderMaterials(order)}
          </div>
        </div>
      </section>
    `;
  }

  function ensureStyles() {
    if (document.getElementById("operator-order-view-styles")) return;
    const style = document.createElement("style");
    style.id = "operator-order-view-styles";
    style.textContent = `
      .operator-order-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,.72fr);gap:16px}
      .operator-note-box{border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.72);padding:16px;display:grid;gap:8px;line-height:1.55}
      .operator-note-box strong{font-size:16px}
      .operator-note-box span{color:var(--text)}
      .operator-photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
      .operator-photo{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--panel);display:grid;text-decoration:none;color:var(--text)}
      .operator-photo img{width:100%;aspect-ratio:4/3;object-fit:cover;background:rgba(30,45,41,.06)}
      .operator-photo span{font-size:12px;color:var(--muted);padding:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .operator-order-table-wrap{overflow-x:auto}
      .operator-task-list .calendar-task-row{grid-template-columns:minmax(0,1fr) minmax(110px,.7fr) minmax(100px,.6fr) auto}
      @media(max-width:980px){.operator-order-grid{grid-template-columns:1fr}.operator-task-list .calendar-task-row{grid-template-columns:1fr;gap:6px}.operator-photo-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}}
    `;
    document.head.appendChild(style);
  }

  const baseRenderLayoutOperatorOrder = typeof renderLayout === "function" ? renderLayout : null;
  if (baseRenderLayoutOperatorOrder) {
    renderLayout = function renderLayoutWithOperatorOrder() {
      const html = baseRenderLayoutOperatorOrder();
      if (html.includes('appState.currentView === "operator-order"') || html.includes("operator-order-grid")) return html;
      return html.replace(
        "\n        </div>\n      </main>",
        `\n          ${renderOperatorOrder()}\n        </div>\n      </main>`
      );
    };
  }

  const baseRenderAppOperatorOrder = renderApp;
  renderApp = function renderAppWithOperatorOrder() {
    ensureStyles();
    baseRenderAppOperatorOrder();
  };

  document.addEventListener(
    "click",
    (event) => {
      const backButton = event.target.closest?.("[data-operator-back-calendar]");
      if (backButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        navigate("calendar");
        return;
      }

      if (appState.currentView !== "calendar" || !isOperatorOnly()) return;
      const openButton = event.target.closest?.("[data-calendar-open-order]");
      const eventCard = event.target.closest?.(".calendar-event, .slot[data-detail]");
      const orderButton = event.target.closest?.("[data-open='order-detail']");
      const orderId = Number(openButton?.dataset.calendarOpenOrder || eventCard?.dataset.detail || appState.selectedOrderId || 0);
      if (!orderId && !orderButton) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      appState.operatorOrderId = orderId || appState.selectedOrderId;
      appState.selectedOrderId = appState.operatorOrderId;
      navigate("operator-order", appState.operatorOrderId);
    },
    true
  );

  document.addEventListener("keydown", (event) => {
    if (appState.currentView !== "calendar" || !isOperatorOnly()) return;
    if (!["Enter", " "].includes(event.key)) return;
    const eventCard = event.target.closest?.(".calendar-event, .slot[data-detail]");
    if (!eventCard?.dataset.detail) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const orderId = Number(eventCard.dataset.detail);
    appState.operatorOrderId = orderId;
    appState.selectedOrderId = orderId;
    navigate("operator-order", orderId);
  });

  if (document.getElementById("app")?.innerHTML) renderApp();
})();