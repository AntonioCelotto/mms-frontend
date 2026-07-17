(function () {
  const API_URL = "/api/inventory";

  const DEFAULT_DRAFT = {
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
  };

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
    return {
      ...raw,
      id: raw.id || "",
      item_type: raw.item_type === "articolo" ? "articolo" : "materiale",
      name: raw.name || raw.product || "",
      product: raw.product || raw.name || "",
      sku: raw.sku || raw.mms_code || raw.supplier_material_code || "",
      material_origin: raw.material_origin || "mms",
      supplier_name: raw.supplier_name || "",
      supplier_material_code: raw.supplier_material_code || "",
      mms_code: raw.mms_code || "",
      category: raw.category || "",
      color: raw.color || "",
      unit: raw.unit || "",
      available_quantity: raw.available_quantity ?? raw.available ?? 0,
      reserved_quantity: raw.reserved_quantity ?? raw.reserved ?? 0,
      reorder_threshold: raw.reorder_threshold ?? 0,
      unit_cost: raw.unit_cost ?? raw.cost ?? "",
      retail_price: raw.retail_price ?? raw.public_price ?? "",
      status: raw.status || "Disponibile",
      description: raw.description || "",
      notes: raw.notes || raw.reorder || "",
    };
  }

  function ensureState() {
    if (!Array.isArray(appData.inventory)) appData.inventory = [];
    appState.inventoryDraft = { ...DEFAULT_DRAFT, ...(appState.inventoryDraft || {}) };
    appState.inventoryFilters = {
      query: "",
      pendingQuery: "",
      origin: "all",
      supplier: "all",
      category: "all",
      ...(appState.inventoryFilters || {}),
    };
  }

  function itemCode(item) {
    return item.mms_code || item.supplier_material_code || item.sku || "";
  }

  function uniqueValues(items, field) {
    return [...new Set(items.map((item) => normalizeItem(item)[field]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "it"));
  }

  function filteredInventoryItems(type) {
    ensureState();
    const filters = appState.inventoryFilters;
    const query = text(filters.query).toLowerCase();
    return appData.inventory.map(normalizeItem).filter((item) => {
      const haystack = [
        item.item_type,
        item.sku,
        item.name,
        item.category,
        item.status,
        item.supplier_name,
        item.supplier_material_code,
        item.mms_code,
        item.color,
        item.description,
        item.unit_cost,
        item.retail_price,
        item.notes,
      ].join(" ").toLowerCase();
      return (
        item.item_type === type &&
        (!query || haystack.includes(query)) &&
        (filters.origin === "all" || item.material_origin === filters.origin) &&
        (filters.supplier === "all" || item.supplier_name === filters.supplier) &&
        (filters.category === "all" || item.category === filters.category)
      );
    });
  }

  async function inventoryRequest(method, body, query = "") {
    const response = await fetch(`${API_URL}${query}`, {
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

  function draftFromItem(item) {
    const normalized = normalizeItem(item);
    return {
      id: normalized.id || "",
      item_type: normalized.item_type || "materiale",
      name: normalized.name || "",
      category: normalized.category || "",
      material_origin: normalized.material_origin || "mms",
      supplier_name: normalized.supplier_name || "",
      supplier_material_code: normalized.supplier_material_code || "",
      mms_code: normalized.mms_code || "",
      unit: normalized.unit || "",
      available_quantity: String(normalized.available_quantity ?? 0),
      reserved_quantity: String(normalized.reserved_quantity ?? 0),
      reorder_threshold: String(normalized.reorder_threshold ?? 0),
      color: normalized.color || "",
      description: normalized.description || "",
      unit_cost: String(normalized.unit_cost ?? ""),
      retail_price: String(normalized.retail_price ?? ""),
      status: normalized.status || "Disponibile",
      notes: normalized.notes || "",
    };
  }

  function draftPayload() {
    ensureState();
    const draft = appState.inventoryDraft;
    return {
      id: draft.id || undefined,
      item_type: draft.item_type === "articolo" ? "articolo" : "materiale",
      name: draft.name,
      category: draft.category,
      material_origin: draft.material_origin || "mms",
      supplier_name: draft.supplier_name,
      supplier_material_code: draft.supplier_material_code,
      mms_code: draft.mms_code,
      unit: draft.unit,
      available_quantity: draft.available_quantity,
      reserved_quantity: draft.reserved_quantity,
      reorder_threshold: draft.reorder_threshold,
      color: draft.color,
      description: draft.description,
      unit_cost: draft.unit_cost,
      retail_price: draft.retail_price,
      status: draft.status,
      notes: draft.notes,
      import_source: "manuale",
    };
  }

  async function saveInventoryDraft() {
    ensureState();
    if (!text(appState.inventoryDraft.name)) {
      setFlashMessage("Inserisci il nome del materiale o articolo");
      renderApp();
      return;
    }
    setBusy(true);
    try {
      const isEdit = !!appState.inventoryDraft.id;
      await inventoryRequest(isEdit ? "PATCH" : "POST", draftPayload());
      appState.inventoryDraft = { ...DEFAULT_DRAFT, item_type: appState.inventoryDraft.item_type || "materiale" };
      await reloadInventory();
      setFlashMessage(isEdit ? "Elemento magazzino aggiornato" : "Elemento magazzino salvato");
    } catch (error) {
      setFlashMessage(error.message || "Elemento magazzino non salvato");
    } finally {
      appState.busy = false;
      renderApp();
    }
  }

  async function deleteInventoryItem(id) {
    const item = appData.inventory.map(normalizeItem).find((candidate) => String(candidate.id) === String(id));
    if (!item || !window.confirm(`Eliminare ${item.item_type === "articolo" ? "l'articolo" : "il materiale"} ${item.name}?`)) return;
    setBusy(true);
    try {
      await inventoryRequest("DELETE", null, `?id=${encodeURIComponent(item.id)}`);
      appData.inventory = appData.inventory.filter((candidate) => String(candidate.id) !== String(item.id));
      if (String(appState.inventoryDraft?.id) === String(item.id)) appState.inventoryDraft = { ...DEFAULT_DRAFT };
      setFlashMessage("Elemento eliminato dal magazzino");
    } catch (error) {
      setFlashMessage(error.message || "Elemento magazzino non eliminato");
    } finally {
      appState.busy = false;
      renderApp();
    }
  }

  function rowsMarkup(items, emptyLabel) {
    if (!items.length) return `<tr><td colspan="12"><div class="empty-state">${emptyLabel}</div></td></tr>`;
    return items
      .map((item) => {
        const typeLabel = item.item_type === "articolo" ? "Articolo" : "Materiale";
        return `
          <tr>
            <td><span class="table-status ${item.item_type === "articolo" ? "progress" : "done"}">${typeLabel}</span></td>
            <td><span class="table-status ${item.material_origin === "fornitore" ? "hold" : "done"}">${item.material_origin === "fornitore" ? "Fornitore" : "MMS"}</span></td>
            <td>${html(itemCode(item) || "-")}</td>
            <td><strong>${html(item.name || item.product)}</strong><div class="muted">${html(item.description || item.notes || "")}</div></td>
            <td>${html(item.category || "-")}</td>
            <td>${html(item.color || "-")}</td>
            <td>${html(item.available_quantity ?? 0)} ${html(item.unit || "")}</td>
            <td>${money(item.unit_cost)}</td>
            <td>${money(item.retail_price)}</td>
            <td><span class="table-status ${typeof getStatusClass === "function" ? getStatusClass(item.status || "Disponibile") : "done"}">${html(item.status || "Disponibile")}</span></td>
            <td><button class="mini-btn" data-inventory-ma-edit="${html(item.id)}" type="button">Modifica</button></td>
            <td><button class="mini-btn danger-btn" data-inventory-ma-delete="${html(item.id)}" type="button">Elimina</button></td>
          </tr>
        `;
      })
      .join("");
  }

  function tableMarkup(title, subtitle, items, emptyLabel) {
    return `
      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>${title}</h3>
              <p>${subtitle}</p>
            </div>
            <div class="ghost-pill">${items.length} elementi</div>
          </div>
          <div style="overflow-x:auto; width:100%;">
            <table style="min-width:1120px;">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Origine</th>
                  <th>Codice</th>
                  <th>Nome</th>
                  <th>Categoria</th>
                  <th>Colore</th>
                  <th>Disp.</th>
                  <th>Costo</th>
                  <th>Prezzo pubblico</th>
                  <th>Stato</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${rowsMarkup(items, emptyLabel)}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function field(label, markup, span = "") {
    return `<div class="field ${span}"><label>${label}</label>${markup}</div>`;
  }

  renderInventory = function renderInventoryMaterialsArticles() {
    ensureState();
    const filters = appState.inventoryFilters;
    const draft = appState.inventoryDraft;
    const allItems = appData.inventory.map(normalizeItem);
    const materials = filteredInventoryItems("materiale");
    const articles = filteredInventoryItems("articolo");
    const suppliers = uniqueValues(allItems, "supplier_name");
    const categories = uniqueValues(allItems, "category");

    return `
      <section class="view ${appState.currentView === "inventory" ? "active" : ""}">
        <div class="screen-header">
          <div>
            <h2>Magazzino</h2>
            <p>Archivio separato per materiali e articoli. Entrambi possono essere usati nei preventivi.</p>
          </div>
          <div class="screen-actions">
            <div class="ghost-pill">${materials.length} materiali</div>
            <div class="ghost-pill">${articles.length} articoli</div>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="filter-row" style="grid-template-columns:minmax(220px,1.5fr) auto minmax(150px,1fr) minmax(150px,1fr) minmax(150px,1fr);">
              <input class="filter-chip" data-inventory-ma-filter="pendingQuery" value="${html(filters.pendingQuery)}" placeholder="Cerca codice, nome, categoria" />
              <button class="action-pill" data-inventory-ma-search type="button">Cerca</button>
              <select class="filter-chip" data-inventory-ma-filter="origin">
                <option value="all" ${filters.origin === "all" ? "selected" : ""}>Tutte le origini</option>
                <option value="mms" ${filters.origin === "mms" ? "selected" : ""}>Solo MMS</option>
                <option value="fornitore" ${filters.origin === "fornitore" ? "selected" : ""}>Solo fornitori</option>
              </select>
              <select class="filter-chip" data-inventory-ma-filter="supplier">
                <option value="all" ${filters.supplier === "all" ? "selected" : ""}>Tutti i fornitori</option>
                ${suppliers.map((supplier) => `<option value="${html(supplier)}" ${filters.supplier === supplier ? "selected" : ""}>${html(supplier)}</option>`).join("")}
              </select>
              <select class="filter-chip" data-inventory-ma-filter="category">
                <option value="all" ${filters.category === "all" ? "selected" : ""}>Tutte le categorie</option>
                ${categories.map((category) => `<option value="${html(category)}" ${filters.category === category ? "selected" : ""}>${html(category)}</option>`).join("")}
              </select>
            </div>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>${draft.id ? "Modifica elemento" : "Carica elemento"}</h3>
                <p>Scegli se l'elemento e' un materiale o un articolo. Il costo viene usato automaticamente nei preventivi.</p>
              </div>
              <div class="pill-row">
                <button class="mini-btn" data-inventory-ma-new type="button">Nuovo</button>
                <button class="action-pill" data-inventory-ma-save type="button">${appState.busy ? "Salvataggio..." : "Salva"}</button>
              </div>
            </div>
            <div class="form-grid">
              ${field("Tipo", `<select class="filter-chip" data-inventory-ma-draft="item_type"><option value="materiale" ${draft.item_type !== "articolo" ? "selected" : ""}>Materiale</option><option value="articolo" ${draft.item_type === "articolo" ? "selected" : ""}>Articolo</option></select>`)}
              ${field("Nome", `<input class="field-value" data-inventory-ma-draft="name" value="${html(draft.name)}" placeholder="Nome materiale o articolo" />`, "span-2")}
              ${field("Origine", `<select class="filter-chip" data-inventory-ma-draft="material_origin"><option value="mms" ${draft.material_origin !== "fornitore" ? "selected" : ""}>MMS</option><option value="fornitore" ${draft.material_origin === "fornitore" ? "selected" : ""}>Fornitore</option></select>`)}
              ${field("Codice MMS", `<input class="field-value" data-inventory-ma-draft="mms_code" value="${html(draft.mms_code)}" />`)}
              ${field("Codice fornitore", `<input class="field-value" data-inventory-ma-draft="supplier_material_code" value="${html(draft.supplier_material_code)}" />`)}
              ${field("Fornitore", `<input class="field-value" data-inventory-ma-draft="supplier_name" value="${html(draft.supplier_name)}" />`)}
              ${field("Categoria", `<input class="field-value" data-inventory-ma-draft="category" value="${html(draft.category)}" />`)}
              ${field("Colore", `<input class="field-value" data-inventory-ma-draft="color" value="${html(draft.color)}" />`)}
              ${field("Unita'", `<input class="field-value" data-inventory-ma-draft="unit" value="${html(draft.unit)}" placeholder="pz, m, kg" />`)}
              ${field("Disponibile", `<input class="field-value" data-inventory-ma-draft="available_quantity" value="${html(draft.available_quantity)}" />`)}
              ${field("Impegnato", `<input class="field-value" data-inventory-ma-draft="reserved_quantity" value="${html(draft.reserved_quantity)}" />`)}
              ${field("Soglia riordino", `<input class="field-value" data-inventory-ma-draft="reorder_threshold" value="${html(draft.reorder_threshold)}" />`)}
              ${field("Costo", `<input class="field-value" data-inventory-ma-draft="unit_cost" value="${html(draft.unit_cost)}" placeholder="0,00" />`)}
              ${field("Prezzo pubblico", `<input class="field-value" data-inventory-ma-draft="retail_price" value="${html(draft.retail_price)}" placeholder="0,00" />`)}
              ${field("Stato", `<input class="field-value" data-inventory-ma-draft="status" value="${html(draft.status)}" />`)}
              ${field("Descrizione", `<textarea class="field-value" data-inventory-ma-draft="description" style="min-height:76px; align-items:flex-start; padding-top:12px;">${html(draft.description)}</textarea>`, "span-2")}
              ${field("Note", `<textarea class="field-value" data-inventory-ma-draft="notes" style="min-height:76px; align-items:flex-start; padding-top:12px;">${html(draft.notes)}</textarea>`, "span-2")}
            </div>
          </div>
        </div>

        ${tableMarkup("Materiali", "Materiali, tessuti, accessori e consumabili.", materials, "Nessun materiale salvato.")}
        ${tableMarkup("Articoli", "Articoli vendibili o riutilizzabili come materiale nei preventivi.", articles, "Nessun articolo salvato.")}
      </section>
    `;
  };

  function attachEvents() {
    if (appState.currentView !== "inventory") return;
    ensureState();

    document.querySelectorAll("[data-inventory-ma-filter]").forEach((input) => {
      const handler = (event) => {
        appState.inventoryFilters[event.target.dataset.inventoryMaFilter] = event.target.value;
        if (event.target.dataset.inventoryMaFilter !== "pendingQuery") renderApp();
      };
      input.oninput = handler;
      input.onchange = handler;
    });

    document.querySelectorAll("[data-inventory-ma-search]").forEach((button) => {
      button.onclick = () => {
        appState.inventoryFilters.query = appState.inventoryFilters.pendingQuery || "";
        renderApp();
      };
    });

    document.querySelectorAll("[data-inventory-ma-draft]").forEach((input) => {
      const handler = (event) => {
        appState.inventoryDraft[event.target.dataset.inventoryMaDraft] = event.target.value;
      };
      input.oninput = handler;
      input.onchange = handler;
    });

    document.querySelectorAll("[data-inventory-ma-new]").forEach((button) => {
      button.onclick = () => {
        appState.inventoryDraft = { ...DEFAULT_DRAFT };
        renderApp();
      };
    });

    document.querySelectorAll("[data-inventory-ma-save]").forEach((button) => {
      button.onclick = () => {
        if (!appState.busy) saveInventoryDraft();
      };
    });

    document.querySelectorAll("[data-inventory-ma-edit]").forEach((button) => {
      button.onclick = () => {
        const item = appData.inventory.find((entry) => String(entry.id) === String(button.dataset.inventoryMaEdit));
        if (item) {
          appState.inventoryDraft = draftFromItem(item);
          renderApp();
        }
      };
    });

    document.querySelectorAll("[data-inventory-ma-delete]").forEach((button) => {
      button.onclick = () => {
        if (!appState.busy) deleteInventoryItem(button.dataset.inventoryMaDelete);
      };
    });
  }

  const baseRenderAppInventoryMaterialsArticles = renderApp;
  renderApp = function renderAppInventoryMaterialsArticles() {
    baseRenderAppInventoryMaterialsArticles();
    attachEvents();
  };

  if (document.getElementById("app")?.innerHTML) renderApp();
})();