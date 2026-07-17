(function () {
  const INVENTORY_API = "/api/inventory";
  const QUOTES_API = "/api/quotes";

  function text(value) {
    return String(value ?? "").trim();
  }

  function html(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function money(value) {
    const parsed = Number(String(value ?? "").replace(",", "."));
    return (Number.isFinite(parsed) ? parsed : 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  }

  function normalizeItem(item) {
    const raw = item && typeof item === "object" ? item : {};
    const sku = raw.sku || raw.mms_code || raw.supplier_material_code || "";
    return {
      ...raw,
      id: raw.id || "",
      name: raw.name || raw.product || "",
      sku,
      item_type: raw.item_type === "articolo" ? "articolo" : "materiale",
      material_origin: raw.material_origin || "mms",
      available_quantity: raw.available_quantity ?? raw.available ?? 0,
      reserved_quantity: raw.reserved_quantity ?? raw.reserved ?? 0,
      unit_cost: raw.unit_cost ?? raw.cost ?? "",
      retail_price: raw.retail_price ?? raw.public_price ?? "",
      status: raw.status || "Disponibile",
    };
  }

  function ensureInventoryState() {
    if (!Array.isArray(appData.inventory)) appData.inventory = [];
    if (!appState.inventoryDraft) appState.inventoryDraft = {};
    appState.inventoryDraft = {
      id: "",
      item_type: "materiale",
      name: "",
      category: "",
      material_origin: "mms",
      supplier_name: "",
      supplier_material_code: "",
      mms_code: "",
      unit: "",
      available_quantity: "0",
      reserved_quantity: "0",
      reorder_threshold: "0",
      color: "",
      description: "",
      unit_cost: "",
      retail_price: "",
      status: "Disponibile",
      notes: "",
      ...appState.inventoryDraft,
    };
    if (!appState.inventoryFilters) appState.inventoryFilters = {};
    appState.inventoryFilters = {
      pendingQuery: "",
      query: "",
      origin: "all",
      category: "all",
      ...appState.inventoryFilters,
    };
  }

  async function inventoryRequest(method, body, query = "") {
    const response = await fetch(`${INVENTORY_API}${query}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || payload.error || "Operazione magazzino non riuscita");
    return payload;
  }

  async function reloadInventory() {
    const payload = await inventoryRequest("GET");
    appData.inventory = (payload.items || []).map(normalizeItem);
  }

  function itemCode(item) {
    return item.mms_code || item.supplier_material_code || item.sku || "";
  }

  function itemLabel(item) {
    const type = item.item_type === "articolo" ? "Articolo" : "Materiale";
    const code = itemCode(item);
    return `${type} - ${item.name || "Senza nome"}${code ? ` (${code})` : ""}`;
  }

  function filteredItems(type) {
    ensureInventoryState();
    const filters = appState.inventoryFilters;
    const query = text(filters.query).toLowerCase();
    return appData.inventory.map(normalizeItem).filter((item) => {
      const haystack = [item.name, item.sku, item.mms_code, item.supplier_material_code, item.category, item.color, item.description].join(" ").toLowerCase();
      return item.item_type === type && (!query || haystack.includes(query)) && (filters.origin === "all" || item.material_origin === filters.origin);
    });
  }

  function inventoryDraftPayload() {
    ensureInventoryState();
    return { ...appState.inventoryDraft, import_source: "manuale" };
  }

  async function saveInventoryDraftPolish() {
    ensureInventoryState();
    if (!text(appState.inventoryDraft.name)) {
      setFlashMessage("Inserisci il nome del materiale o articolo");
      renderApp();
      return;
    }
    setBusy(true);
    try {
      const method = appState.inventoryDraft.id ? "PATCH" : "POST";
      await inventoryRequest(method, inventoryDraftPayload());
      appState.inventoryDraft = { item_type: appState.inventoryDraft.item_type || "materiale" };
      await reloadInventory();
      setFlashMessage(method === "PATCH" ? "Elemento magazzino aggiornato" : "Elemento magazzino salvato");
    } catch (error) {
      setFlashMessage(error.message);
    } finally {
      appState.busy = false;
      renderApp();
    }
  }

  async function deleteInventoryItem(id) {
    if (!id || !window.confirm("Eliminare questo elemento dal magazzino?")) return;
    setBusy(true);
    try {
      await inventoryRequest("DELETE", null, `?id=${encodeURIComponent(id)}`);
      appData.inventory = appData.inventory.filter((item) => String(item.id) !== String(id));
      if (String(appState.inventoryDraft?.id) === String(id)) appState.inventoryDraft = {};
      setFlashMessage("Elemento eliminato dal magazzino");
    } catch (error) {
      setFlashMessage(error.message);
    } finally {
      appState.busy = false;
      renderApp();
    }
  }

  function renderInventoryRowsPolish(items) {
    if (!items.length) return `<tr><td colspan="10"><div class="empty-state">Nessun elemento salvato.</div></td></tr>`;
    return items.map((item) => `
      <tr>
        <td><span class="table-status ${item.item_type === "articolo" ? "progress" : "done"}">${item.item_type === "articolo" ? "Articolo" : "Materiale"}</span></td>
        <td>${html(itemCode(item) || "-")}</td>
        <td><strong>${html(item.name)}</strong><div class="muted">${html(item.description || item.notes || "")}</div></td>
        <td>${html(item.category || "-")}</td>
        <td>${html(item.color || "-")}</td>
        <td>${html(item.available_quantity)} ${html(item.unit || "")}</td>
        <td>${money(item.unit_cost)}</td>
        <td>${money(item.retail_price)}</td>
        <td><button class="mini-btn" data-inventory-edit-polish="${html(item.id)}" type="button">Modifica</button></td>
        <td><button class="mini-btn danger-btn" data-inventory-delete="${html(item.id)}" type="button">Elimina</button></td>
      </tr>
    `).join("");
  }

  renderInventory = function renderInventoryPolish() {
    ensureInventoryState();
    const draft = appState.inventoryDraft;
    const materials = filteredItems("materiale");
    const articles = filteredItems("articolo");
    const filters = appState.inventoryFilters;
    return `
      <section class="view ${appState.currentView === "inventory" ? "active" : ""}">
        <div class="screen-header">
          <div>
            <h2>Magazzino</h2>
            <p>Archivio materiali e articoli. Gli articoli possono essere usati anche come materiale nei preventivi.</p>
          </div>
          <div class="screen-actions">
            <div class="ghost-pill">${materials.length} materiali</div>
            <div class="ghost-pill">${articles.length} articoli</div>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="filter-row" style="grid-template-columns:minmax(220px,1fr) auto minmax(160px,.6fr);">
              <input class="filter-chip" data-inventory-filter-polish="pendingQuery" value="${html(filters.pendingQuery)}" placeholder="Cerca codice, nome, categoria" />
              <button class="action-pill" data-inventory-search-polish type="button">Cerca</button>
              <select class="filter-chip" data-inventory-filter-polish="origin">
                <option value="all" ${filters.origin === "all" ? "selected" : ""}>Tutte le origini</option>
                <option value="mms" ${filters.origin === "mms" ? "selected" : ""}>Solo MMS</option>
                <option value="fornitore" ${filters.origin === "fornitore" ? "selected" : ""}>Solo fornitori</option>
              </select>
            </div>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>${draft.id ? "Modifica elemento" : "Carica elemento"}</h3>
                <p>Scegli se stai caricando un materiale o un articolo vendibile/usabile nei preventivi.</p>
              </div>
              <div class="pill-row">
                <button class="mini-btn" data-inventory-new-polish type="button">Nuovo</button>
                <button class="action-pill" data-inventory-save-polish type="button">${appState.busy ? "Salvataggio..." : "Salva"}</button>
              </div>
            </div>
            <div class="form-grid">
              <div class="field"><label>Tipo</label><select class="filter-chip" data-inventory-draft-polish="item_type"><option value="materiale" ${draft.item_type !== "articolo" ? "selected" : ""}>Materiale</option><option value="articolo" ${draft.item_type === "articolo" ? "selected" : ""}>Articolo</option></select></div>
              <div class="field span-2"><label>Nome</label><input class="field-value" data-inventory-draft-polish="name" value="${html(draft.name)}" placeholder="Nome materiale o articolo" /></div>
              <div class="field"><label>Origine</label><select class="filter-chip" data-inventory-draft-polish="material_origin"><option value="mms" ${draft.material_origin !== "fornitore" ? "selected" : ""}>MMS</option><option value="fornitore" ${draft.material_origin === "fornitore" ? "selected" : ""}>Fornitore</option></select></div>
              <div class="field"><label>Codice MMS</label><input class="field-value" data-inventory-draft-polish="mms_code" value="${html(draft.mms_code)}" /></div>
              <div class="field"><label>Codice fornitore</label><input class="field-value" data-inventory-draft-polish="supplier_material_code" value="${html(draft.supplier_material_code)}" /></div>
              <div class="field"><label>Fornitore</label><input class="field-value" data-inventory-draft-polish="supplier_name" value="${html(draft.supplier_name)}" /></div>
              <div class="field"><label>Categoria</label><input class="field-value" data-inventory-draft-polish="category" value="${html(draft.category)}" /></div>
              <div class="field"><label>Colore</label><input class="field-value" data-inventory-draft-polish="color" value="${html(draft.color)}" /></div>
              <div class="field"><label>Unita'</label><input class="field-value" data-inventory-draft-polish="unit" value="${html(draft.unit)}" placeholder="pz, m, kg" /></div>
              <div class="field"><label>Disponibile</label><input class="field-value" data-inventory-draft-polish="available_quantity" value="${html(draft.available_quantity)}" /></div>
              <div class="field"><label>Costo</label><input class="field-value" data-inventory-draft-polish="unit_cost" value="${html(draft.unit_cost)}" placeholder="0,00" /></div>
              <div class="field"><label>Prezzo pubblico</label><input class="field-value" data-inventory-draft-polish="retail_price" value="${html(draft.retail_price)}" placeholder="0,00" /></div>
              <div class="field span-2"><label>Descrizione</label><textarea class="field-value" data-inventory-draft-polish="description" style="min-height:76px; align-items:flex-start; padding-top:12px;">${html(draft.description)}</textarea></div>
              <div class="field span-2"><label>Note</label><textarea class="field-value" data-inventory-draft-polish="notes" style="min-height:76px; align-items:flex-start; padding-top:12px;">${html(draft.notes)}</textarea></div>
            </div>
          </div>
        </div>

        <div class="surface"><div class="surface-inner">
          <div class="section-title"><div><h3>Materiali</h3><p>Prodotti usati come componenti, tessuti, accessori o consumabili.</p></div></div>
          <div style="overflow-x:auto;"><table style="min-width:980px;"><thead><tr><th>Tipo</th><th>Codice</th><th>Nome</th><th>Categoria</th><th>Colore</th><th>Disp.</th><th>Costo</th><th>Prezzo</th><th></th><th></th></tr></thead><tbody>${renderInventoryRowsPolish(materials)}</tbody></table></div>
        </div></div>

        <div class="surface"><div class="surface-inner">
          <div class="section-title"><div><h3>Articoli</h3><p>Articoli vendibili che possono essere inseriti anche nei materiali del preventivo.</p></div></div>
          <div style="overflow-x:auto;"><table style="min-width:980px;"><thead><tr><th>Tipo</th><th>Codice</th><th>Nome</th><th>Categoria</th><th>Colore</th><th>Disp.</th><th>Costo</th><th>Prezzo</th><th></th><th></th></tr></thead><tbody>${renderInventoryRowsPolish(articles)}</tbody></table></div>
        </div></div>
      </section>
    `;
  };

  function inventoryById(id) {
    return appData.inventory.map(normalizeItem).find((item) => String(item.id) === String(id));
  }

  function attachInventoryPolishEvents() {
    if (appState.currentView !== "inventory") return;
    document.querySelectorAll("[data-inventory-filter-polish]").forEach((input) => {
      input.oninput = (event) => {
        appState.inventoryFilters[event.target.dataset.inventoryFilterPolish] = event.target.value;
      };
      input.onchange = input.oninput;
    });
    document.querySelectorAll("[data-inventory-search-polish]").forEach((button) => {
      button.onclick = () => {
        appState.inventoryFilters.query = appState.inventoryFilters.pendingQuery || "";
        renderApp();
      };
    });
    document.querySelectorAll("[data-inventory-draft-polish]").forEach((input) => {
      input.oninput = (event) => {
        appState.inventoryDraft[event.target.dataset.inventoryDraftPolish] = event.target.value;
      };
      input.onchange = input.oninput;
    });
    document.querySelectorAll("[data-inventory-save-polish]").forEach((button) => {
      button.onclick = () => !appState.busy && saveInventoryDraftPolish();
    });
    document.querySelectorAll("[data-inventory-new-polish]").forEach((button) => {
      button.onclick = () => {
        appState.inventoryDraft = {};
        renderApp();
      };
    });
    document.querySelectorAll("[data-inventory-edit-polish]").forEach((button) => {
      button.onclick = () => {
        const item = inventoryById(button.dataset.inventoryEditPolish);
        if (item) {
          appState.inventoryDraft = { ...item };
          renderApp();
        }
      };
    });
    document.querySelectorAll("[data-inventory-delete]").forEach((button) => {
      button.onclick = () => deleteInventoryItem(button.dataset.inventoryDelete);
    });
  }

  function inventoryOptions(type) {
    const items = appData.inventory.map(normalizeItem).filter((item) => !type || item.item_type === type);
    return items.map((item) => `<option value="${html(item.id)}">${html(itemLabel(item))}</option>`).join("");
  }

  if (typeof renderQuoteArticle === "function") {
    const baseRenderQuoteArticle = renderQuoteArticle;
    renderQuoteArticle = function renderQuoteArticleWithArticlePicker(article, articleIndex) {
      const selectedId = text(article.inventory_item_id || article.inventoryItemId);
      const articlePicker = `
        <div class="field span-2">
          <label>Articolo da magazzino</label>
          <select class="filter-chip" data-quote-article-pick="${articleIndex}">
            <option value="">Articolo manuale</option>
            ${inventoryOptions("articolo").replace(`value="${html(selectedId)}"`, `value="${html(selectedId)}" selected`)}
          </select>
        </div>`;
      return baseRenderQuoteArticle(article, articleIndex).replace('<div class="form-grid">', `<div class="form-grid">${articlePicker}`);
    };
  }

  function quoteMaterialRowsPolish(article, articleIndex) {
    return (article.materials || []).map((material, materialIndex) => {
      const source = text(material.source_type || material.source) === "cliente" ? "cliente" : "mms";
      const selectedId = text(material.inventory_item_id || material.inventoryItemId);
      const costCell = source === "cliente"
        ? `<span class="muted">Nessun prezzo per magazzino cliente</span>`
        : `<input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="price" value="${html(material.price)}" placeholder="costo" />`;
      return `
        <tr>
          <td><select class="filter-chip" data-quote-source-choice="${articleIndex}" data-quote-material-index="${materialIndex}"><option value="mms" ${source === "mms" ? "selected" : ""}>Magazzino MMS</option><option value="cliente" ${source === "cliente" ? "selected" : ""}>Magazzino cliente</option></select></td>
          <td>${source === "mms" ? `<select class="filter-chip" data-quote-inventory-pick="${articleIndex}" data-quote-material-index="${materialIndex}"><option value="">Seleziona materiale/articolo</option>${inventoryOptions("").replace(`value="${html(selectedId)}"`, `value="${html(selectedId)}" selected`)}</select>` : `<span class="muted">Compilazione manuale cliente</span>`}</td>
          <td><input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="product_code" value="${html(material.product_code || material.inventory_sku || material.sku)}" placeholder="codice" /></td>
          <td><input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="material" value="${html(material.material)}" placeholder="nome" /></td>
          <td><input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="quantity" value="${html(material.quantity)}" placeholder="q.ta" /></td>
          <td>${costCell}</td>
          <td>${source === "cliente" ? "" : money((Number(String(material.quantity || 0).replace(",", ".")) || 0) * (Number(String(material.price || 0).replace(",", ".")) || 0))}</td>
          <td><button class="mini-btn" data-quote-remove-material="${articleIndex}" data-quote-remove-material-index="${materialIndex}" type="button">Rimuovi</button></td>
        </tr>
      `;
    }).join("");
  }

  if (typeof renderQuoteMaterialRows === "function") {
    renderQuoteMaterialRows = quoteMaterialRowsPolish;
  }

  if (typeof renderQuoteArticle === "function") {
    const previousRenderQuoteArticle = renderQuoteArticle;
    renderQuoteArticle = function renderQuoteArticleHeaders(article, articleIndex) {
      return previousRenderQuoteArticle(article, articleIndex)
        .replace("<th>Magazzino</th><th>Materiale / prodotto</th>", "<th>Origine</th><th>Magazzino</th><th>Codice</th><th>Materiale / articolo</th>")
        .replace("<th>Prezzo</th>", "<th>Costo</th>");
    };
  }

  function applyItemToMaterial(articleIndex, materialIndex, itemId) {
    const item = inventoryById(itemId);
    const material = appState.quoteArticles?.[articleIndex]?.materials?.[materialIndex];
    if (!item || !material) return;
    material.material = item.name;
    material.inventory_item_id = item.id;
    material.inventory_sku = item.sku || itemCode(item);
    material.product_code = itemCode(item);
    material.sku = item.sku || itemCode(item);
    material.source_type = "mms";
    material.item_type = item.item_type;
    material.unit = item.unit || "";
    material.color = item.color || "";
    material.description = item.description || "";
    material.price = text(item.unit_cost) || text(item.retail_price) || "";
    if (!text(material.quantity)) material.quantity = "1";
    renderApp();
  }

  function applyItemToArticle(articleIndex, itemId) {
    const item = inventoryById(itemId);
    const article = appState.quoteArticles?.[articleIndex];
    if (!item || !article) return;
    article.name = item.name;
    article.inventory_item_id = item.id;
    article.product_code = itemCode(item);
    article.cost = text(item.unit_cost) || text(item.retail_price) || "";
    if (!text(article.quantity)) article.quantity = "1";
    renderApp();
  }

  const baseAttachQuoteEventsPolish = typeof attachQuoteEvents === "function" ? attachQuoteEvents : null;
  if (baseAttachQuoteEventsPolish) {
    attachQuoteEvents = function attachQuoteEventsPolish() {
      baseAttachQuoteEventsPolish();
      document.querySelectorAll("[data-quote-source-choice]").forEach((select) => {
        select.onchange = (event) => {
          const material = appState.quoteArticles?.[Number(event.target.dataset.quoteSourceChoice)]?.materials?.[Number(event.target.dataset.quoteMaterialIndex)];
          if (!material) return;
          material.source_type = event.target.value;
          if (event.target.value === "cliente") {
            material.price = "";
            material.inventory_item_id = "";
            material.inventory_sku = "";
          }
          renderApp();
        };
      });
      document.querySelectorAll("[data-quote-inventory-pick]").forEach((select) => {
        select.onchange = (event) => applyItemToMaterial(Number(event.target.dataset.quoteInventoryPick), Number(event.target.dataset.quoteMaterialIndex), event.target.value);
      });
      document.querySelectorAll("[data-quote-article-pick]").forEach((select) => {
        select.onchange = (event) => applyItemToArticle(Number(event.target.dataset.quoteArticlePick), event.target.value);
      });
    };
  }

  function selectedQuote(id) {
    return typeof quoteListFind === "function" ? quoteListFind(id) : null;
  }

  async function deleteQuote(id) {
    if (!id || !window.confirm("Eliminare questo preventivo?")) return;
    appState.savedQuotes = (appState.savedQuotes || []).filter((quote) => quote.id !== id);
    if (appState.selectedQuoteId === id) appState.selectedQuoteId = appState.savedQuotes[0]?.id || "";
    if (typeof quoteHistoryRecoveryWrite === "function") quoteHistoryRecoveryWrite(appState.savedQuotes);
    if (typeof quoteStorageWrite === "function") quoteStorageWrite();
    try {
      await fetch(`${QUOTES_API}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (error) {
      console.warn("Preventivo eliminato localmente ma non sincronizzato", error);
    }
    setFlashMessage(`Preventivo ${id} eliminato`);
    renderApp();
  }

  function editQuote(id) {
    const quote = selectedQuote(id);
    if (!quote) return;
    appState.editingQuoteId = quote.id;
    appState.draftOrder = {
      ...(appState.draftOrder || {}),
      client: quote.client,
      category: quote.category,
      priority: quote.priority,
      orderDate: quote.quoteDate,
      note: quote.note,
    };
    appState.quoteArticles = JSON.parse(JSON.stringify(quote.articles || []));
    appState.quoteClientDraft = JSON.parse(JSON.stringify(quote.clientInfo || {}));
    appState.currentView = "new-order";
    setFlashMessage(`Modifica preventivo ${quote.id}`);
    renderApp();
  }

  if (typeof quoteListSaveCurrent === "function") {
    const baseQuoteListSaveCurrent = quoteListSaveCurrent;
    quoteListSaveCurrent = function quoteListSaveCurrentPolish() {
      if (!appState.editingQuoteId) return baseQuoteListSaveCurrent();
      const quote = selectedQuote(appState.editingQuoteId);
      if (!quote) return baseQuoteListSaveCurrent();
      ensureQuoteState();
      quote.client = text(appState.draftOrder.client);
      quote.category = appState.draftOrder.category;
      quote.priority = appState.draftOrder.priority;
      quote.quoteDate = appState.draftOrder.orderDate || new Date().toISOString().slice(0, 10);
      quote.note = appState.draftOrder.note || "";
      quote.articles = JSON.parse(JSON.stringify(appState.quoteArticles || []));
      quote.clientInfo = JSON.parse(JSON.stringify(appState.quoteClientDraft || {}));
      quote.total = typeof quoteGrandTotal === "function" ? quoteGrandTotal() : quote.total;
      quote.updatedAt = new Date().toISOString();
      appState.selectedQuoteId = quote.id;
      appState.editingQuoteId = "";
      appState.currentView = "quotes";
      if (typeof quoteHistoryRecoveryWrite === "function") quoteHistoryRecoveryWrite(appState.savedQuotes);
      if (typeof quoteStorageWrite === "function") quoteStorageWrite();
      if (typeof window.quoteDatabaseSave === "function") window.quoteDatabaseSave(quote);
      setFlashMessage(`Preventivo ${quote.id} aggiornato`);
      renderApp();
    };
  }

  if (typeof renderQuotes === "function") {
    const baseRenderQuotes = renderQuotes;
    renderQuotes = function renderQuotesPolish() {
      return baseRenderQuotes()
        .replace(/<th>Azioni<\/th>/, "<th>Azioni</th>")
        .replace(/<td><button class="mini-btn" data-quote-pdf="([^"]+)" type="button">PDF<\/button><\/td>/g, '<td><div class="pill-row"><button class="mini-btn" data-quote-pdf="$1" type="button">PDF</button><button class="mini-btn" data-quote-edit="$1" type="button">Modifica</button><button class="mini-btn danger-btn" data-quote-delete="$1" type="button">Elimina</button></div></td>')
        .replace(/<button class="mini-btn" data-quote-pdf="([^"]+)" type="button">Scarica PDF<\/button>/, '<button class="mini-btn" data-quote-pdf="$1" type="button">Scarica PDF</button><button class="mini-btn" data-quote-edit="$1" type="button">Modifica</button><button class="mini-btn danger-btn" data-quote-delete="$1" type="button">Elimina</button>');
    };
  }

  if (typeof quoteListPdfHtml === "function") {
    quoteListPdfHtml = function quoteListPdfHtmlCodes(quote) {
      const rows = (quote.articles || []).map((article, index) => {
        const materialRows = (article.materials || []).map((material) => `
          <tr>
            <td style="padding:6px 0 6px 18px;">${html(material.product_code || material.inventory_sku || material.sku || "-")}</td>
            <td style="text-align:right;">${html(material.quantity)}</td>
            <td style="text-align:right;">${material.source_type === "cliente" ? "" : money(material.price)}</td>
            <td style="text-align:right;">${material.source_type === "cliente" ? "" : money((Number(String(material.quantity || 0).replace(",", ".")) || 0) * (Number(String(material.price || 0).replace(",", ".")) || 0))}</td>
          </tr>`).join("");
        return `
          <tr>
            <td style="padding-top:12px;"><strong>${index + 1}. ${html(article.product_code || article.inventory_sku || article.sku || article.name || "Articolo")}</strong></td>
            <td style="text-align:right;">${html(article.quantity || "1")}</td>
            <td style="text-align:right;">${money(article.cost)}</td>
            <td style="text-align:right;">${money((Number(String(article.quantity || 1).replace(",", ".")) || 1) * (Number(String(article.cost || 0).replace(",", ".")) || 0))}</td>
          </tr>${materialRows}`;
      }).join("");
      return `
        <!doctype html><html lang="it"><head><meta charset="utf-8" /><title>Preventivo ${html(quote.id)}</title>
        <style>body{font-family:Arial,sans-serif;color:#1d2320;padding:40px}header{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:18px;margin-bottom:28px}h1{margin:0;font-size:28px}table{width:100%;border-collapse:collapse;margin-top:24px}th{text-align:left;border-bottom:1px solid #999;padding:8px 0}td{border-bottom:1px solid #ddd;padding:8px 0}.total{margin-top:28px;text-align:right;font-size:22px;font-weight:700}.note{margin-top:28px;padding:16px;background:#f6f3ec}@media print{button{display:none}}</style>
        </head><body><button onclick="window.print()">Stampa / salva PDF</button>
        <header><div><h1>MMS Studio</h1><p>Preventivo ${html(quote.id)}</p></div><div><strong>Cliente</strong><br />${html(quote.client)}<br />Data: ${html(quote.quoteDate)}</div></header>
        <section><p><strong>Categoria:</strong> ${html(quote.category)}<br /><strong>Priorita':</strong> ${html(quote.priority)}</p></section>
        <table><thead><tr><th>Codice prodotto</th><th style="text-align:right;">Quantita'</th><th style="text-align:right;">Costo</th><th style="text-align:right;">Totale</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="total">Totale: ${money(quote.total)}</div>${quote.note ? `<div class="note"><strong>Note</strong><br />${html(quote.note)}</div>` : ""}</body></html>`;
    };
  }

  const baseAttachEventsPolish = attachEvents;
  attachEvents = function attachEventsInventoryQuotesPolish() {
    baseAttachEventsPolish();
    attachInventoryPolishEvents();
    document.querySelectorAll("[data-quote-delete]").forEach((button) => {
      button.onclick = () => deleteQuote(button.dataset.quoteDelete);
    });
    document.querySelectorAll("[data-quote-edit]").forEach((button) => {
      button.onclick = () => editQuote(button.dataset.quoteEdit);
    });
  };

  const baseRenderAppPolish = renderApp;
  renderApp = function renderAppInventoryQuotesPolish() {
    baseRenderAppPolish();
    if (appState.currentView === "inventory") attachInventoryPolishEvents();
  };

  ensureInventoryState();
  reloadInventory().then(() => {
    if (["inventory", "new-order"].includes(appState.currentView)) renderApp();
  }).catch(() => {});
})();