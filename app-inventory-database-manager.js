(function () {
  const API_URL = "/api/inventory";
  const DEFAULT_DRAFT = {
    id: "",
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
    status: "Disponibile",
    notes: "",
  };

  let inventoryLoaded = false;
  let inventoryLoading = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensureInventoryState() {
    if (!appState.inventoryFilters) {
      appState.inventoryFilters = { query: "", pendingQuery: "", origin: "all", supplier: "all", category: "all" };
    }
    if (appState.inventoryFilters.pendingQuery === undefined) {
      appState.inventoryFilters.pendingQuery = appState.inventoryFilters.query || "";
    }
    if (!appState.inventoryDraft) {
      appState.inventoryDraft = { ...DEFAULT_DRAFT };
    }
    if (typeof appState.inventoryImportOpen !== "boolean") {
      appState.inventoryImportOpen = false;
    }
    if (!Array.isArray(appData.inventory)) {
      appData.inventory = [];
    }
  }

  function normalizeItem(item) {
    return {
      ...item,
      product: item.product || item.name || "",
      name: item.name || item.product || "",
      available: item.available ?? item.available_quantity ?? 0,
      available_quantity: item.available_quantity ?? item.available ?? 0,
      reserved: item.reserved ?? item.reserved_quantity ?? 0,
      reserved_quantity: item.reserved_quantity ?? item.reserved ?? 0,
      reorder_threshold: item.reorder_threshold ?? 0,
      reorder: item.reorder || item.notes || "",
      notes: item.notes || item.reorder || "",
      material_origin: item.material_origin || "mms",
      supplier_name: item.supplier_name || "",
      supplier_material_code: item.supplier_material_code || "",
      mms_code: item.mms_code || "",
      unit: item.unit || "",
      sku: item.sku || item.mms_code || item.supplier_material_code || "",
    };
  }

  async function inventoryApi(method, body) {
    const response = await fetch(API_URL, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || payload.detail || "Operazione magazzino non riuscita");
    }
    return payload;
  }

  async function loadInventory(force = false) {
    ensureInventoryState();
    if (inventoryLoading || (inventoryLoaded && !force)) return;
    inventoryLoading = true;
    try {
      const payload = await inventoryApi("GET");
      appData.inventory = (payload.items || []).map(normalizeItem);
      inventoryLoaded = true;
    } catch (error) {
      setFlashMessage(`Magazzino non caricato: ${error.message}`);
    } finally {
      inventoryLoading = false;
    }
  }

  function itemMainCode(item) {
    if ((item.material_origin || "mms") === "fornitore") {
      return item.supplier_material_code || item.sku || "";
    }
    return item.mms_code || item.sku || "";
  }

  function uniqueValues(items, field) {
    return [...new Set(items.map((item) => normalizeItem(item)[field]).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), "it"));
  }

  function filteredInventoryItems() {
    ensureInventoryState();
    const filters = appState.inventoryFilters;
    const query = (filters.query || "").trim().toLowerCase();
    return appData.inventory.map(normalizeItem).filter((item) => {
      const haystack = [
        item.sku,
        item.name,
        item.product,
        item.category,
        item.status,
        item.supplier_name,
        item.supplier_material_code,
        item.mms_code,
        item.notes,
      ].join(" ").toLowerCase();
      return (
        (!query || haystack.includes(query)) &&
        (filters.origin === "all" || item.material_origin === filters.origin) &&
        (filters.supplier === "all" || item.supplier_name === filters.supplier) &&
        (filters.category === "all" || item.category === filters.category)
      );
    });
  }

  function draftFromItem(item) {
    const normalized = normalizeItem(item);
    return {
      id: normalized.id || "",
      name: normalized.name || normalized.product || "",
      category: normalized.category || "",
      material_origin: normalized.material_origin || "mms",
      supplier_name: normalized.supplier_name || "",
      supplier_material_code: normalized.supplier_material_code || "",
      mms_code: normalized.mms_code || "",
      unit: normalized.unit || "",
      available_quantity: String(normalized.available_quantity ?? 0),
      reserved_quantity: String(normalized.reserved_quantity ?? 0),
      reorder_threshold: String(normalized.reorder_threshold ?? 0),
      status: normalized.status || "Disponibile",
      notes: normalized.notes || "",
    };
  }

  function draftPayload() {
    const draft = appState.inventoryDraft || DEFAULT_DRAFT;
    return {
      id: draft.id || undefined,
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
      status: draft.status,
      notes: draft.notes,
      import_source: "manuale",
    };
  }

  function mergeSavedItems(savedItems) {
    const saved = (savedItems || []).map(normalizeItem);
    if (!saved.length) return;
    const savedIds = new Set(saved.map((item) => String(item.id)).filter(Boolean));
    const savedSkus = new Set(saved.map((item) => item.sku).filter(Boolean));
    appData.inventory = [
      ...saved,
      ...appData.inventory.map(normalizeItem).filter((item) => {
        const sameId = item.id && savedIds.has(String(item.id));
        const sameSku = item.sku && savedSkus.has(item.sku);
        return !sameId && !sameSku;
      }),
    ];
  }

  async function saveInventoryDraft() {
    ensureInventoryState();
    if (!appState.inventoryDraft.name.trim()) {
      setFlashMessage("Inserisci il nome del materiale");
      return;
    }
    setBusy(true);
    try {
      const isEdit = !!appState.inventoryDraft.id;
      const response = await inventoryApi(isEdit ? "PATCH" : "POST", draftPayload());
      mergeSavedItems(response.items || (response.item ? [response.item] : []));
      appState.inventoryDraft = { ...DEFAULT_DRAFT };
      inventoryLoaded = false;
      await loadInventory(true);
      setFlashMessage(isEdit ? "Materiale aggiornato" : "Materiale salvato in magazzino");
    } catch (error) {
      setFlashMessage(error.message);
    } finally {
      appState.busy = false;
      renderApp();
    }
  }

  function splitCsvLine(line) {
    const separator = line.includes(";") ? ";" : ",";
    return line.split(separator).map((value) => value.trim().replace(/^"|"$/g, ""));
  }

  function parseInventoryImport(text) {
    const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return [];
    const first = lines[0].toLowerCase();
    const hasHeader = first.includes("nome") || first.includes("materiale");
    const rows = hasHeader ? lines.slice(1) : lines;
    return rows.map((line) => {
      const cells = splitCsvLine(line);
      return {
        name: cells[0] || "",
        material_origin: (cells[1] || "mms").toLowerCase().includes("for") ? "fornitore" : "mms",
        supplier_name: cells[2] || "",
        supplier_material_code: cells[3] || "",
        mms_code: cells[4] || "",
        category: cells[5] || "",
        available_quantity: cells[6] || "0",
        unit: cells[7] || "",
        status: cells[8] || "Disponibile",
        notes: cells[9] || "",
        import_source: "import",
      };
    }).filter((row) => row.name);
  }

  async function importInventoryRows() {
    const source = document.querySelector("[data-inventory-import]")?.value || "";
    const items = parseInventoryImport(source);
    if (!items.length) {
      setFlashMessage("Nessuna riga valida da importare");
      return;
    }
    setBusy(true);
    try {
      const response = await inventoryApi("POST", { items });
      mergeSavedItems(response.items || []);
      inventoryLoaded = false;
      await loadInventory(true);
      setFlashMessage(`${items.length} materiali importati in magazzino`);
    } catch (error) {
      setFlashMessage(error.message);
    } finally {
      appState.busy = false;
      renderApp();
    }
  }

  function exportInventoryCsv() {
    const headers = ["nome", "origine", "fornitore", "codice_fornitore", "codice_mms", "categoria", "quantita", "unita", "stato", "note"];
    const rows = filteredInventoryItems().map((item) => [
      item.name || item.product,
      item.material_origin || "mms",
      item.supplier_name || "",
      item.supplier_material_code || "",
      item.mms_code || "",
      item.category || "",
      item.available_quantity ?? item.available ?? 0,
      item.unit || "",
      item.status || "",
      item.notes || item.reorder || "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "magazzino-mms.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function inventoryRowsMarkup(items) {
    if (!items.length) {
      return `<tr><td colspan="9"><div class="empty-state">${inventoryLoading ? "Caricamento magazzino..." : "Nessun materiale trovato con questi filtri."}</div></td></tr>`;
    }
    return items.map((item) => `
      <tr>
        <td><span class="table-status ${item.material_origin === "fornitore" ? "hold" : "done"}">${item.material_origin === "fornitore" ? "Fornitore" : "MMS"}</span></td>
        <td>${escapeHtml(itemMainCode(item) || item.sku || "-")}</td>
        <td><strong>${escapeHtml(item.name || item.product)}</strong><div class="muted">${escapeHtml(item.notes || "")}</div></td>
        <td>${escapeHtml(item.supplier_name || "-")}<div class="muted">${escapeHtml(item.supplier_material_code || "")}</div></td>
        <td>${escapeHtml(item.category || "-")}</td>
        <td>${escapeHtml(item.available_quantity ?? item.available ?? 0)}</td>
        <td>${escapeHtml(item.unit || "-")}</td>
        <td><span class="table-status ${getStatusClass(item.status || "Disponibile")}">${escapeHtml(item.status || "Disponibile")}</span></td>
        <td><button class="mini-btn" data-inventory-edit="${escapeHtml(item.id)}" type="button">Modifica</button></td>
      </tr>
    `).join("");
  }

  renderInventory = function renderInventoryDatabaseManager() {
    ensureInventoryState();
    const items = filteredInventoryItems();
    const suppliers = uniqueValues(appData.inventory, "supplier_name");
    const categories = uniqueValues(appData.inventory, "category");
    const filters = appState.inventoryFilters;
    const draft = appState.inventoryDraft;
    const editing = !!draft.id;

    return `
      <section class="view ${appState.currentView === "inventory" ? "active" : ""}">
        <div class="screen-header">
          <div>
            <h2>Magazzino materiali</h2>
            <p>Archivio unico su database per materiali MMS e prodotti fornitore, pronto per preventivi e ordini.</p>
          </div>
          <div class="screen-actions">
            <div class="ghost-pill">${appData.inventory.length} materiali</div>
            <button class="action-pill" data-inventory-toggle-import type="button">${appState.inventoryImportOpen ? "Chiudi import" : "Importa CSV"}</button>
            <button class="action-pill" data-inventory-export type="button">Esporta CSV</button>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            <div class="filter-row" style="grid-template-columns:minmax(220px,1.5fr) auto minmax(150px,1fr) minmax(150px,1fr) minmax(150px,1fr);">
              <input class="filter-chip" data-inventory-filter="pendingQuery" value="${escapeHtml(filters.pendingQuery)}" placeholder="Cerca materiale, codice o fornitore" />
              <button class="action-pill" data-inventory-search type="button">Cerca</button>
              <select class="filter-chip" data-inventory-filter="origin">
                <option value="all" ${filters.origin === "all" ? "selected" : ""}>Tutte le origini</option>
                <option value="mms" ${filters.origin === "mms" ? "selected" : ""}>Solo MMS</option>
                <option value="fornitore" ${filters.origin === "fornitore" ? "selected" : ""}>Solo fornitori</option>
              </select>
              <select class="filter-chip" data-inventory-filter="supplier">
                <option value="all" ${filters.supplier === "all" ? "selected" : ""}>Tutti i fornitori</option>
                ${suppliers.map((supplier) => `<option value="${escapeHtml(supplier)}" ${filters.supplier === supplier ? "selected" : ""}>${escapeHtml(supplier)}</option>`).join("")}
              </select>
              <select class="filter-chip" data-inventory-filter="category">
                <option value="all" ${filters.category === "all" ? "selected" : ""}>Tutte le categorie</option>
                ${categories.map((category) => `<option value="${escapeHtml(category)}" ${filters.category === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
              </select>
            </div>
          </div>
        </div>

        <div style="display:grid; gap:16px;">
          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>${editing ? "Modifica materiale" : "Carica materiale"}</h3>
                  <p>Salva un prodotto MMS o fornitore. Dal prossimo step questi prodotti saranno selezionabili dentro preventivi e ordini.</p>
                </div>
                <div class="pill-row">
                  <button class="mini-btn" data-inventory-new type="button">Nuovo</button>
                  <button class="action-pill" data-inventory-save type="button">${appState.busy ? "Salvataggio..." : "Salva materiale"}</button>
                </div>
              </div>
              <div class="form-grid">
                <div class="field span-2"><label>Nome materiale</label><input class="field-value" data-inventory-draft="name" value="${escapeHtml(draft.name)}" placeholder="es. Tessuto lino nero" /></div>
                <div class="field"><label>Origine</label><select class="filter-chip" data-inventory-draft="material_origin"><option value="mms" ${draft.material_origin !== "fornitore" ? "selected" : ""}>Materiale MMS</option><option value="fornitore" ${draft.material_origin === "fornitore" ? "selected" : ""}>Fornitore</option></select></div>
                <div class="field"><label>Categoria</label><input class="field-value" data-inventory-draft="category" value="${escapeHtml(draft.category)}" /></div>
                <div class="field"><label>Codice MMS</label><input class="field-value" data-inventory-draft="mms_code" value="${escapeHtml(draft.mms_code)}" placeholder="es. MMS-TESSUTO-001" /></div>
                <div class="field"><label>Fornitore</label><input class="field-value" data-inventory-draft="supplier_name" value="${escapeHtml(draft.supplier_name)}" placeholder="Nome fornitore" /></div>
                <div class="field"><label>Codice fornitore</label><input class="field-value" data-inventory-draft="supplier_material_code" value="${escapeHtml(draft.supplier_material_code)}" /></div>
                <div class="field"><label>Unita'</label><input class="field-value" data-inventory-draft="unit" value="${escapeHtml(draft.unit)}" placeholder="m, pz, kg..." /></div>
                <div class="field"><label>Disponibile</label><input class="field-value" data-inventory-draft="available_quantity" value="${escapeHtml(draft.available_quantity)}" /></div>
                <div class="field"><label>Impegnato</label><input class="field-value" data-inventory-draft="reserved_quantity" value="${escapeHtml(draft.reserved_quantity)}" /></div>
                <div class="field"><label>Soglia riordino</label><input class="field-value" data-inventory-draft="reorder_threshold" value="${escapeHtml(draft.reorder_threshold)}" /></div>
                <div class="field"><label>Stato</label><input class="field-value" data-inventory-draft="status" value="${escapeHtml(draft.status)}" /></div>
                <div class="field span-2"><label>Note</label><textarea class="field-value" data-inventory-draft="notes" style="min-height:82px; align-items:flex-start; padding-top:12px;">${escapeHtml(draft.notes)}</textarea></div>
              </div>
            </div>
          </div>

          ${
            appState.inventoryImportOpen
              ? `
                <div class="surface">
                  <div class="surface-inner">
                    <div class="section-title">
                      <div>
                        <h3>Import prodotti</h3>
                        <p>Formato: nome;origine;fornitore;codice_fornitore;codice_mms;categoria;quantita;unita;stato;note</p>
                      </div>
                      <button class="mini-btn" data-inventory-import-action type="button">Importa righe</button>
                    </div>
                    <textarea class="field-value" data-inventory-import style="min-height:96px; align-items:flex-start; padding-top:12px;" placeholder="Tessuto cotone;mms;;;MMS-COT-001;Tessuti;20;m;Disponibile;Scorta iniziale"></textarea>
                  </div>
                </div>
              `
              : ""
          }

          <div class="surface">
            <div class="surface-inner">
              <div class="section-title">
                <div>
                  <h3>Materiali salvati</h3>
                  <p>Filtra per fornitore per vedere tutti i suoi prodotti.</p>
                </div>
                <div class="ghost-pill">${items.length} risultati</div>
              </div>
              <div style="overflow-x:auto; width:100%;">
                <table style="min-width:980px;">
                  <thead>
                    <tr>
                      <th>Origine</th>
                      <th>Codice</th>
                      <th>Materiale</th>
                      <th>Fornitore</th>
                      <th>Categoria</th>
                      <th>Disp.</th>
                      <th>Unita'</th>
                      <th>Stato</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>${inventoryRowsMarkup(items)}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  };

  function attachInventoryEvents() {
    if (appState.currentView !== "inventory") return;
    ensureInventoryState();
    document.querySelectorAll("[data-inventory-filter]").forEach((input) => {
      const handler = (event) => {
        appState.inventoryFilters[event.target.dataset.inventoryFilter] = event.target.value;
        if (event.target.dataset.inventoryFilter !== "pendingQuery") renderApp();
      };
      input.oninput = handler;
      input.onchange = handler;
    });
    document.querySelectorAll("[data-inventory-search]").forEach((button) => {
      button.onclick = () => {
        appState.inventoryFilters.query = appState.inventoryFilters.pendingQuery || "";
        renderApp();
      };
    });
    document.querySelectorAll("[data-inventory-draft]").forEach((input) => {
      const handler = (event) => {
        appState.inventoryDraft[event.target.dataset.inventoryDraft] = event.target.value;
      };
      input.oninput = handler;
      input.onchange = handler;
    });
    document.querySelectorAll("[data-inventory-edit]").forEach((button) => {
      button.onclick = () => {
        const item = appData.inventory.find((entry) => String(entry.id) === String(button.dataset.inventoryEdit));
        if (item) {
          appState.inventoryDraft = draftFromItem(item);
          renderApp();
        }
      };
    });
    document.querySelectorAll("[data-inventory-new]").forEach((button) => {
      button.onclick = () => {
        appState.inventoryDraft = { ...DEFAULT_DRAFT };
        renderApp();
      };
    });
    document.querySelectorAll("[data-inventory-save]").forEach((button) => {
      button.onclick = () => {
        if (!appState.busy) saveInventoryDraft();
      };
    });
    document.querySelectorAll("[data-inventory-toggle-import]").forEach((button) => {
      button.onclick = () => {
        appState.inventoryImportOpen = !appState.inventoryImportOpen;
        renderApp();
      };
    });
    document.querySelectorAll("[data-inventory-import-action]").forEach((button) => {
      button.onclick = () => {
        if (!appState.busy) importInventoryRows();
      };
    });
    document.querySelectorAll("[data-inventory-export]").forEach((button) => {
      button.onclick = exportInventoryCsv;
    });
  }

  const baseRenderAppInventoryDatabase = renderApp;
  renderApp = function renderAppWithInventoryDatabase() {
    baseRenderAppInventoryDatabase();
    attachInventoryEvents();
    if (appState.currentView === "inventory" && !inventoryLoaded && !inventoryLoading) {
      loadInventory(true).then(() => {
        if (appState.currentView === "inventory") renderApp();
      });
    }
  };

  ensureInventoryState();
  loadInventory().then(() => {
    if (appState.currentView === "inventory") renderApp();
  });
})();
